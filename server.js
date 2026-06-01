require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const db = require('./db');
const cache = require('./cache');
const cacheKeys = require('./cache/keys');

const app = express();
const PORT = process.env.PORT || 3000;

// Keycloak JWT validation
const KEYCLOAK_ISSUER = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`;
const JWKS = createRemoteJWKSet(new URL(`${KEYCLOAK_ISSUER}/protocol/openid-connect/certs`));

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWKS, { issuer: KEYCLOAK_ISSUER });
    req.user = payload;
    next();
  } catch (err) {
    console.error('[Auth] Token validation failed:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Enable CORS and parsing of JSON bodies
app.use(cors());
app.use(express.json());

// Serve static files from /public directory
app.use(express.static(path.join(__dirname, 'public')));

// Unauthenticated health check endpoint (defined BEFORE auth middleware)
app.get('/health', async (req, res) => {
  const pgHealthy = await db.checkHealth();
  const valkeyHealthy = await cache.checkHealth();
  
  if (pgHealthy && valkeyHealthy) {
    return res.status(200).json({
      status: 'ok',
      postgres: true,
      valkey: true
    });
  } else {
    return res.status(500).json({
      status: 'unhealthy',
      postgres: pgHealthy,
      valkey: valkeyHealthy
    });
  }
});

// Protect all API routes
app.use('/api', requireAuth);

// Helper functions for properties & email templates caching
async function getPropertiesList() {
  let list = await cache.getJSON(cacheKeys.PROPERTIES_LIST);
  if (!list) {
    console.log('[Cache] PROPERTIES_LIST miss. Fetching from database...');
    const res = await db.query('SELECT * FROM properties');
    list = res.rows;
    await cache.setJSON(cacheKeys.PROPERTIES_LIST, list, 300);
  }
  return list;
}

async function getEmailTemplatesList() {
  let list = await cache.getJSON(cacheKeys.EMAIL_TEMPLATES_LIST);
  if (!list) {
    console.log('[Cache] EMAIL_TEMPLATES_LIST miss. Fetching from database...');
    const res = await db.query('SELECT * FROM email_templates');
    list = res.rows.map(row => ({
      id: row.id,
      label: row.label,
      from: row.from_address, // Map from_address back to 'from' for frontend compatibility
      subject: row.subject,
      body: row.body
    }));
    await cache.setJSON(cacheKeys.EMAIL_TEMPLATES_LIST, list, 600);
  }
  return list;
}

// ============================================================
// Email Parsing Intelligence
// ============================================================

/**
 * Extracts structured work order data from raw email content.
 * Uses regex patterns and keyword matching to identify:
 *  - Property address
 *  - Apartment number (or common area flag)
 *  - Issue description
 *  - Master key permission
 *  - Special notes
 *  - Phone number
 *  - Urgency indicators
 */
function parseEmailToWorkOrder(email, properties) {
  const { from, subject, body } = email;
  const fullText = `${subject}\n${body}`;
  const lowerText = fullText.toLowerCase();

  // --- Address extraction ---
  // Match known property addresses first
  let detectedAddress = null;
  for (const prop of properties) {
    if (lowerText.includes(prop.address.toLowerCase())) {
      detectedAddress = prop.address;
      break;
    }
  }
  // Fallback: try to find address-like patterns (Finnish street names)
  if (!detectedAddress) {
    const addressPatterns = [
      /(?:address|property|at|osoite)[:\s]*([A-ZÄÖÅa-zäöå]+(?:katu|tie|vägen|gatan|gränden|väg|intie|inkatu)\s*\d+[\s,]*[A-Za-zÄÖÅäöå]*)/i,
      /([A-ZÄÖÅa-zäöå]+(?:katu|tie|vägen|gatan|gränden|väg|intie|inkatu)\s*\d+[\s,]+(?:Helsinki|Espoo|Vantaa|Tampere|Turku))/i
    ];
    for (const pattern of addressPatterns) {
      const match = fullText.match(pattern);
      if (match) {
        detectedAddress = match[1].trim();
        break;
      }
    }
  }

  // --- Apartment number extraction ---
  let apartmentNumber = null;
  let isCommonArea = false;
  const aptPatterns = [
    /(?:apartment|apt\.?|asunto|huoneisto)[:\s#]*([A-Za-z]?\d+[A-Za-z]?)/i,
    /(?:apartment number|apt number)[:\s]*([A-Za-z0-9]+)/i
  ];
  for (const pattern of aptPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      apartmentNumber = match[1].trim();
      break;
    }
  }

  // Check if common area
  const commonAreaKeywords = ['common area', 'shared area', 'stairwell', 'hallway', 'parking area', 'lobby', 'yard', 'elevator', 'yhteinen', 'porraskäytävä'];
  if (commonAreaKeywords.some(kw => lowerText.includes(kw))) {
    isCommonArea = true;
    apartmentNumber = 'Common Area';
  }

  // --- Issue description extraction ---
  // Extract from subject first, then look for problem description in body
  let issueDescription = subject.replace(/^(?:re:|fwd?:|urgent:)\s*/i, '').trim();
  const problemPatterns = [
    /(?:problem|issue|fault|vika)[:\s]*(.+?)(?:\n|$)/i,
    /(?:issue|problem)[:\s]*(.+?)(?:\n|$)/i
  ];
  for (const pattern of problemPatterns) {
    const match = body.match(pattern);
    if (match) {
      issueDescription = match[1].trim();
      break;
    }
  }

  // --- Master key permission ---
  let permitMasterKey = false;
  const masterKeyPatterns = [
    /master key (?:can be used|is? (?:ok|permitted|allowed|fine))/i,
    /(?:can|may) use (?:the )?master key/i,
    /yleisavain.{0,20}(?:saa|voi)/i
  ];
  if (masterKeyPatterns.some(p => p.test(fullText))) {
    permitMasterKey = true;
  }

  // --- Special notes extraction ---
  let specialNotes = [];
  // Look for pet mentions
  const petMatch = fullText.match(/(?:I have|there is|there's|please note)[:\s]*(a (?:dog|cat|pet).+?)(?:\.|$)/im);
  if (petMatch) specialNotes.push(petMatch[1].trim());

  // Look for availability/time constraints
  const timeMatch = fullText.match(/(?:available|I am available|availability)[:\s]*(.+?)(?:\.|$)/im);
  if (timeMatch) specialNotes.push(`Availability: ${timeMatch[1].trim()}`);

  // Look for gate/door codes
  const codeMatch = fullText.match(/(?:gate|door) code[:\s]*(\S+)/i);
  if (codeMatch) specialNotes.push(`Access code: ${codeMatch[1].trim()}`);

  // --- Phone number extraction ---
  let callerPhone = null;
  const phonePatterns = [
    /(?:phone|tel|puhelin|p\.?)[:\s]*((?:\+?\d[\d\s\-]{8,})\d)/i,
    /(\+358[\s\d\-]{9,})/
  ];
  for (const pattern of phonePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      callerPhone = match[1].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // --- Urgency detection ---
  let urgencyLevel = 'Standard';
  const urgentKeywords = ['urgent', 'emergency', 'asap', 'immediately', 'flooding', 'fire', 'gas leak', 'kiireellinen', 'hätä'];
  if (urgentKeywords.some(kw => lowerText.includes(kw))) {
    urgencyLevel = 'Urgent';
  }

  return {
    property_address: detectedAddress || 'UNKNOWN — Requires manual review',
    apartment_number: apartmentNumber || (isCommonArea ? 'Common Area' : 'N/A'),
    is_common_area: isCommonArea,
    issue_description: issueDescription,
    permit_master_key: permitMasterKey,
    special_notes: specialNotes.join('; ') || '',
    caller_phone_number: callerPhone || from,
    urgency_level: urgencyLevel,
    sender_email: from
  };
}

// ============================================================
// REST API Endpoints
// ============================================================

// 1. Get properties database
app.get('/api/properties', async (req, res) => {
  try {
    const properties = await getPropertiesList();
    res.json(properties);
  } catch (err) {
    console.error('Error fetching properties:', err);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Helper for cached work orders
async function getWorkOrdersList() {
  let list = await cache.getJSON(cacheKeys.WORK_ORDERS_LIST);
  if (!list) {
    console.log('[Cache] WORK_ORDERS_LIST miss. Fetching from database...');
    const res = await db.query('SELECT * FROM work_orders ORDER BY created_at DESC');
    list = res.rows;
    await cache.setJSON(cacheKeys.WORK_ORDERS_LIST, list, 60);
  }
  return list;
}

// 2. Get active work orders
app.get('/api/work-orders', async (req, res) => {
  try {
    const workOrders = await getWorkOrdersList();
    res.json(workOrders);
  } catch (err) {
    console.error('Error fetching work orders:', err);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

// 3. Create a new work order (ERP system entry)
app.post('/api/work-orders', async (req, res) => {
  const {
    property_address,
    apartment_number,
    is_common_area,
    issue_description,
    permit_master_key,
    special_notes,
    caller_phone_number,
    urgency_level = 'Standard',
    source = 'voice',
    call_category = 'fault_report',
    transcript_id = null,
    sender_email = null
  } = req.body;

  if (!property_address || !issue_description || !caller_phone_number) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Find responsible technician for property
    const properties = await getPropertiesList();
    const property = properties.find(p => 
      p.address.toLowerCase().includes(property_address.toLowerCase())
    );

    const technicianName = property ? property.technician : 'Pekka Puupää';
    const technicianPhone = property ? property.technician_phone : '+358 50 555 6666';

    // Rule-based scheduling logic:
    // - Urgent issues are scheduled for immediate dispatch (within 2 hours)
    // - Standard issues scheduled for next day at 9:00 AM
    let scheduledTime = '';
    if (urgency_level.toLowerCase() === 'urgent') {
      scheduledTime = 'Immediate (Within 2 Hours)';
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      scheduledTime = `${tomorrow.toLocaleDateString('en-US', { weekday: 'long' })}, 9:00 AM`;
    }

    const newId = `WO-${Math.floor(1000 + Math.random() * 9000)}`;

    const queryText = `
      INSERT INTO work_orders (
        id, property_address, apartment_number, is_common_area, issue_description,
        permit_master_key, special_notes, caller_phone_number, urgency_level,
        technician, technician_phone, status, scheduled_time, source,
        call_category, transcript_id, sender_email, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;

    const values = [
      newId,
      property_address,
      is_common_area ? 'Common Area' : (apartment_number || 'N/A'),
      !!is_common_area,
      issue_description,
      !!permit_master_key,
      special_notes || '',
      caller_phone_number,
      urgency_level,
      technicianName,
      technicianPhone,
      'Assigned',
      scheduledTime,
      source,
      call_category,
      transcript_id,
      sender_email,
      new Date().toISOString()
    ];

    const insertRes = await db.query(queryText, values);
    const newWorkOrder = insertRes.rows[0];

    // Invalidate work orders cache
    await cache.invalidate(cacheKeys.WORK_ORDERS_LIST);

    console.log(`[ERP] Work Order ${newId} created (source: ${source}):`, newWorkOrder);
    res.status(201).json(newWorkOrder);
  } catch (err) {
    console.error('Failed to create work order:', err);
    res.status(500).json({ error: 'Failed to create work order' });
  }
});

