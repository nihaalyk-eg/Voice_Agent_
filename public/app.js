// ==========================================================================
// Global State & UI Config
// ==========================================================================
let pc = null;
let dataChannel = null;
let localStream = null;
let audioCtx = null;
let animationFrameId = null;
let currentAgentBubbleText = null;

// Transcript accumulator for call persistence
let callTranscriptAccumulator = [];
let callStartTime = null;

// Mock databases loaded from backend
let properties = [];
let workOrders = [];
let communications = [];
let emailTemplates = [];

// Active tab state
let activeTab = 'work-orders';
let activeCommsFilter = 'all';

// ==========================================================================
// Dynamic HUD Context Builder State & Logic
// ==========================================================================
let liveContext = {
  residentName: null,
  phone: null,
  propertyAddress: null,
  apartment: null,
  isCommonArea: null,
  issueDescription: null,
  masterKeyPermit: null,
  technician: null,
  urgency: null,
  ticketStatus: null
};

function resetLiveContext() {
  liveContext = {
    residentName: null,
    phone: document.getElementById('dialer-number')?.value || '+358 40 123 4567',
    propertyAddress: null,
    apartment: null,
    isCommonArea: null,
    issueDescription: null,
    masterKeyPermit: null,
    technician: null,
    urgency: null,
    ticketStatus: null
  };
  renderLiveContextTable();
}

function resetLiveContextManual() {
  resetLiveContext();

  // Reset transcript feed to placeholder
  const feed = document.getElementById('transcript-feed');
  if (feed) {
    feed.innerHTML = `
      <div class="transcript-placeholder">
        <i class="fa-solid fa-volume-high"></i>
        <p>Dial a resident phone number and click 'Start Call' to speak with the automated maintenance agent. Live transcripts will stream here in real-time.</p>
      </div>
    `;
  }

  // Reset dialer display back to default caller
  const dialerInput = document.getElementById('dialer-number');
  if (dialerInput) {
    dialerInput.value = '+358 40 123 4567';
  }

  // Reset visualizer and orb
  const orb = document.getElementById('voice-orb');
  if (orb) {
    orb.className = 'voice-orb orb-idle';
    orb.style.transform = 'scale(1)';
    orb.style.boxShadow = '';
  }

  // Reset mic/agent levels fill
  const barIn = document.getElementById('bar-in-fill');
  const barOut = document.getElementById('bar-out-fill');
  if (barIn) barIn.style.width = '0%';
  if (barOut) barOut.style.width = '0%';

  addLogMessage('Operator Console reset successfully.', 'info');
}

