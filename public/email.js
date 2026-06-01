// ==========================================================================
// Email Agent — Enhanced with live customer resolution + rich UI
// ==========================================================================

let resolvedCustomer = null;
let lookupDebounce = null;
let processingStartTime = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  loadEmailTemplates();
  loadRecentProcessed();
  setupSenderLookup();
});

// --------------------------------------------------------------------------
// Live sender lookup (debounced as user types From address)
// --------------------------------------------------------------------------
function setupSenderLookup() {
  const fromInput = document.getElementById('email-from');
  fromInput.addEventListener('input', () => {
    clearTimeout(lookupDebounce);
    resolvedCustomer = null;
    clearSenderCard();
    const val = fromInput.value.trim();
    if (!val.includes('@') || val.length < 5) return;
    lookupDebounce = setTimeout(() => lookupSenderByEmail(val), 500);
  });
}

async function lookupSenderByEmail(email) {
  const card = document.getElementById('sender-info-card');
  card.innerHTML = `<div class="sender-loading"><i class="fa-solid fa-circle-notch fa-spin"></i> Looking up sender...</div>`;
  card.classList.add('visible');
  try {
    const res = await authFetch(`/api/customers/by-email/${encodeURIComponent(email)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.found) {
        resolvedCustomer = data.customer;
        renderSenderFoundCard(data.customer);
        // Auto-fill subject hint
        const subjectInput = document.getElementById('email-subject');
        if (!subjectInput.value) {
          subjectInput.placeholder = `e.g. Issue at ${data.customer.property_address}`;
        }
      } else {
        resolvedCustomer = null;
        renderSenderUnknownCard(email);
      }
    } else {
      resolvedCustomer = null;
      renderSenderUnknownCard(email);
    }
  } catch (err) {
    card.innerHTML = '';
    card.classList.remove('visible');
  }
}

function renderSenderFoundCard(c) {
  const card = document.getElementById('sender-info-card');
  const initials = c.full_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  card.innerHTML = `
    <div class="sender-card-inner sender-known">
      <div class="sender-avatar-wrap">
        <div class="sender-avatar">${initials}</div>
        <span class="sender-badge-known"><i class="fa-solid fa-circle-check"></i> Known Resident</span>
      </div>
      <div class="sender-info-grid">
        <div class="sender-info-row"><i class="fa-solid fa-user"></i><span>${c.full_name}</span></div>
        <div class="sender-info-row"><i class="fa-solid fa-phone"></i><span>${c.phone_number}</span></div>
        <div class="sender-info-row"><i class="fa-solid fa-location-dot"></i><span>${c.property_address}</span></div>
        <div class="sender-info-row"><i class="fa-solid fa-door-open"></i><span>Apt ${c.apartment_number || 'N/A'}</span></div>
        ${c.language_preference ? `<div class="sender-info-row"><i class="fa-solid fa-globe"></i><span>${c.language_preference}</span></div>` : ''}
        ${c.notes ? `<div class="sender-info-row sender-notes"><i class="fa-solid fa-note-sticky"></i><span>${c.notes}</span></div>` : ''}
      </div>
      <div class="sender-hint"><i class="fa-solid fa-bolt"></i> Address & apartment will be pre-filled by the AI from their profile.</div>
    </div>`;
}

function renderSenderUnknownCard(email) {
  const card = document.getElementById('sender-info-card');
  card.innerHTML = `
    <div class="sender-card-inner sender-unknown">
      <div class="sender-avatar-wrap">
        <div class="sender-avatar sender-avatar-unknown"><i class="fa-solid fa-user-question"></i></div>
        <span class="sender-badge-unknown"><i class="fa-solid fa-circle-exclamation"></i> Unknown Sender</span>
      </div>
      <div class="sender-unknown-msg">
        <p>No customer record found for <strong>${email}</strong>.</p>
        <p>The AI agent will attempt to extract their details from the email content. If a name and phone number are found, a new customer record will be <strong>auto-created</strong>.</p>
      </div>
    </div>`;
}

function clearSenderCard() {
  const card = document.getElementById('sender-info-card');
  card.innerHTML = '';
  card.classList.remove('visible');
}

// --------------------------------------------------------------------------
// Email Templates
// --------------------------------------------------------------------------
async function loadEmailTemplates() {
  try {
    const res = await authFetch('/api/email-templates');
    const templates = await res.json();
    renderEmailTemplateButtons(templates);
  } catch (err) { console.error('Failed to load templates:', err); }
}

function renderEmailTemplateButtons(templates) {
  const container = document.getElementById('email-template-buttons');
  if (!templates.length) {
    container.innerHTML = `<span style="color:var(--text-muted);font-size:12px;">No templates configured.</span>`;
    return;
  }
  container.innerHTML = templates.map(tpl => `
    <button class="btn-email-template" onclick='loadEmailTemplate(${JSON.stringify(tpl)})'>${tpl.label}</button>
  `).join('');
}

function loadEmailTemplate(tpl) {
  document.getElementById('email-from').value = tpl.from || '';
  document.getElementById('email-subject').value = tpl.subject || '';
  document.getElementById('email-body').value = tpl.body || '';
  document.getElementById('email-form').classList.add('template-loaded');
  setTimeout(() => document.getElementById('email-form').classList.remove('template-loaded'), 700);
  // Trigger sender lookup for the pre-filled from
  if (tpl.from) lookupSenderByEmail(tpl.from);
}

// --------------------------------------------------------------------------
// Submit Email
// --------------------------------------------------------------------------
async function submitEmail(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-email');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Processing with AI…</span>';
  processingStartTime = Date.now();
  showProcessingState();

  const payload = {
    from: document.getElementById('email-from').value.trim(),
    subject: document.getElementById('email-subject').value.trim(),
    body: document.getElementById('email-body').value.trim()
  };

  try {
    const res = await authFetch('/api/email-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    const elapsed = ((Date.now() - processingStartTime) / 1000).toFixed(1);
    if (res.ok) {
      renderExtractionResults(result, elapsed);
      addProcessedEmailEntry(result);
      document.getElementById('email-form').reset();
      clearSenderCard();
      resolvedCustomer = null;
    } else {
      showError(result.error || 'Processing failed.');
    }
  } catch (err) {
    showError(`Network error: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-robot"></i><span>Process with AI Email Agent</span>';
  }
}

function showProcessingState() {
  document.getElementById('email-results').innerHTML = `
    <div class="processing-state">
      <div class="processing-orb">
        <i class="fa-solid fa-brain"></i>
        <div class="processing-ring"></div>
      </div>
      <div class="processing-steps">
        <div class="proc-step active"><i class="fa-solid fa-envelope-open"></i> Parsing email content</div>
        <div class="proc-step"><i class="fa-solid fa-database"></i> Matching customer profile</div>
        <div class="proc-step"><i class="fa-solid fa-robot"></i> LLM extraction</div>
        <div class="proc-step"><i class="fa-solid fa-receipt"></i> Creating work order</div>
      </div>
    </div>`;
  // Animate steps
  let i = 0;
  const steps = document.querySelectorAll('.proc-step');
  const stepTimer = setInterval(() => {
    if (i > 0 && steps[i-1]) steps[i-1].classList.add('done');
    if (i < steps.length && steps[i]) steps[i].classList.add('active');
    i++;
    if (i > steps.length) clearInterval(stepTimer);
  }, 800);
}

function showError(msg) {
  document.getElementById('email-results').innerHTML = `
    <div class="extraction-error">
      <i class="fa-solid fa-circle-xmark"></i>
      <span>${msg}</span>
    </div>`;
}

// --------------------------------------------------------------------------
// Render extraction results
// --------------------------------------------------------------------------
function renderExtractionResults(result, elapsedSec) {
  const wo = result.work_order;
  const ex = result.extraction_report || {};
  if (!wo) return;

  const yesNo = v => v
    ? `<span class="ef-tag ef-tag-green"><i class="fa-solid fa-check"></i> YES</span>`
    : `<span class="ef-tag ef-tag-red"><i class="fa-solid fa-xmark"></i> NO</span>`;

  const urgencyColor = wo.urgency_level === 'Urgent' || wo.urgency_level === 'Emergency'
    ? 'var(--red-glow)' : 'var(--green-glow)';
  const urgencyIcon = wo.urgency_level === 'Urgent' || wo.urgency_level === 'Emergency'
    ? 'fa-triangle-exclamation' : 'fa-shield-check';

  const matchBadge = result.customer_matched
    ? `<span class="ef-match-badge ef-match-known"><i class="fa-solid fa-database"></i> Matched Customer</span>`
    : `<span class="ef-match-badge ef-match-new"><i class="fa-solid fa-user-plus"></i> New Customer${ex.resident_name ? ' Created' : ''}</span>`;

  const parsingBadge = `<span class="ef-parse-badge"><i class="fa-solid fa-${result.parsing_method === 'llm' || !result.parsing_method ? 'robot' : 'code'}"></i> ${result.parsing_method === 'llm' || !result.parsing_method ? 'AI Agent' : 'Regex Fallback'}</span>`;

  document.getElementById('email-results').innerHTML = `
    <div class="extraction-success">
      <div class="extraction-header">
        <div class="extraction-header-left">
          <div class="extraction-check-icon"><i class="fa-solid fa-circle-check"></i></div>
          <div>
            <strong>Work Order ${wo.id} Created</strong>
            <div class="extraction-meta-badges">
              ${matchBadge}
              ${parsingBadge}
              <span class="ef-parse-badge"><i class="fa-solid fa-timer"></i> ${elapsedSec}s</span>
            </div>
          </div>
        </div>
        <div class="urgency-tag" style="color:${urgencyColor};border-color:${urgencyColor}40;background:${urgencyColor}10;">
          <i class="fa-solid ${urgencyIcon}"></i> ${wo.urgency_level}
        </div>
      </div>

      ${result.known_customer ? `
      <div class="ef-customer-profile">
        <div class="ef-section-label"><i class="fa-solid fa-user-check"></i> Matched Resident Profile</div>
        <div class="ef-customer-row">
          <div class="ef-customer-avatar">${result.known_customer.full_name.split(' ').map(p=>p[0]).join('').toUpperCase().slice(0,2)}</div>
          <div>
            <div class="ef-customer-name">${result.known_customer.full_name}</div>
            <div class="ef-customer-sub">${result.known_customer.phone_number} · ${result.known_customer.email || ''}</div>
          </div>
        </div>
      </div>` : (ex.resident_name ? `
      <div class="ef-customer-profile ef-customer-new">
        <div class="ef-section-label"><i class="fa-solid fa-user-plus"></i> New Resident Extracted</div>
        <div class="ef-customer-row">
          <div class="ef-customer-avatar ef-customer-avatar-new"><i class="fa-solid fa-user"></i></div>
          <div>
            <div class="ef-customer-name">${ex.resident_name}</div>
            <div class="ef-customer-sub">${wo.caller_phone_number || ''}</div>
          </div>
        </div>
      </div>` : '')}

      <div class="ef-section-label" style="margin-top:16px;"><i class="fa-solid fa-screwdriver-wrench"></i> Extracted Work Order Details</div>
      <div class="extraction-grid">
        <div class="extraction-field extraction-field-full">
          <div class="ef-label"><i class="fa-solid fa-location-dot"></i> Property</div>
          <div class="ef-value ${wo.property_address.includes('UNKNOWN') ? 'ef-warn' : ''}">${wo.property_address}</div>
        </div>
        <div class="extraction-field">
          <div class="ef-label"><i class="fa-solid fa-door-open"></i> Apartment</div>
          <div class="ef-value">${wo.apartment_number || 'N/A'}</div>
        </div>
        <div class="extraction-field">
          <div class="ef-label"><i class="fa-solid fa-phone"></i> Contact</div>
          <div class="ef-value">${wo.caller_phone_number}</div>
        </div>
        <div class="extraction-field">
          <div class="ef-label"><i class="fa-solid fa-key"></i> Master Key</div>
          <div class="ef-value">${yesNo(wo.permit_master_key)}</div>
        </div>
        <div class="extraction-field">
          <div class="ef-label"><i class="fa-solid fa-user-gear"></i> Technician</div>
          <div class="ef-value">${wo.technician}</div>
        </div>
        <div class="extraction-field">
          <div class="ef-label"><i class="fa-solid fa-calendar-clock"></i> Scheduled</div>
          <div class="ef-value">${wo.scheduled_time || 'TBD'}</div>
        </div>
        <div class="extraction-field extraction-field-full">
          <div class="ef-label"><i class="fa-solid fa-screwdriver-wrench"></i> Issue Description</div>
          <div class="ef-value">${wo.issue_description}</div>
        </div>
        ${wo.special_notes ? `
        <div class="extraction-field extraction-field-full">
          <div class="ef-label"><i class="fa-solid fa-note-sticky"></i> Special Notes</div>
          <div class="ef-value">${wo.special_notes}</div>
        </div>` : ''}
      </div>
    </div>`;
}

// --------------------------------------------------------------------------
// Recent processed emails feed
// --------------------------------------------------------------------------
async function loadRecentProcessed() {
  try {
    const res = await authFetch('/api/communications?type=email_intake&limit=10');
    if (!res.ok) return;
    const data = await res.json();
    const feed = document.getElementById('processed-emails-feed');
    if (!data.length) return;
    feed.innerHTML = '';
    data.forEach(comm => {
      const ex = comm.extracted_data || {};
      const orig = comm.original_email || {};
      const entry = document.createElement('div');
      entry.className = 'processed-email-entry';
      const ts = new Date(comm.timestamp);
      entry.innerHTML = `
        <div class="pe-header">
          <span class="pe-id"><i class="fa-solid fa-hashtag"></i>${comm.linked_work_order || 'N/A'}</span>
          <span class="pe-time">${ts.toLocaleDateString('fi-FI')} ${ts.toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="pe-from"><i class="fa-solid fa-envelope"></i>${comm.sender_email || orig.from || ''}</div>
        <div class="pe-issue">${ex.issue_description || orig.subject || ''}</div>
        <div class="pe-address"><i class="fa-solid fa-location-dot"></i>${ex.property_address || comm.property_address || '—'}</div>
        ${comm.status ? `<span class="pe-status pe-status-${comm.status}">${comm.status}</span>` : ''}`;
      feed.appendChild(entry);
    });
  } catch (err) {
    console.error('Could not load recent emails:', err);
  }
}

function addProcessedEmailEntry(result) {
  const feed = document.getElementById('processed-emails-feed');
  // Remove "no emails" placeholder if present
  const placeholder = feed.querySelector('.loading-placeholder');
  if (placeholder) placeholder.remove();
  const wo = result.work_order;
  const entry = document.createElement('div');
  entry.className = 'processed-email-entry pe-new';
  const now = new Date();
  entry.innerHTML = `
    <div class="pe-header">
      <span class="pe-id"><i class="fa-solid fa-hashtag"></i>${wo?.id || 'N/A'}</span>
      <span class="pe-time">${now.toLocaleTimeString('fi-FI', {hour:'2-digit', minute:'2-digit'})}</span>
    </div>
    <div class="pe-from"><i class="fa-solid fa-envelope"></i>${result.work_order?.sender_email || ''}</div>
    <div class="pe-issue">${wo?.issue_description || ''}</div>
    <div class="pe-address"><i class="fa-solid fa-location-dot"></i>${wo?.property_address || '—'}</div>
    <span class="pe-status pe-status-processed">processed</span>`;
  feed.prepend(entry);
  // Flash animation
  requestAnimationFrame(() => entry.classList.add('pe-flash'));
  setTimeout(() => entry.classList.remove('pe-flash'), 1500);
}