// 4. Session endpoint: Creates ephemeral client secret for WebRTC client connection
app.post('/api/session', async (req, res) => {
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  let azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const standardKey = process.env.OPENAI_API_KEY;

  const isAzure = !!(azureKey && azureEndpoint);

  if (!isAzure && (!standardKey || standardKey === 'YOUR_OPENAI_API_KEY_HERE')) {
    console.warn('[Session] Warning: API key is missing or set to placeholder.');
    return res.status(400).json({
      error: 'API key is missing. Please configure AZURE_OPENAI_API_KEY or OPENAI_API_KEY in your .env file.'
    });
  }

  // ============================================================
  // ENHANCED Agent System Instructions — Full Easoft Workflow
  // ============================================================
  const systemInstructions = `
Your name is 'Kiinteistö-Agent' (Property Assistant), an efficient, highly proactive, friendly, and professional voice agent for Property Maintenance. You receive incoming calls, guide the caller step-by-step, and process maintenance work orders.

The caller's phone number is '+358 40 123 4567'. Use this automatically for work order creation and confirmations unless they explicitly ask you to use a different phone number.

PROACTIVE GUIDANCE PRINCIPLE:
Be extremely proactive. Do not wait for the caller to guess what to do next. Introduce your capabilities immediately, and guide them through each step of the process. If they hesitate, give them clear, polite suggestions or ask direct questions to retrieve the next needed detail.

CALL CATEGORIES — Identify the reason for the call:
- FAULT REPORT / MAINTENANCE REQUEST → Follow the full work order creation flow below.
- DOOR OPENING → Ask for address, apartment number, verify identity, then create a work order with call_category 'door_opening'.
- KEY LOAN → Ask for address, apartment number, duration of loan, then create a work order with call_category 'key_loan'.
- URGENT / EMERGENCY → If the caller reports an active threat to life or property (major water flooding, fire, gas leak, electrical hazard), call 'escalate_to_operator' IMMEDIATELY and inform the caller they are being transferred to the 24/7 emergency line.

Follow these steps strictly for FAULT REPORT calls:
1. GREETING & INTRODUCE CAPABILITIES: Greet the customer professionally and immediately state what you can do.
   - Example: "Welcome to Property Maintenance Support. I am your automated voice assistant, Kiinteistö-Agent. I can register your fault reports, arrange door openings, key loans, or transfer you to emergency services. How can I assist you today?"
   - Offer options if appropriate: fault report/maintenance request, door opening, key loan, urgent issue (human transfer).

2. ADDRESS IDENTIFICATION: Ask the caller for their street address or the name of the property.
   - Once they provide an address, call 'get_maintenance_person' immediately to find out who the responsible technician is. Use this info to personalize the interaction (e.g., "Great, I see Matti Meikäläinen handles maintenance for Mannerheimintie 10.").

3. CLARIFICATIONS: Guide the caller by asking for the following details, one by one:
   - Whether the issue is in a common area or an apartment. If in an apartment, ask for the apartment number.
   - A clear description of the problem.
   - Whether use of the master key is permitted.
   - If there are special things to consider (like a dog, children, or gate codes).
   - If they have any additional issues.
   - Confirm if they want a confirmation text message.

4. SUMMARIZE AND CONFIRM: Summarize all details back to the caller clearly: Address, Apartment, Problem description, Master key permission, and Phone number.
   - Ask: "Is all of this correct?"

5. CREATE WORK ORDER: Once they confirm, call 'create_work_order' immediately with call_category='fault_report' and source='voice'. Explain that you are entering this into the ERP system. Note the work_order_id returned by the system.

6. SEND CONFIRMATION: Call 'send_sms_confirmation' with the work order details to send the SMS. Verbally inform the caller that the ticket has been created and assigned to [Technician Name] who will arrive at [Scheduled Time], and that they will receive an SMS shortly.

7. SAVE TRANSCRIPT: After confirming the work order, call 'save_call_transcript' with a brief summary of the conversation and the linked work order ID.

8. Wrap up the call politely.

For DOOR OPENING calls:
- Ask for address and apartment number
- Ask for the reason and verify identity
- Create work order with call_category='door_opening'
- Inform technician will be dispatched

For KEY LOAN calls:
- Ask for address and apartment number
- Ask for the duration and purpose of the loan
- Create work order with call_category='key_loan'
- Inform of the collection process

Remain conversational, highly helpful, and speak natural, standard English. Keep your responses short and punchy as this is a voice phone call!
`;

  const tools = [
    {
      type: 'function',
      name: 'get_maintenance_person',
      description: 'Retrieves the name and contact info of the responsible maintenance technician for a given property address.',
      parameters: {
        type: 'object',
        properties: {
          property_address: {
            type: 'string',
            description: 'The street address of the housing company/property, e.g., Mannerheimintie 10, Helsinki.'
          }
        },
        required: ['property_address']
      }
    },
    {
      type: 'function',
      name: 'create_work_order',
      description: 'Creates a new maintenance work order in the ERP system. Use this once you have gathered all clarifications (address, apartment, issue details, master key permit, special notes, caller phone).',
      parameters: {
        type: 'object',
        properties: {
          property_address: {
            type: 'string',
            description: 'The confirmed property address.'
          },
          apartment_number: {
            type: 'string',
            description: 'The apartment number, or "Common Area" if the issue is in a shared space.'
          },
          is_common_area: {
            type: 'boolean',
            description: 'True if the issue is in a common area (lobby, stairwell, yard), false if in a specific apartment.'
          },
          issue_description: {
            type: 'string',
            description: 'A detailed description of the problem reported by the caller.'
          },
          permit_master_key: {
            type: 'boolean',
            description: 'True if the caller permits using the master key to enter the premises, false otherwise.'
          },
          special_notes: {
            type: 'string',
            description: 'Any special instructions or hazards to take into account (e.g., dog in apartment, gate code, caller\'s working hours).'
          },
          caller_phone_number: {
            type: 'string',
            description: 'The caller\'s phone number.'
          },
          urgency_level: {
            type: 'string',
            enum: ['Standard', 'Urgent'],
            description: 'The urgency of the issue. Use Urgent only for active leaks, lockouts, or safety hazards.'
          },
          call_category: {
            type: 'string',
            enum: ['fault_report', 'door_opening', 'key_loan'],
            description: 'The category of the call.'
          }
        },
        required: ['property_address', 'is_common_area', 'issue_description', 'permit_master_key', 'caller_phone_number']
      }
    },
    {
      type: 'function',
      name: 'send_sms_confirmation',
      description: 'Sends a final SMS confirmation to the caller\'s phone and records the communication in the history.',
      parameters: {
        type: 'object',
        properties: {
          caller_phone_number: {
            type: 'string',
            description: 'The phone number to send the SMS to.'
          },
          work_order_id: {
            type: 'string',
            description: 'The ID of the created work order.'
          },
          message_content: {
            type: 'string',
            description: 'A polite confirmation message containing the work order summary, the responsible technician\'s name, and the scheduled time.'
          }
        },
        required: ['caller_phone_number', 'work_order_id', 'message_content']
      }
    },
    {
      type: 'function',
      name: 'escalate_to_operator',
      description: 'Escalates the call to a human operator for 24/7 emergency handling. Use ONLY when the caller reports an active life-threatening or property-threatening emergency (fire, major flooding, gas leak).',
      parameters: {
        type: 'object',
        properties: {
          caller_phone_number: {
            type: 'string',
            description: 'The caller\'s phone number.'
          },
          reason: {
            type: 'string',
            description: 'Brief description of the emergency reason for escalation.'
          },
          property_address: {
            type: 'string',
            description: 'The property address if already identified.'
          }
        },
        required: ['caller_phone_number', 'reason']
      }
    },
    {
      type: 'function',
      name: 'save_call_transcript',
      description: 'Saves a summary of the call conversation for records. Call this at the end of each call.',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'A brief summary of the call, including the issue reported, address, and resolution.'
          },
          linked_work_order: {
            type: 'string',
            description: 'The work order ID created during this call, if any.'
          },
          call_category: {
            type: 'string',
            enum: ['fault_report', 'door_opening', 'key_loan', 'urgent_transfer', 'general_inquiry'],
            description: 'The category of this call.'
          }
        },
        required: ['summary', 'call_category']
      }
    }
  ];

  try {
    if (isAzure) {
      console.log('[Session] Using Azure OpenAI Realtime API...');
      
      // Clean up endpoint trailing slash if any and map services.ai.azure.com to openai.azure.com for GA endpoint
      let cleanedEndpoint = azureEndpoint.replace(/\/$/, '');
      if (cleanedEndpoint.includes('services.ai.azure.com')) {
        cleanedEndpoint = cleanedEndpoint.replace('services.ai.azure.com', 'openai.azure.com');
      }
      
      const fetchUrl = `${cleanedEndpoint}/openai/v1/realtime/client_secrets`;
      
      console.log(`[Session] POST Request to: ${fetchUrl}`);
      const response = await fetch(fetchUrl, {
        method: 'POST',
        headers: {
          'api-key': azureKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session: {
            type: 'realtime', // CRITICAL: Required by Azure OpenAI GA to avoid InvalidSessionType error
            model: 'gpt-realtime-2' // The deployed model name
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Session] Azure OpenAI API error:', errorText);
        return res.status(response.status).json({
          error: 'Error from Azure OpenAI Realtime API',
          details: errorText
        });
      }

      const data = await response.json();
      console.log('[Session] Azure Ephemeral token successfully generated.');
      
      res.json({
        client_secret: {
          value: data.value // In Azure GA, the ephemeral token is flat at 'data.value'
        },
        connection_url: `${cleanedEndpoint}/openai/v1/realtime/calls`,
        is_azure: true,
        session_config: {
          type: 'realtime',
          instructions: systemInstructions,
          tools: tools,
          output_modalities: ['audio'],
          audio: {
            input: {
              transcription: {
                model: 'whisper-1'
              }
            },
            output: {
              voice: 'alloy'
            }
          }
        }
      });
      
    } else {
      console.log('[Session] Using standard OpenAI Realtime API...');
      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${standardKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-realtime-2',
          output_modalities: ['audio'],
          instructions: systemInstructions,
          audio: {
            input: {
              transcription: {
                model: 'whisper-1'
              }
            },
            output: {
              voice: 'alloy'
            }
          },
          tools: tools
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Session] OpenAI API error:', errorText);
        return res.status(response.status).json({
          error: 'Error from OpenAI Realtime API',
          details: errorText
        });
      }

      const data = await response.json();
      console.log('[Session] OpenAI Ephemeral token successfully generated.');
      
      res.json({
        client_secret: data.client_secret,
        connection_url: 'https://api.openai.com/v1/realtime?model=gpt-realtime-2',
        is_azure: false
      });
    }
  } catch (error) {
    console.error('[Session] Network or unexpected error:', error);
    res.status(500).json({ error: 'Internal server error creating session' });
  }
});