function renderLiveContextTable() {
  const tbody = document.getElementById('context-table-body');
  if (!tbody) return;

  const fields = [
    {
      key: 'residentName',
      label: 'Resident Name',
      icon: 'fa-user',
      getValue: () => liveContext.residentName,
      getState: () => liveContext.residentName ? 'verified' : 'analyzing',
      getDisplayValue: () => liveContext.residentName || 'Analyzing caller profile...'
    },
    {
      key: 'phone',
      label: 'Phone Number',
      icon: 'fa-phone',
      getValue: () => liveContext.phone,
      getState: () => 'verified',
      getDisplayValue: () => liveContext.phone
    },
    {
      key: 'propertyAddress',
      label: 'Property Address',
      icon: 'fa-building',
      getValue: () => liveContext.propertyAddress,
      getState: () => liveContext.propertyAddress ? 'verified' : 'required',
      getDisplayValue: () => liveContext.propertyAddress || 'Awaiting address...'
    },
    {
      key: 'apartment',
      label: 'Apartment / Unit',
      icon: 'fa-door-closed',
      getValue: () => liveContext.apartment,
      getState: () => liveContext.apartment ? 'verified' : 'required',
      getDisplayValue: () => liveContext.apartment || 'Awaiting unit number...'
    },
    {
      key: 'issueDescription',
      label: 'Issue Description',
      icon: 'fa-wrench',
      getValue: () => liveContext.issueDescription,
      getState: () => liveContext.issueDescription ? 'verified' : 'required',
      getDisplayValue: () => liveContext.issueDescription || 'Awaiting diagnostic report...'
    },
    {
      key: 'masterKeyPermit',
      label: 'Master Key Permit',
      icon: 'fa-key',
      getValue: () => liveContext.masterKeyPermit,
      getState: () => liveContext.masterKeyPermit ? 'verified' : 'required',
      getDisplayValue: () => liveContext.masterKeyPermit || 'Awaiting key loan consent...'
    },
    {
      key: 'technician',
      label: 'Assigned Tech',
      icon: 'fa-user-gear',
      getValue: () => liveContext.technician,
      getState: () => liveContext.technician ? 'verified' : 'required',
      getDisplayValue: () => liveContext.technician || 'Not assigned'
    },
    {
      key: 'ticketStatus',
      label: 'Ticket Status',
      icon: 'fa-receipt',
      getValue: () => liveContext.ticketStatus,
      getState: () => liveContext.ticketStatus ? 'verified' : 'required',
      getDisplayValue: () => liveContext.ticketStatus ? `Created (${liveContext.ticketStatus})` : 'Not Created'
    }
  ];

  tbody.innerHTML = '';
  fields.forEach(f => {
    const tr = document.createElement('tr');
    const value = f.getValue();
    const state = f.getState();
    const displayValue = f.getDisplayValue();

    let stateClass = 'state-required';
    let stateIcon = 'fa-triangle-exclamation';
    let stateText = 'Required';

    if (state === 'verified') {
      stateClass = 'state-verified';
      stateIcon = 'fa-circle-check';
      stateText = 'Verified';
    } else if (state === 'analyzing') {
      stateClass = 'state-analyzing';
      stateIcon = 'fa-spinner fa-spin';
      stateText = 'Analyzing';
    }

    tr.innerHTML = `
      <td>
        <span class="context-field-name">
          <i class="fa-solid ${f.icon}"></i> ${f.label}
        </span>
      </td>
      <td>
        <span class="context-field-value ${value ? 'filled' : 'missing'}">
          ${displayValue}
        </span>
      </td>
      <td>
        <span class="context-state-badge ${stateClass}">
          <i class="fa-solid ${stateIcon}"></i> ${stateText}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// DOM Elements
const btnCall = document.getElementById('btn-call');
const btnCallText = document.getElementById('btn-call-text');
const btnMute = document.getElementById('btn-mute');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const voiceOrb = document.getElementById('voice-orb');
const transcriptFeed = document.getElementById('transcript-feed');
const remoteAudio = document.getElementById('remote-audio');

// Audio visualizer fills
const barInFill = document.getElementById('bar-in-fill');
const barOutFill = document.getElementById('bar-out-fill');

// ERP Lists
const techList = document.getElementById('tech-list');
const propertyList = document.getElementById('property-list');
const workOrdersBoard = document.getElementById('work-orders-board');
const woCount = document.getElementById('wo-count');

// ==========================================================================
// Initialization & REST API Sync
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  loadProperties();
  loadWorkOrders();
  loadCommunications();
  loadEmailTemplates();
  setupResizers();
  resetLiveContext();
});

// Fetch properties and technicians list from backend
async function loadProperties() {
  try {
    const res = await authFetch('/api/properties');
    if (!res.ok) throw new Error('Failed to fetch properties');
    properties = await res.json();
    renderProperties();
    renderTechnicians();
  } catch (err) {
    console.error('Error loading properties database:', err);
    propertyList.innerHTML = `<li class="loading-item text-red">Failed to load properties list.</li>`;
  }
}

// Fetch active work orders from backend
async function loadWorkOrders() {
  try {
    const res = await authFetch('/api/work-orders');
    if (!res.ok) throw new Error('Failed to fetch work orders');
    workOrders = await res.json();
    renderWorkOrders();
    updateTabBadges();
  } catch (err) {
    console.error('Error loading work orders:', err);
    workOrdersBoard.innerHTML = `<div class="loading-placeholder text-red"><p>Failed to load work orders dashboard.</p></div>`;
  }
}

// Fetch communications history from backend
async function loadCommunications() {
  try {
    const res = await authFetch('/api/communications');
    if (!res.ok) throw new Error('Failed to fetch communications');
    communications = await res.json();
    renderCommunications();
    updateTabBadges();
  } catch (err) {
    console.error('Error loading communications:', err);
  }
}

// Fetch email templates for demo
async function loadEmailTemplates() {
  try {
    const res = await authFetch('/api/email-templates');
    if (!res.ok) throw new Error('Failed to fetch email templates');
    emailTemplates = await res.json();
    renderEmailTemplateButtons();
  } catch (err) {
    console.error('Error loading email templates:', err);
  }
}

// ==========================================================================
// Tab Navigation
// ==========================================================================
function switchTab(tabName) {
  activeTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.erp-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab content panels
  document.querySelectorAll('.erp-tab-content').forEach(panel => {
    panel.classList.toggle('active', panel.id === `tab-content-${tabName}`);
  });

  // Refresh content for the active tab
  if (tabName === 'comms-history') {
    renderCommunications();
  }
}

function updateTabBadges() {
  const woBadge = document.getElementById('wo-tab-badge');
  const commsBadge = document.getElementById('comms-tab-badge');
  if (woBadge) woBadge.textContent = workOrders.length;
  if (commsBadge) commsBadge.textContent = communications.length;
}

// ==========================================================================
// Render UI Utilities & Interactive Filtering
// ==========================================================================
let activeTechFilter = null;
let activePropertyFilter = null;

function renderProperties() {
  if (!propertyList) return;
  propertyList.innerHTML = '';
  properties.forEach(prop => {
    const li = document.createElement('li');
    const isActive = activePropertyFilter === prop.address;
    li.className = `property-item ${isActive ? 'property-item-active' : ''}`;
    li.style.cursor = 'pointer';
    li.onclick = () => togglePropertyFilter(prop.address);
    li.innerHTML = `
      <div class="property-info">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span class="property-address">${prop.address}</span>
          ${isActive ? '<span class="filter-pill"><i class="fa-solid fa-circle-check"></i> Filter</span>' : ''}
        </div>
        <span class="property-meta">
          <i class="fa-solid fa-user-shield"></i> ${prop.technician}
        </span>
      </div>
    `;
    propertyList.appendChild(li);
  });
}

function renderTechnicians() {
  if (!techList) return;
  techList.innerHTML = '';
  // Get unique technicians from properties
  const uniqueTechs = [];
  properties.forEach(p => {
    if (!uniqueTechs.some(t => t.name === p.technician)) {
      uniqueTechs.push({
        name: p.technician,
        phone: p.technician_phone,
        company: p.company
      });
    }
  });

  uniqueTechs.forEach(t => {
    const li = document.createElement('li');
    const isActive = activeTechFilter === t.name;
    li.className = `tech-item ${isActive ? 'tech-item-active' : ''}`;
    li.style.cursor = 'pointer';
    li.onclick = () => toggleTechFilter(t.name);
    li.innerHTML = `
      <div class="tech-info">
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span class="tech-name">${t.name}</span>
          ${isActive ? '<span class="filter-pill"><i class="fa-solid fa-circle-check"></i> Filter</span>' : ''}
        </div>
        <span class="tech-meta">
          <i class="fa-solid fa-phone"></i> ${t.phone}
        </span>
        <span class="tech-meta">
          <i class="fa-solid fa-building-circle-check"></i> ${t.company}
        </span>
      </div>
    `;
    techList.appendChild(li);
  });
}

function toggleTechFilter(name) {
  if (activeTechFilter === name) {
    activeTechFilter = null;
  } else {
    activeTechFilter = name;
    activePropertyFilter = null; // Mutually exclusive for simplicity
  }
  renderTechnicians();
  renderProperties();
  renderWorkOrders();
}

function togglePropertyFilter(address) {
  if (activePropertyFilter === address) {
    activePropertyFilter = null;
  } else {
    activePropertyFilter = address;
    activeTechFilter = null; // Mutually exclusive for simplicity
  }
  renderTechnicians();
  renderProperties();
  renderWorkOrders();
}

function clearAllFilters() {
  activeTechFilter = null;
  activePropertyFilter = null;
  renderTechnicians();
  renderProperties();
  renderWorkOrders();
}

function renderWorkOrders(highlightId = null) {
  if (!workOrdersBoard) return;
  workOrdersBoard.innerHTML = '';
  if (woCount) woCount.textContent = `${workOrders.length} Active`;

  if (workOrders.length === 0) {
    workOrdersBoard.innerHTML = `
      <div class="loading-placeholder">
        <i class="fa-solid fa-box-open"></i>
        <p>No active work orders. Ready to receive requests.</p>
      </div>
    `;
    return;
  }

  // Filter local state based on interactive filters
  let filtered = [...workOrders];
  if (activeTechFilter) {
    filtered = filtered.filter(wo => wo.technician === activeTechFilter);
  }
  if (activePropertyFilter) {
    filtered = filtered.filter(wo => wo.property_address.toLowerCase().includes(activePropertyFilter.toLowerCase()));
  }

  // Active filter banner
  if (activeTechFilter || activePropertyFilter) {
    const banner = document.createElement('div');
    banner.className = 'filter-banner';
    banner.innerHTML = `
      <span><i class="fa-solid fa-filter"></i> Filtering work orders by: <strong>${activeTechFilter || activePropertyFilter}</strong></span>
      <button class="btn-clear-filter" onclick="clearAllFilters()"><i class="fa-solid fa-circle-xmark"></i> Clear</button>
    `;
    workOrdersBoard.appendChild(banner);
  }

  filtered.forEach(wo => {
    const card = document.createElement('div');
    card.className = `wo-card ${wo.id === highlightId ? 'freshly-created' : ''}`;
    
    let statusClass = 'status-assigned';
    if (wo.status.toLowerCase() === 'in progress') statusClass = 'status-progress';
    if (wo.status.toLowerCase() === 'completed') statusClass = 'status-completed';

    const urgencyClass = wo.urgency_level.toLowerCase() === 'urgent' ? 'urgency-urgent' : 'urgency-standard';
    
    // Source badge
    const sourceIcon = wo.source === 'email' ? 'fa-envelope' : 'fa-phone';
    const sourceLabel = wo.source === 'email' ? 'Email' : 'Voice';
    const sourceClass = wo.source === 'email' ? 'source-email' : 'source-voice';

    // Call category badge
    let categoryLabel = 'Fault Report';
    let categoryIcon = 'fa-wrench';
    if (wo.call_category === 'door_opening') { categoryLabel = 'Door Opening'; categoryIcon = 'fa-door-open'; }
    if (wo.call_category === 'key_loan') { categoryLabel = 'Key Loan'; categoryIcon = 'fa-key'; }

    card.innerHTML = `
      <div class="wo-card-header">
        <span class="wo-id"><i class="fa-solid fa-receipt"></i> ${wo.id}</span>
        <div class="wo-actions-wrap">
          <div class="wo-badges">
            <span class="badge-source ${sourceClass}"><i class="fa-solid ${sourceIcon}"></i> ${sourceLabel}</span>
            <span class="badge-status ${statusClass}">${wo.status}</span>
            <span class="badge-urgency ${urgencyClass}">${wo.urgency_level}</span>
          </div>
          <div class="wo-card-actions">
            ${wo.status !== 'Completed' ? `
              <button class="btn-action-status" onclick="cycleStatus('${wo.id}', '${wo.status}')" title="Advance status">
                <i class="fa-solid ${wo.status === 'Assigned' ? 'fa-play' : 'fa-check'}"></i>
              </button>
            ` : ''}
            <button class="btn-action-delete" onclick="deleteWorkOrder('${wo.id}')" title="Delete work order">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="wo-details">
        <div class="detail-row">
          <i class="fa-solid fa-location-dot"></i>
          <div class="detail-content">
            <span class="detail-label">Address / Unit</span>
            <span class="detail-val">${wo.property_address} (${wo.apartment_number})</span>
          </div>
        </div>
        <div class="detail-row">
          <i class="fa-solid fa-user-gear"></i>
          <div class="detail-content">
            <span class="detail-label">Assigned Technician</span>
            <span class="detail-val">${wo.technician}</span>
          </div>
        </div>
        <div class="detail-row">
          <i class="fa-solid fa-key"></i>
          <div class="detail-content">
            <span class="detail-label">Master Key Permit</span>
            <span class="detail-val">${wo.permit_master_key ? 'YES, PERMITTED' : 'NO, MUST RING BELL'}</span>
          </div>
        </div>
        <div class="detail-row">
          <i class="fa-solid fa-clock-rotate-left"></i>
          <div class="detail-content">
            <span class="detail-label">Scheduled Arrival</span>
            <span class="detail-val" style="color: var(--cyan-glow); font-weight: 700;">${wo.scheduled_time}</span>
          </div>
        </div>
        <div class="detail-row">
          <i class="fa-solid ${categoryIcon}"></i>
          <div class="detail-content">
            <span class="detail-label">Category</span>
            <span class="detail-val">${categoryLabel}</span>
          </div>
        </div>
        <div class="detail-row wo-details-full">
          <i class="fa-solid fa-comment-medical"></i>
          <div class="detail-content">
            <span class="detail-label">Problem / Notes</span>
            <span class="detail-val">${wo.issue_description} ${wo.special_notes ? `<br><em>Note: ${wo.special_notes}</em>` : ''}</span>
          </div>
        </div>
      </div>

      <div class="wo-footer">
        <span class="wo-time"><i class="fa-regular fa-calendar"></i> ${new Date(wo.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
        <span class="wo-caller"><i class="fa-solid ${wo.source === 'email' ? 'fa-envelope' : 'fa-phone'}"></i> ${wo.source === 'email' ? wo.sender_email || wo.caller_phone_number : `Caller: ${wo.caller_phone_number}`}</span>
      </div>
    `;
    workOrdersBoard.appendChild(card);
  });

  updateTabBadges();
}

// Cycle status: Assigned -> In Progress -> Completed
async function cycleStatus(id, currentStatus) {
  let nextStatus = 'In Progress';
  if (currentStatus === 'In Progress') {
    nextStatus = 'Completed';
  }
  
  try {
    const res = await authFetch(`/api/work-orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    
    if (!res.ok) throw new Error('Failed to update status');
    
    const updated = await res.json();
    
    // Update local state
    const index = workOrders.findIndex(w => w.id === id);
    if (index !== -1) {
      workOrders[index] = updated;
      renderWorkOrders();
    }
    
    addLogMessage(`[ERP] Work Order ${id} updated to ${nextStatus}`, 'success');
  } catch (err) {
    console.error('Error cycling status:', err);
    addLogMessage(`Error: ${err.message}`, 'error');
  }
}

// Delete work order
async function deleteWorkOrder(id) {
  if (!confirm(`Are you sure you want to delete Work Order ${id}?`)) return;
  
  try {
    const res = await authFetch(`/api/work-orders/${id}`, {
      method: 'DELETE'
    });
    
    if (!res.ok) throw new Error('Failed to delete work order');
    
    // Update local state
    workOrders = workOrders.filter(w => w.id !== id);
    renderWorkOrders();
    
    addLogMessage(`[ERP] Work Order ${id} successfully deleted`, 'success');
  } catch (err) {
    console.error('Error deleting work order:', err);
    addLogMessage(`Error: ${err.message}`, 'error');
  }
}

// ==========================================================================
// Email Agent UI
// ==========================================================================

function renderEmailTemplateButtons() {
  const container = document.getElementById('email-template-buttons');
  if (!container) return;
  container.innerHTML = '';

  emailTemplates.forEach(tpl => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-email-template';
    btn.textContent = tpl.label;
    btn.onclick = () => loadEmailTemplate(tpl);
    container.appendChild(btn);
  });
}

function loadEmailTemplate(tpl) {
  document.getElementById('email-from').value = tpl.from;
  document.getElementById('email-subject').value = tpl.subject;
  document.getElementById('email-body').value = tpl.body;
  
  // Flash feedback
  const form = document.getElementById('email-form');
  form.classList.add('template-loaded');
  setTimeout(() => form.classList.remove('template-loaded'), 600);
}

async function submitEmail(event) {
  event.preventDefault();

  const from = document.getElementById('email-from').value.trim();
  const subject = document.getElementById('email-subject').value.trim();
  const body = document.getElementById('email-body').value.trim();

  if (!from || !subject || !body) return;

  const submitBtn = document.getElementById('btn-submit-email');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Processing...</span>';

  try {
    const res = await authFetch('/api/email-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, subject, body })
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to process email');
    }

    const result = await res.json();
    
    // Render extraction results
    renderExtractionResults(result);

    // Add to local work orders state
    workOrders.unshift(result.work_order);
    communications.unshift(result.communication);
    renderWorkOrders(result.work_order.id);
    updateTabBadges();

    // Add to processed emails feed
    addProcessedEmailEntry(result);

    // Flash the work orders tab badge
    const woBadge = document.getElementById('wo-tab-badge');
    woBadge.classList.add('badge-flash');
    setTimeout(() => woBadge.classList.remove('badge-flash'), 1500);

    // Clear form
    document.getElementById('email-form').reset();

    addLogMessage(`[Email Agent] Work Order ${result.work_order.id} auto-created from email`, 'success');

  } catch (err) {
    console.error('Email processing error:', err);
    const resultsDiv = document.getElementById('email-results');
    resultsDiv.innerHTML = `
      <div class="extraction-error">
        <i class="fa-solid fa-circle-exclamation"></i>
        <p>Error processing email: ${err.message}</p>
      </div>
    `;
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-robot"></i> <span>Process with AI Email Agent</span>';
  }
}

function renderExtractionResults(result) {
  const container = document.getElementById('email-results');
  const data = result.extraction_report;
  const wo = result.work_order;

  container.innerHTML = `
    <div class="extraction-success">
      <div class="extraction-header">
        <i class="fa-solid fa-circle-check"></i>
        <div>
          <strong>Work Order ${wo.id} Created Successfully</strong>
          <span>Assigned to ${wo.technician} — ${wo.scheduled_time}</span>
        </div>
      </div>

      <div class="extraction-grid">
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-location-dot"></i> Address</span>
          <span class="ef-value ${data.property_address.includes('UNKNOWN') ? 'ef-warn' : ''}">${data.property_address}</span>
        </div>
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-door-open"></i> Unit</span>
          <span class="ef-value">${data.apartment_number} ${data.is_common_area ? '<span class="ef-tag">Common Area</span>' : ''}</span>
        </div>
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-wrench"></i> Issue</span>
          <span class="ef-value">${data.issue_description}</span>
        </div>
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-key"></i> Master Key</span>
          <span class="ef-value">${data.permit_master_key ? '<span class="ef-tag ef-tag-green">Permitted</span>' : '<span class="ef-tag ef-tag-red">Not Permitted</span>'}</span>
        </div>
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-phone"></i> Phone</span>
          <span class="ef-value">${data.caller_phone_number}</span>
        </div>
        <div class="extraction-field">
          <span class="ef-label"><i class="fa-solid fa-gauge-high"></i> Urgency</span>
          <span class="ef-value"><span class="ef-tag ${data.urgency_level === 'Urgent' ? 'ef-tag-red' : 'ef-tag-blue'}">${data.urgency_level}</span></span>
        </div>
        ${data.special_notes ? `
        <div class="extraction-field extraction-field-full">
          <span class="ef-label"><i class="fa-solid fa-note-sticky"></i> Special Notes</span>
          <span class="ef-value">${data.special_notes}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function addProcessedEmailEntry(result) {
  const feed = document.getElementById('processed-emails-feed');
  
  // Remove placeholder if present
  const placeholder = feed.querySelector('.loading-placeholder');
  if (placeholder) placeholder.remove();

  const entry = document.createElement('div');
  entry.className = 'processed-email-entry';
  entry.innerHTML = `
    <div class="pe-header">
      <span class="pe-id"><i class="fa-solid fa-receipt"></i> ${result.work_order.id}</span>
      <span class="pe-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
    </div>
    <div class="pe-from"><i class="fa-solid fa-envelope"></i> ${result.communication.sender_email}</div>
    <div class="pe-issue">${result.work_order.issue_description}</div>
    <div class="pe-address"><i class="fa-solid fa-location-dot"></i> ${result.work_order.property_address}</div>
  `;
  feed.insertBefore(entry, feed.firstChild);
}

// ==========================================================================
// Communications History
// ==========================================================================

function filterComms(filterType) {
  activeCommsFilter = filterType;
  document.querySelectorAll('.comms-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterType);
  });
  renderCommunications();
}

function renderCommunications() {
  const timeline = document.getElementById('comms-timeline');
  if (!timeline) return;

  let filtered = [...communications];
  if (activeCommsFilter !== 'all') {
    filtered = filtered.filter(c => c.type === activeCommsFilter);
  }

  if (filtered.length === 0) {
    timeline.innerHTML = `
      <div class="loading-placeholder">
        <i class="fa-solid fa-inbox"></i>
        <p>No communications found${activeCommsFilter !== 'all' ? ' for this filter' : ''}.</p>
      </div>
    `;
    return;
  }

  timeline.innerHTML = '';

  filtered.forEach(comm => {
    const item = document.createElement('div');
    item.className = `comms-item comms-${comm.type}`;

    let icon, typeLabel, content, linkedBadge;

    switch (comm.type) {
      case 'call_transcript':
        icon = 'fa-phone';
        typeLabel = 'Voice Call';
        content = `
          <div class="comms-summary">${comm.summary || 'No summary available'}</div>
          ${comm.transcript && comm.transcript.length > 0 ? `
            <details class="comms-transcript-details">
              <summary><i class="fa-solid fa-scroll"></i> View Full Transcript (${comm.transcript.length} messages)</summary>
              <div class="comms-transcript-content">
                ${comm.transcript.map(msg => `
                  <div class="transcript-msg transcript-msg-${msg.role}">
                    <span class="tm-role">${msg.role === 'agent' ? 'Agent' : 'Caller'}</span>
                    <span class="tm-text">${msg.text}</span>
                  </div>
                `).join('')}
              </div>
            </details>
          ` : ''}
          ${comm.duration_seconds ? `<span class="comms-duration"><i class="fa-solid fa-stopwatch"></i> ${Math.floor(comm.duration_seconds / 60)}m ${comm.duration_seconds % 60}s</span>` : ''}
        `;
        break;

      case 'sms_confirmation':
        icon = 'fa-message';
        typeLabel = 'SMS Sent';
        content = `
          <div class="comms-sms-recipient"><i class="fa-solid fa-mobile-screen"></i> To: ${comm.recipient_phone}</div>
          <div class="comms-sms-body">${comm.message}</div>
        `;
        break;

      case 'email_intake':
        icon = 'fa-envelope';
        typeLabel = 'Email Processed';
        content = `
          <div class="comms-email-from"><i class="fa-solid fa-at"></i> From: ${comm.sender_email}</div>
          ${comm.original_email ? `
            <div class="comms-email-subject"><strong>Subject:</strong> ${comm.original_email.subject}</div>
          ` : ''}
          <div class="comms-email-status"><span class="ef-tag ef-tag-green">${comm.status}</span></div>
        `;
        break;

      case 'escalation':
        icon = 'fa-triangle-exclamation';
        typeLabel = 'ESCALATION';
        content = `
          <div class="comms-escalation-reason"><i class="fa-solid fa-fire"></i> ${comm.reason}</div>
          ${comm.property_address ? `<div class="comms-escalation-addr"><i class="fa-solid fa-location-dot"></i> ${comm.property_address}</div>` : ''}
          <div class="comms-escalation-status"><span class="ef-tag ef-tag-red">Escalated to Operator</span></div>
        `;
        break;

      default:
        icon = 'fa-circle-info';
        typeLabel = comm.type;
        content = `<div class="comms-summary">${JSON.stringify(comm).substring(0, 200)}...</div>`;
    }

    linkedBadge = comm.linked_work_order 
      ? `<span class="comms-linked-wo" onclick="navigateToWorkOrder('${comm.linked_work_order}')"><i class="fa-solid fa-link"></i> ${comm.linked_work_order}</span>` 
      : '';

    item.innerHTML = `
      <div class="comms-item-icon"><i class="fa-solid ${icon}"></i></div>
      <div class="comms-item-body">
        <div class="comms-item-header">
          <span class="comms-type-label">${typeLabel}</span>
          ${linkedBadge}
          <span class="comms-timestamp">${new Date(comm.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div class="comms-item-content">${content}</div>
      </div>
    `;

    timeline.appendChild(item);
  });
}

function navigateToWorkOrder(woId) {
  switchTab('work-orders');
  renderWorkOrders(woId);
  
  // Scroll to the highlighted work order
  setTimeout(() => {
    const highlighted = document.querySelector('.wo-card.freshly-created');
    if (highlighted) {
      highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

// ==========================================================================
// Escalation Alert UI
// ==========================================================================

function showEscalation(reason) {
  const banner = document.getElementById('escalation-banner');
  const text = document.getElementById('escalation-text');
  text.textContent = `EMERGENCY ESCALATION — ${reason}`;
  banner.classList.remove('hidden');
  banner.classList.add('escalation-active');
}

function dismissEscalation() {
  const banner = document.getElementById('escalation-banner');
  banner.classList.add('hidden');
  banner.classList.remove('escalation-active');
}

// ==========================================================================
// Resizable panels controller
// ==========================================================================
function setupResizers() {
  makeResizable('splitter-console-erp', '.console-panel');
  makeResizable('splitter-sidebar-board', '.erp-sidebar');
}

function makeResizable(splitterId, leftSelector) {
  const splitter = document.getElementById(splitterId);
  const left = document.querySelector(leftSelector);
  
  if (!splitter || !left) return;
  
  // Mouse support
  splitter.addEventListener('mousedown', (e) => {
    e.preventDefault();
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    
    const startX = e.clientX;
    const startWidth = left.getBoundingClientRect().width;
    
    const onMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = startWidth + deltaX;
      
      let minW = splitterId === 'splitter-sidebar-board' ? 240 : 320;
      let maxW = splitterId === 'splitter-sidebar-board' ? 500 : 600;
      
      if (newWidth >= minW && newWidth <= maxW) {
        left.style.width = `${newWidth}px`;
        left.style.flex = `0 0 ${newWidth}px`;
      }
    };
    
    const onMouseUp = () => {
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // Touch support
  splitter.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    const startX = touch.clientX;
    const startWidth = left.getBoundingClientRect().width;
    
    const onTouchMove = (moveEvent) => {
      const touchMove = moveEvent.touches[0];
      const deltaX = touchMove.clientX - startX;
      const newWidth = startWidth + deltaX;
      
      let minW = splitterId === 'splitter-sidebar-board' ? 240 : 320;
      let maxW = splitterId === 'splitter-sidebar-board' ? 500 : 600;
      
      if (newWidth >= minW && newWidth <= maxW) {
        left.style.width = `${newWidth}px`;
        left.style.flex = `0 0 ${newWidth}px`;
      }
    };
    
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  });
}

// ==========================================================================
// WebRTC & Session Control Logic
// ==========================================================================

btnCall.addEventListener('click', () => {
  if (pc && pc.signalingState !== 'closed') {
    hangUp();
  } else {
    startCall();
  }
});

async function startCall() {
  try {
    // Reset transcript accumulator
    callTranscriptAccumulator = [];
    callStartTime = Date.now();
    resetLiveContext();

    // 1. Reset UI to connecting state
    setCallStatus('connecting', 'CONNECTING...');
    btnCall.disabled = true;
    btnCallText.textContent = 'Connecting...';
    voiceOrb.className = 'voice-orb orb-connecting';
    addLogMessage('Initiating connection to OpenAI Realtime...', 'info');

    // 2. Fetch Ephemeral client token from backend passing caller phone number
    const dialedNumber = document.getElementById('dialer-number').value || '+358 40 123 4567';
    const sessionRes = await authFetch('/api/session', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caller_phone_number: dialedNumber })
    });
    if (!sessionRes.ok) {
      const errData = await sessionRes.json();
      throw new Error(errData.error || 'Failed to fetch session token');
    }
    const sessionData = await sessionRes.json();
    const EPHEMERAL_KEY = sessionData.client_secret.value;

    // 3. Request user microphone permissions
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    addLogMessage('Microphone access granted.', 'success');

    // 4. Instantiate WebRTC Peer Connection
    pc = new RTCPeerConnection();

    // 5. Connect Remote audio stream to playback
    pc.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
      setupAudioAnalysis(localStream, event.streams[0]);
    };

    // 6. Add local microphone audio track to the peer connection
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // 7. Initialize WebRTC Data Channel for custom event orchestration
    dataChannel = pc.createDataChannel('oai-events');
    
    // Set up Data Channel listeners
    dataChannel.onopen = () => {
      addLogMessage('Voice channel opened! Speak to the agent.', 'success');
      setCallStatus('connected', 'CALL ACTIVE');
      btnCall.disabled = false;
      btnCall.className = 'btn btn-call-action btn-call-primary btn-hangup';
      btnCallText.textContent = 'End Call';
      btnMute.disabled = false;
      
      voiceOrb.className = 'voice-orb orb-listening';

      // Send session.update if session_config is provided (e.g., when using Azure OpenAI)
      if (sessionData && sessionData.session_config) {
        addLogMessage('Configuring voice agent session...', 'info');
        const sessionUpdateEvent = {
          type: 'session.update',
          session: sessionData.session_config
        };
        dataChannel.send(JSON.stringify(sessionUpdateEvent));
      }

      // Proactively trigger the agent's greeting response immediately
      addLogMessage('Triggering greeting...', 'info');
      const triggerGreetingEvent = {
        type: 'response.create'
      };
      dataChannel.send(JSON.stringify(triggerGreetingEvent));
    };

    dataChannel.onmessage = (event) => {
      try {
        const realtimeEvent = JSON.parse(event.data);
        handleRealtimeEvent(realtimeEvent);
      } catch (err) {
        console.error('Error parsing Realtime event data:', err);
      }
    };

    // 8. Create SDP Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 9. Send Local SDP Offer to dynamic endpoint returned by session generator
    const sdpResponse = await fetch(sessionData.connection_url, {
      method: 'POST',
      body: offer.sdp,
      headers: {
        'Authorization': `Bearer ${EPHEMERAL_KEY}`,
        'Content-Type': 'application/sdp'
      }
    });

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text();
      throw new Error(`SDP negotiation failed: ${errorText}`);
    }

    // 10. Apply Remote SDP Answer
    const answerSdp = await sdpResponse.text();
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    addLogMessage('Negotiation with OpenAI completed.', 'info');

  } catch (error) {
    console.error('Call Initialization Error:', error);
    addLogMessage(`Error: ${error.message}`, 'error');
    setCallStatus('idle', 'OFF-LINE');
    btnCall.disabled = false;
    btnCallText.textContent = 'Start Call';
    btnCall.className = 'btn btn-call-action btn-call-primary';
    voiceOrb.className = 'voice-orb orb-idle';
    cleanupCall();
  }
}

function hangUp() {
  addLogMessage('Call ended by user.', 'info');
  
  // Persist call transcript if we have accumulated messages
  if (callTranscriptAccumulator.length > 0) {
    persistCallTranscript();
  }
  
  cleanupCall();
}

async function persistCallTranscript() {
  const durationSeconds = callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0;
  
  try {
    await authFetch('/api/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'call_transcript',
        caller_phone: '+358 40 123 4567',
        summary: `Voice call with ${callTranscriptAccumulator.length} messages. Duration: ${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`,
        transcript: callTranscriptAccumulator,
        call_category: 'fault_report',
        duration_seconds: durationSeconds
      })
    });
    addLogMessage('[Comms] Call transcript saved to history.', 'success');
  } catch (err) {
    console.error('Error persisting transcript:', err);
  }
}

