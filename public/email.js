document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  loadEmailTemplates();
});

async function loadEmailTemplates() {
  try {
    const res = await authFetch('/api/email-templates');
    const templates = await res.json();
    renderEmailTemplateButtons(templates);
  } catch (err) { console.error('Failed to load templates:', err); }
}

function renderEmailTemplateButtons(templates) {
  const container = document.getElementById('email-template-buttons');
  container.innerHTML = templates.map(tpl => `
    <button class="btn-email-template" onclick='loadEmailTemplate(${JSON.stringify(tpl)})'>${tpl.label}</button>
  `).join('');
}

function loadEmailTemplate(tpl) {
  document.getElementById('email-from').value = tpl.from || '';
  document.getElementById('email-subject').value = tpl.subject || '';
  document.getElementById('email-body').value = tpl.body || '';
  document.getElementById('email-form').classList.add('template-loaded');
  setTimeout(() => document.getElementById('email-form').classList.remove('template-loaded'), 600);
}

async function submitEmail(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-email');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Processing...</span>';

  const payload = {
    from: document.getElementById('email-from').value,
    subject: document.getElementById('email-subject').value,
    body: document.getElementById('email-body').value
  };

  try {
    const res = await authFetch('/api/email-intake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await res.json();
    if (res.ok) {
      renderExtractionResults(result);
      addProcessedEmailEntry(result);
      document.getElementById('email-form').reset();
    } else {
      document.getElementById('email-results').innerHTML = `
        <div class="extraction-error"><i class="fa-solid fa-circle-xmark"></i><span>${result.error || 'Processing failed.'}</span></div>`;
    }
  } catch (err) {
    document.getElementById('email-results').innerHTML = `
      <div class="extraction-error"><i class="fa-solid fa-circle-xmark"></i><span>Network error: ${err.message}</span></div>`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-robot"></i><span>Process with AI Email Agent</span>';
  }
}

function renderExtractionResults(result) {
  const wo = result.work_order;
  if (!wo) return;
  const yesNo = v => v ? `<span class="ef-tag ef-tag-green">YES</span>` : `<span class="ef-tag ef-tag-red">NO</span>`;
  document.getElementById('email-results').innerHTML = `
    <div class="extraction-success">
      <div class="extraction-header">
        <i class="fa-solid fa-circle-check"></i>
        <div><strong>Work Order ${wo.id} Created</strong><span>${result.parsing_method === 'llm' ? 'AI Agent' : 'Regex Fallback'} — ${wo.urgency_level}</span></div>
      </div>
      <div class="extraction-grid">
        <div class="extraction-field extraction-field-full"><div class="ef-label"><i class="fa-solid fa-location-dot"></i> Property</div><div class="ef-value ${wo.property_address.includes('UNKNOWN') ? 'ef-warn' : ''}">${wo.property_address}</div></div>
        <div class="extraction-field"><div class="ef-label"><i class="fa-solid fa-door-open"></i> Apartment</div><div class="ef-value">${wo.apartment_number || 'N/A'}</div></div>
        <div class="extraction-field"><div class="ef-label"><i class="fa-solid fa-phone"></i> Contact</div><div class="ef-value">${wo.caller_phone_number}</div></div>
        <div class="extraction-field"><div class="ef-label"><i class="fa-solid fa-key"></i> Master Key</div><div class="ef-value">${yesNo(wo.permit_master_key)}</div></div>
        <div class="extraction-field"><div class="ef-label"><i class="fa-solid fa-user-gear"></i> Technician</div><div class="ef-value">${wo.technician}</div></div>
        <div class="extraction-field extraction-field-full"><div class="ef-label"><i class="fa-solid fa-screwdriver-wrench"></i> Issue</div><div class="ef-value">${wo.issue_description}</div></div>
        ${wo.special_notes ? `<div class="extraction-field extraction-field-full"><div class="ef-label"><i class="fa-solid fa-note-sticky"></i> Notes</div><div class="ef-value">${wo.special_notes}</div></div>` : ''}
      </div>
    </div>`;
}

function addProcessedEmailEntry(result) {
  const feed = document.getElementById('processed-emails-feed');
  const placeholder = feed.querySelector('.loading-placeholder');
  if (placeholder) placeholder.remove();
  const wo = result.work_order;
  const entry = document.createElement('div');
  entry.className = 'processed-email-entry';
  entry.innerHTML = `
    <div class="pe-header">
      <span class="pe-id"><i class="fa-solid fa-hashtag"></i>${wo?.id || 'N/A'}</span>
      <span class="pe-time">${new Date().toLocaleTimeString('fi-FI')}</span>
    </div>
    <div class="pe-from"><i class="fa-solid fa-user"></i>${result.email?.from || ''}</div>
    <div class="pe-issue">${wo?.issue_description || ''}</div>
    <div class="pe-address"><i class="fa-solid fa-location-dot"></i>${wo?.property_address || ''}</div>`;
  feed.prepend(entry);
}