// 5. Update a work order (status or details)
app.put('/api/work-orders/:id', async (req, res) => {
  const { id } = req.params;
  const { status, urgency_level } = req.body;
  
  try {
    // Fetch current work order first to get existing scheduled_time/urgency
    const currentWoRes = await db.query('SELECT * FROM work_orders WHERE id = $1', [id]);
    if (currentWoRes.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    const currentWo = currentWoRes.rows[0];
    let newStatus = status || currentWo.status;
    let newUrgency = urgency_level || currentWo.urgency_level;
    let newScheduledTime = currentWo.scheduled_time;
    
    if (urgency_level && urgency_level.toLowerCase() !== currentWo.urgency_level.toLowerCase()) {
      if (urgency_level.toLowerCase() === 'urgent') {
        newScheduledTime = 'Immediate (Within 2 Hours)';
      } else {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        newScheduledTime = `${tomorrow.toLocaleDateString('en-US', { weekday: 'long' })}, 9:00 AM`;
      }
    }
    
    const updateRes = await db.query(`
      UPDATE work_orders
      SET status = $1, urgency_level = $2, scheduled_time = $3
      WHERE id = $4
      RETURNING *
    `, [newStatus, newUrgency, newScheduledTime, id]);
    
    // Invalidate cache
    await cache.invalidate(cacheKeys.WORK_ORDERS_LIST);
    
    console.log(`[ERP] Work Order ${id} updated:`, updateRes.rows[0]);
    res.json(updateRes.rows[0]);
  } catch (err) {
    console.error(`Error updating work order ${id}:`, err);
    res.status(500).json({ error: 'Failed to update work order' });
  }
});

// 6. Delete a work order
app.delete('/api/work-orders/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const deleteRes = await db.query('DELETE FROM work_orders WHERE id = $1 RETURNING id', [id]);
    if (deleteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Work order not found' });
    }
    
    // Invalidate cache
    await cache.invalidate(cacheKeys.WORK_ORDERS_LIST);
    
    console.log(`[ERP] Work Order ${id} deleted.`);
    res.json({ success: true, deleted_id: id });
  } catch (err) {
    console.error(`Error deleting work order ${id}:`, err);
    res.status(500).json({ error: 'Failed to delete work order' });
  }
});