function cleanupCall() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
  }
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  currentAgentBubbleText = null;
  callStartTime = null;

  // Reset visual levels
  barInFill.style.width = '0%';
  barOutFill.style.width = '0%';

  // Reset UI elements
  setCallStatus('idle', 'OFF-LINE');
  btnCall.className = 'btn btn-call-action btn-call-primary';
  btnCallText.textContent = 'Start Call';
  btnCall.disabled = false;
  btnMute.disabled = true;
  btnMute.className = 'btn btn-call-action btn-call-secondary';
  btnMute.querySelector('span').textContent = 'Mute';
  voiceOrb.className = 'voice-orb orb-idle';
}

function setCallStatus(type, label) {
  statusBadge.className = `status-indicator status-${type}`;
  statusText.textContent = label;
}

// ==========================================================================
// Realtime Events Orchestration (OpenAI Protocols)
// ==========================================================================

function handleRealtimeEvent(event) {
  // Debug log
  console.log(`[Server Event] ${event.type}:`, event);

  // Handle Server Errors
  if (event.type === 'error') {
    console.error('[Realtime Session Error]', event.error);
    addLogMessage(`Session Error: ${event.error?.message || 'Unknown error'}`, 'error');
  }

  // 1. Capture User Audio Transcripts
  if (event.type === 'conversation.item.input_audio_transcription.completed') {
    const transcript = event.transcript || '';
    if (transcript.trim()) {
      appendTranscriptBubble('user', transcript);
      // Accumulate for persistence
      callTranscriptAccumulator.push({ role: 'user', text: transcript.trim() });
    }
  }

  // 2. Capture Agent Verbal Responses (Streaming & Done)
  if (event.type === 'response.audio_transcript.delta') {
    const delta = event.delta || '';
    if (delta.trim() || currentAgentBubbleText) {
      appendOrUpdateAgentTranscript(delta);
    }
  }

  if (event.type === 'response.audio_transcript.done') {
    const transcript = event.transcript || '';
    finalizeAgentTranscript(transcript);
    // Accumulate for persistence
    if (transcript.trim()) {
      callTranscriptAccumulator.push({ role: 'agent', text: transcript.trim() });
    }
  }

  // 3. Handle Tool Calls
  if (event.type === 'response.done') {
    const outputItems = event.response?.output || [];
    for (const item of outputItems) {
      if (item.type === 'function_call') {
        const { name, call_id, arguments: argsString } = item;
        let args = {};
        try {
          args = JSON.parse(argsString);
        } catch (e) {
          console.error('Failed to parse arguments JSON string:', e);
        }
        
        addLogMessage(`Model requested tool: ${name}()`, 'info');
        executeTool(name, call_id, args);
      }
    }
  }
}

