let allComms = [];
let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  loadCommunications();
});

async function loadCommunications() {
  try {
    const res = await authFetch('/api/communications');
    allComms = await res.json();
    renderCommunications();
  } catch (err) { console.error('Failed to load communications:', err); }
}

function filterComms(type) {
  activeFilter = type;
  document.querySelectorAll('.comms-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === type));
  renderCommunications();
}

function renderCommunications() {
  const timeline = document.getElementById('comms-timeline');
  const items = activeFilter === 'all' ? allComms : allComms.filter(c => c.type === activeFilter);

  if (!items.length) {
    timeline.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-inbox"></i><p>No ${activeFilter === 'all' ? '' : activeFilter.replace('_', ' ')} records found.</p></div>`;
    return;
  }

  const typeIcon = { call_transcript: 'fa-phone', sms_confirmation: 'fa-message', email_intake: 'fa-envelope', escalation: 'fa-triangle-exclamation' };
  const typeLabel = { call_transcript: 'Call Transcript', sms_confirmation: 'SMS Confirmation', email_intake: 'Email Intake', escalation: 'Emergency Escalation' };

  timeline.innerHTML = items.map(c => {
    const icon = typeIcon[c.type] || 'fa-circle';
    const label = typeLabel[c.type] || c.type;
    const time = new Date(c.timestamp).toLocaleString('fi-FI');
    const linkedWo = c.linked_work_order ? `<span class="comms-linked-wo" onclick="window.location='/work-orders.html'"><i class="fa-solid fa-receipt"></i>${c.linked_work_order}</span>` : '';

    let content = '';
    if (c.type === 'call_transcript') {
      const msgs = Array.isArray(c.transcript) ? c.transcript : (c.transcript ? Object.values(c.transcript) : []);
      content = `
        ${c.summary ? `<div class="comms-summary">${c.summary}</div>` : ''}
        ${c.duration_seconds ? `<span class="comms-duration"><i class="fa-solid fa-stopwatch"></i>${c.duration_seconds}s</span>` : ''}
        ${msgs.length ? `<details class="comms-transcript-details"><summary><i class="fa-solid fa-chevron-right"></i>View Transcript</summary>
          <div class="comms-transcript-content">${msgs.map(m => `<div class="transcript-msg transcript-msg-${m.role}"><span class="tm-role">${m.role}</span><span class="tm-text">${m.text || m.content || ''}</span></div>`).join('')}</div>
        </details>` : ''}`;
    } else if (c.type === 'sms_confirmation') {
      content = `<div class="comms-sms-recipient"><i class="fa-solid fa-phone"></i>${c.recipient_phone || c.caller_phone || ''}</div><div class="comms-sms-body">${c.message || ''}</div>`;
    } else if (c.type === 'email_intake') {
      const orig = c.original_email || {};
      content = `<div class="comms-email-from"><i class="fa-solid fa-user"></i>${orig.from || c.sender_email || ''}</div><div class="comms-email-subject">${orig.subject || ''}</div><div class="comms-summary">${c.summary || ''}</div>`;
    } else if (c.type === 'escalation') {
      content = `<div class="comms-escalation-reason"><i class="fa-solid fa-siren-on"></i>${c.reason || ''}</div>${c.property_address ? `<div class="comms-escalation-addr"><i class="fa-solid fa-location-dot"></i>${c.property_address}</div>` : ''}`;
    }

    return `
      <div class="comms-item comms-${c.type}">
        <div class="comms-item-icon"><i class="fa-solid ${icon}"></i></div>
        <div class="comms-item-body">
          <div class="comms-item-header">
            <span class="comms-type-label">${label}</span>
            ${linkedWo}
            <span class="comms-timestamp">${time}</span>
          </div>
          <div class="comms-item-content">${content}</div>
        </div>
      </div>`;
  }).join('');
}