// ============================================================
// COMMUNICATIONS & EMAIL AGENT
// ============================================================

// 7. Get communications history
app.get('/api/communications', async (req, res) => {
  const { type } = req.query;
  
  try {
    let queryText = 'SELECT * FROM communications';
    let values = [];
    
    if (type) {
      queryText += ' WHERE type = $1';
      values.push(type);
    }
    
    queryText += ' ORDER BY timestamp DESC';
    
    const result = await db.query(queryText, values);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching communications:', err);
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

// 8. Create a communication record (transcript, SMS, email record)
app.post('/api/communications', async (req, res) => {
  const {
    type,
    linked_work_order = null,
    caller_phone = null,
    recipient_phone = null,
    summary = '',
    transcript = [],
    message = '',
    call_category = 'fault_report',
    duration_seconds = 0,
    sender_email = null,
    original_email = null,
    extracted_data = null,
    status = null,
    reason = null,
    property_address = null
  } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Communication type is required' });
  }

  const newId = `COM-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const queryText = `
      INSERT INTO communications (
        id, type, timestamp, linked_work_order, caller_phone, recipient_phone,
        summary, transcript, message, call_category, duration_seconds,
        sender_email, original_email, extracted_data, status, reason, property_address
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `;

    const values = [
      newId,
      type,
      new Date().toISOString(),
      linked_work_order,
      caller_phone,
      recipient_phone,
      summary,
      transcript ? JSON.stringify(transcript) : null,
      message,
      call_category,
      duration_seconds,
      sender_email,
      original_email ? JSON.stringify(original_email) : null,
      extracted_data ? JSON.stringify(extracted_data) : null,
      status || (type === 'sms_confirmation' ? 'sent' : type === 'email_intake' ? 'processed' : type === 'escalation' ? 'escalated' : null),
      reason,
      property_address
    ];

    const insertRes = await db.query(queryText, values);
    console.log(`[Comms] New ${type} record ${newId} stored.`);
    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Error creating communication record:', err);
    res.status(500).json({ error: 'Failed to save communication record' });
  }
});

// 9. Email intake endpoint — parses email and creates work order automatically using transaction
app.post('/api/email-intake', async (req, res) => {
  const { from, subject, body } = req.body;

  if (!from || !subject || !body) {
    return res.status(400).json({ error: 'Email must include from, subject, and body fields.' });
  }

  console.log(`[Email Agent] Processing email from: ${from}`);
  console.log(`[Email Agent] Subject: ${subject}`);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Fetch properties list for parser
    const properties = await getPropertiesList();

    // Step 1: Parse the email into structured data
    const extractedData = parseEmailToWorkOrder({ from, subject, body }, properties);
    console.log(`[Email Agent] Extracted data:`, extractedData);

    // Step 2: Find responsible technician
    const property = properties.find(p =>
      p.address.toLowerCase().includes(extractedData.property_address.toLowerCase())
    );
    const technicianName = property ? property.technician : 'Pekka Puupää';
    const technicianPhone = property ? property.technician_phone : '+358 50 555 6666';

    // Step 3: Scheduling logic
    let scheduledTime = '';
    if (extractedData.urgency_level.toLowerCase() === 'urgent') {
      scheduledTime = 'Immediate (Within 2 Hours)';
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      scheduledTime = `${tomorrow.toLocaleDateString('en-US', { weekday: 'long' })}, 9:00 AM`;
    }

    // Step 4: Create the work order
    const woId = `WO-${Math.floor(1000 + Math.random() * 9000)}`;
    const woQuery = `
      INSERT INTO work_orders (
        id, property_address, apartment_number, is_common_area, issue_description,
        permit_master_key, special_notes, caller_phone_number, urgency_level,
        technician, technician_phone, status, scheduled_time, source,
        call_category, transcript_id, sender_email, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      RETURNING *
    `;
    const woValues = [
      woId,
      extractedData.property_address,
      extractedData.apartment_number,
      extractedData.is_common_area,
      extractedData.issue_description,
      extractedData.permit_master_key,
      extractedData.special_notes,
      extractedData.caller_phone_number,
      extractedData.urgency_level,
      technicianName,
      technicianPhone,
      'Assigned',
      scheduledTime,
      'email',
      'fault_report',
      null,
      from,
      new Date().toISOString()
    ];
    
    const woRes = await client.query(woQuery, woValues);
    const newWorkOrder = woRes.rows[0];

    // Step 5: Log the email intake communication
    const commId = `COM-${Math.floor(1000 + Math.random() * 9000)}`;
    const commQuery = `
      INSERT INTO communications (
        id, type, timestamp, linked_work_order, sender_email,
        original_email, extracted_data, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;
    const commValues = [
      commId,
      'email_intake',
      new Date().toISOString(),
      woId,
      from,
      JSON.stringify({ from, subject, body }),
      JSON.stringify(extractedData),
      'processed'
    ];

    const commRes = await client.query(commQuery, commValues);
    const emailComm = commRes.rows[0];

    await client.query('COMMIT');

    // Invalidate work orders cache
    await cache.invalidate(cacheKeys.WORK_ORDERS_LIST);

    console.log(`[Email Agent] Work Order ${woId} created from email.`);
    console.log(`[Email Agent] Communication ${commId} logged.`);

    res.status(201).json({
      success: true,
      work_order: newWorkOrder,
      communication: emailComm,
      extraction_report: extractedData
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Email Agent] Transaction rolled back due to error:', err);
    res.status(500).json({ error: 'Failed to process email intake' });
  } finally {
    client.release();
  }
});

// 10. Escalation endpoint — logs emergency escalation events
app.post('/api/escalate', async (req, res) => {
  const { caller_phone, reason, property_address } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Escalation reason is required.' });
  }

  const commId = `COM-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    const queryText = `
      INSERT INTO communications (
        id, type, timestamp, caller_phone, reason, property_address, status, linked_work_order
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      commId,
      'escalation',
      new Date().toISOString(),
      caller_phone || 'Unknown',
      reason,
      property_address || 'Not identified',
      'escalated',
      null
    ];

    const insertRes = await db.query(queryText, values);
    console.log(`[ESCALATION] Emergency case ${commId}: ${reason}`);
    res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    console.error('Failed to log escalation event:', err);
    res.status(500).json({ error: 'Failed to log escalation event' });
  }
});

// 11. Get email templates (for demo UI)
app.get('/api/email-templates', async (req, res) => {
  try {
    const templates = await getEmailTemplatesList();
    res.json(templates);
  } catch (err) {
    console.error('Error fetching email templates:', err);
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

// Fallback to serve index.html for undefined frontend routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Startup health check and server initialization
async function startServer() {
  console.log('Performing startup connectivity checks...');
  
  const pgHealthy = await db.checkHealth();
  const valkeyHealthy = await cache.checkHealth();
  
  if (!pgHealthy) {
    console.error('CRITICAL: Failed to connect to PostgreSQL. Aborting server startup.');
    process.exit(1);
  }
  
  if (!valkeyHealthy) {
    console.error('CRITICAL: Failed to connect to Valkey. Aborting server startup.');
    process.exit(1);
  }
  
  console.log('All connectivity checks passed successfully.');
  
  const server = app.listen(PORT, () => {
    console.log(`=============================================================`);
    console.log(`  Kiinteistö-Agent Voice + Email POC Running At: http://localhost:${PORT}`);
    console.log(`=============================================================`);
  });
  
  // Graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
    
    server.close(() => {
      console.log('HTTP server closed.');
    });
    
    try {
      await cache.close();
      await db.close();
      console.log('Graceful shutdown completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('Error during graceful shutdown:', err);
      process.exit(1);
    }
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