// Local execution handler for function calling
async function executeTool(name, call_id, args) {
  let output = {};

  try {
    if (name === 'get_customer_profile') {
      const phone = args.phone_number || '';
      try {
        const res = await authFetch(`/api/customers/by-phone/${encodeURIComponent(phone)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.found) {
            const c = data.customer;
            output = {
              found: true,
              full_name: c.full_name,
              phone_number: c.phone_number,
              email: c.email,
              property_address: c.property_address,
              apartment_number: c.apartment_number,
              language_preference: c.language_preference,
              notes: c.notes || ''
            };
            addLogMessage(`Customer identified: ${c.full_name} — ${c.property_address}, apt ${c.apartment_number}`, 'success');

            // Prefill HUD Context Builder in real-time
            liveContext.residentName = c.full_name;
            liveContext.phone = c.phone_number;
            liveContext.propertyAddress = c.property_address;
            liveContext.apartment = c.apartment_number || 'N/A';
            renderLiveContextTable();
          } else {
            output = { found: false, note: 'Caller not in resident database. Proceed with standard greeting.' };
            addLogMessage(`Unknown caller: ${phone}`, 'info');

            // Prefill HUD Caller Phone anyway
            liveContext.residentName = 'Unknown Resident';
            liveContext.phone = phone;
            renderLiveContextTable();
          }
        } else {
          output = { found: false, note: 'Lookup failed. Proceed with standard greeting.' };
        }
      } catch (err) {
        output = { found: false, note: 'Lookup error. Proceed with standard greeting.' };
        console.error('get_customer_profile error:', err);
      }
    }

    else if (name === 'get_maintenance_person') {
      const address = args.property_address || '';
      const matched = properties.find(p => p.address.toLowerCase().includes(address.toLowerCase()));
      
      if (matched) {
        output = {
          success: true,
          property_address: matched.address,
          technician: matched.technician,
          technician_phone: matched.technician_phone,
          company: matched.company
        };
        addLogMessage(`Retrieved technician: ${matched.technician} for ${matched.address}`, 'success');

        // Update HUD Context in real-time
        liveContext.propertyAddress = matched.address;
        liveContext.technician = matched.technician;
        renderLiveContextTable();
      } else {
        output = {
          success: true,
          property_address: address,
          technician: 'Pekka Puupää',
          technician_phone: '+358 50 555 6666',
          company: 'Töölön Kiinteistöhuolto',
          note: 'Property not matching active catalog. Assigning regional backup tech.'
        };
        addLogMessage(`Address not recognized, assigned default tech Pekka Puupää`, 'info');

        // Update HUD Context in real-time
        liveContext.propertyAddress = address;
        liveContext.technician = 'Pekka Puupää';
        renderLiveContextTable();
      }
    }
    
    else if (name === 'create_work_order') {
      // Add source field for voice calls
      args.source = 'voice';
      args.call_category = args.call_category || 'fault_report';

      // Execute REST API request to insert into server database
      const res = await authFetch('/api/work-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });
      
      if (!res.ok) {
        throw new Error('Server rejected work order insertion');
      }
      
      const newWo = await res.json();
      output = {
        success: true,
        work_order_id: newWo.id,
        scheduled_time: newWo.scheduled_time,
        assigned_technician: newWo.technician,
        assigned_technician_phone: newWo.technician_phone
      };

      // Add to local UI array and trigger highlight
      workOrders.unshift(newWo);
      renderWorkOrders(newWo.id);
      updateTabBadges();
      addLogMessage(`[ERP] Work Order ${newWo.id} created!`, 'success');

      // Update HUD Context Builder in real-time
      liveContext.propertyAddress = newWo.property_address;
      liveContext.apartment = newWo.apartment_number || 'N/A';
      liveContext.isCommonArea = newWo.is_common_area ? 'Yes' : 'No';
      liveContext.issueDescription = newWo.issue_description;
      liveContext.masterKeyPermit = newWo.permit_master_key ? 'Yes' : 'No';
      liveContext.urgency = newWo.urgency_level || 'Standard';
      liveContext.technician = newWo.technician;
      liveContext.ticketStatus = newWo.id;
      renderLiveContextTable();

      // Switch to work orders tab to show the new entry after a slight delay so operator can see HUD verified!
      setTimeout(() => {
        switchTab('work-orders');
      }, 2500);
    }
    
    else if (name === 'send_sms_confirmation') {
      // Store SMS communication record
      try {
        await authFetch('/api/communications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sms_confirmation',
            linked_work_order: args.work_order_id,
            recipient_phone: args.caller_phone_number,
            message: args.message_content
          })
        });
      } catch (e) {
        console.warn('Failed to store SMS record:', e);
      }

      output = {
        success: true,
        recipient: args.caller_phone_number,
        message: 'Confirmation SMS pushed to operator queue successfully.'
      };
      addLogMessage(`[SMS] Confirmed order ${args.work_order_id} via text to ${args.caller_phone_number}`, 'success');
    }

    else if (name === 'escalate_to_operator') {
      // Log escalation event
      try {
        await authFetch('/api/escalate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caller_phone: args.caller_phone_number,
            reason: args.reason,
            property_address: args.property_address || null
          })
        });
      } catch (e) {
        console.warn('Failed to log escalation:', e);
      }

      // Show escalation alert in UI
      showEscalation(args.reason);

      output = {
        success: true,
        message: 'Call has been escalated to the 24/7 emergency operator. The operator has been notified with all collected details.',
        operator_phone: '+358 800 EMERGENCY'
      };
      addLogMessage(`[ESCALATION] Emergency: ${args.reason}`, 'error');
    }

    else if (name === 'save_call_transcript') {
      // Update the last transcript in the accumulator with the AI-generated summary
      try {
        await authFetch('/api/communications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'call_transcript',
            linked_work_order: args.linked_work_order || null,
            caller_phone: '+358 40 123 4567',
            summary: args.summary,
            transcript: callTranscriptAccumulator,
            call_category: args.call_category || 'fault_report',
            duration_seconds: callStartTime ? Math.floor((Date.now() - callStartTime) / 1000) : 0
          })
        });
        // Reload communications
        loadCommunications();
      } catch (e) {
        console.warn('Failed to save call transcript:', e);
      }

      output = {
        success: true,
        message: 'Call transcript and summary saved to communication history.'
      };
      addLogMessage(`[Comms] Call transcript saved with summary.`, 'success');
    }

  } catch (err) {
    console.error(`Error executing tool ${name}:`, err);
    output = { success: false, error: err.message };
    addLogMessage(`Error executing ${name}(): ${err.message}`, 'error');
  }

  // Submit response back to OpenAI Realtime
  submitToolResult(call_id, output);
}

// Send the output back to OpenAI
function submitToolResult(call_id, result) {
  if (!dataChannel || dataChannel.readyState !== 'open') return;

  const itemCreateEvent = {
    type: 'conversation.item.create',
    item: {
      type: 'function_call_output',
      call_id: call_id,
      output: JSON.stringify(result)
    }
  };
  
  const responseCreateEvent = {
    type: 'response.create'
  };

  dataChannel.send(JSON.stringify(itemCreateEvent));
  dataChannel.send(JSON.stringify(responseCreateEvent));
  
  console.log(`[Client Event] Submitted tool output for ${call_id}:`, result);
}

// ==========================================================================
// Advanced Audio Visualization & Orb Animators
// ==========================================================================

function setupAudioAnalysis(localStream, remoteStream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Mic Input Node
    const micSource = audioCtx.createMediaStreamSource(localStream);
    const micAnalyser = audioCtx.createAnalyser();
    micAnalyser.fftSize = 64;
    micSource.connect(micAnalyser);

    // Agent Output Node
    const speakerSource = audioCtx.createMediaStreamSource(remoteStream);
    const speakerAnalyser = audioCtx.createAnalyser();
    speakerAnalyser.fftSize = 64;
    speakerSource.connect(speakerAnalyser);

    const bufferLength = micAnalyser.frequencyBinCount;
    const dataArrayIn = new Uint8Array(bufferLength);
    const dataArrayOut = new Uint8Array(bufferLength);

    // Loop for reading levels & updating styles
    const draw = () => {
      animationFrameId = requestAnimationFrame(draw);

      micAnalyser.getByteFrequencyData(dataArrayIn);
      speakerAnalyser.getByteFrequencyData(dataArrayOut);

      // Compute average volumes
      let sumIn = 0;
      let sumOut = 0;
      for (let i = 0; i < bufferLength; i++) {
        sumIn += dataArrayIn[i];
        sumOut += dataArrayOut[i];
      }
      
      const avgIn = sumIn / bufferLength;
      const avgOut = sumOut / bufferLength;

      // Map averages to 0 - 100 percentage
      const volIn = Math.min(100, Math.round((avgIn / 128) * 100));
      const volOut = Math.min(100, Math.round((avgOut / 128) * 100));

      // Update linear levels UI
      barInFill.style.width = `${volIn}%`;
      barOutFill.style.width = `${volOut}%`;

      // Animate the voice orb state dynamically based on volume
      if (pc && pc.signalingState !== 'closed') {
        if (volOut > 6) {
          // Agent is actively speaking
          voiceOrb.className = 'voice-orb orb-speaking';
          const scaleVal = 1 + (volOut / 280);
          voiceOrb.style.transform = `scale(${scaleVal})`;
          voiceOrb.style.boxShadow = `0 0 ${40 + (volOut * 0.8)}px rgba(139, 92, 246, ${0.4 + (volOut / 150)})`;
        } else {
          // Agent is listening / idle
          voiceOrb.className = 'voice-orb orb-listening';
          voiceOrb.style.transform = 'scale(1)';
          // Breathing rhythm
          const pulse = 1 + (Math.sin(Date.now() / 250) * 0.02);
          voiceOrb.style.transform = `scale(${pulse})`;
          voiceOrb.style.boxShadow = '';
        }
      }
    };

    draw();
  } catch (e) {
    console.warn('AudioContext visualization setup failed:', e);
  }
}

// ==========================================================================
// Log & Transcript Display Helpers
// ==========================================================================

function appendTranscriptBubble(speaker, text) {
  // Remove placeholder if present
  const placeholder = transcriptFeed.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  // Remove existing loading bubbles
  const loader = transcriptFeed.querySelector('.bubble-loading');
  if (loader) loader.remove();

  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${speaker}`;
  
  const roleName = speaker === 'user' ? 'Caller' : 'Assistant';
  bubble.innerHTML = `
    <div class="bubble-meta">${roleName}</div>
    <div class="bubble-text">${text}</div>
  `;
  
  transcriptFeed.appendChild(bubble);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function appendOrUpdateAgentTranscript(delta) {
  // Remove placeholder if present
  const placeholder = transcriptFeed.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  // Remove existing loading bubbles
  const loader = transcriptFeed.querySelector('.bubble-loading');
  if (loader) loader.remove();

  if (!currentAgentBubbleText) {
    const bubble = document.createElement('div');
    bubble.className = 'bubble bubble-agent';
    bubble.innerHTML = `
      <div class="bubble-meta">Assistant</div>
      <div class="bubble-text"></div>
    `;
    transcriptFeed.appendChild(bubble);
    currentAgentBubbleText = bubble.querySelector('.bubble-text');
  }

  currentAgentBubbleText.textContent += delta;
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function finalizeAgentTranscript(transcript) {
  if (currentAgentBubbleText && transcript) {
    currentAgentBubbleText.textContent = transcript;
  }
  currentAgentBubbleText = null; // Clear reference for the next response
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

function addLogMessage(message, type = '') {
  // Remove placeholder if present
  const placeholder = transcriptFeed.querySelector('.transcript-placeholder');
  if (placeholder) placeholder.remove();

  const logDiv = document.createElement('div');
  logDiv.className = `bubble-log log-${type}`;
  
  let icon = '<i class="fa-solid fa-terminal"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check"></i>';
  if (type === 'info') icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-triangle-exclamation"></i>';

  logDiv.innerHTML = `${icon} <span>${message}</span>`;
  transcriptFeed.appendChild(logDiv);
  transcriptFeed.scrollTop = transcriptFeed.scrollHeight;
}

// Handle mute toggle
btnMute.addEventListener('click', () => {
  if (!localStream) return;
  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    const isMuted = !audioTrack.enabled;
    btnMute.querySelector('span').textContent = isMuted ? 'Unmute' : 'Mute';
    btnMute.className = isMuted ? 'btn btn-call-action btn-call-secondary btn-muted' : 'btn btn-call-action btn-call-secondary';
    addLogMessage(isMuted ? 'Microphone muted.' : 'Microphone unmuted.', 'info');
  }
});

// ==========================================================================
// Phone Dialer & Keypad Handlers (Premium DTMF Features)
// ==========================================================================
function pressDigit(digit) {
  const display = document.getElementById('dialer-number');
  if (!display) return;
  
  // DTMF key press sound
  playDTMF(digit);
  
  // Format phone numbers gracefully
  if (display.value === '+358 40 123 4567') {
    // Override starting digit if default number is present and a new number is started
    display.value = digit;
  } else {
    if (display.value.length < 20) {
      display.value += digit;
    }
  }
}

function backspaceDigit() {
  const display = document.getElementById('dialer-number');
  if (!display) return;
  
  // Short low beep for backspace click
  playDTMFTone(220, 330, 80);
  
  if (display.value.length > 0) {
    display.value = display.value.slice(0, -1);
  }
  
  if (display.value.length === 0) {
    display.value = '';
  }
}

function playDTMF(digit) {
  const dtmfFreqs = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  const freqs = dtmfFreqs[digit];
  if (!freqs) return;
  
  playDTMFTone(freqs[0], freqs[1], 150);
}

function playDTMFTone(freq1, freq2, durationMs) {
  const audioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!audioCtxClass) return;

  try {
    const ctx = new audioCtxClass();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    gainNode.gain.setValueAtTime(0.08, ctx.currentTime); // Standard soft feedback
    
    osc1.frequency.value = freq1;
    osc2.frequency.value = freq2;
    
    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    osc1.start();
    osc2.start();
    
    setTimeout(() => {
      osc1.stop();
      osc2.stop();
      ctx.close();
    }, durationMs);
  } catch (err) {
    console.warn('Web Audio playback failed or permission restricted:', err);
  }
}
