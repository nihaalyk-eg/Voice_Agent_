let properties = [];
let workOrders = [];
let activeTechFilter = null;
let activePropertyFilter = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  await Promise.all([loadProperties(), loadWorkOrders()]);
  setupResizers();
});

async function loadProperties() {
  try {
    const res = await authFetch('/api/properties');
    properties = await res.json();
    renderTechnicians();
    renderProperties();
  } catch (err) {
    console.error('Failed to load properties:', err);
  }
}

async function loadWorkOrders() {
  try {
    const res = await authFetch('/api/work-orders');
    workOrders = await res.json();
    renderWorkOrders();
    document.getElementById('wo-count').textContent = workOrders.length + ' Active';
    document.getElementById('wo-badge').textContent = workOrders.length;
  } catch (err) {
    console.error('Failed to load work orders:', err);
  }
}

function renderTechnicians() {
  const list = document.getElementById('tech-list');
  const uniqueTechs = [];
  properties.forEach(p => {
    if (!uniqueTechs.some(t => t.name === p.technician)) {
      uniqueTechs.push({ name: p.technician, phone: p.technician_phone, company: p.company });
    }
  });
  list.innerHTML = uniqueTechs.map(t => `
    <li class="tech-item ${activeTechFilter === t.name ? 'tech-item-active' : ''}" onclick="toggleTechFilter('${t.name}')">
      <div class="tech-info">
        <span class="tech-name"><i class="fa-solid fa-user-helmet-safety" style="color:var(--violet-glow);margin-right:6px;"></i>${t.name}</span>
        <span class="tech-meta"><i class="fa-solid fa-phone"></i>${t.phone}</span>
        <span class="tech-meta" style="color:var(--text-muted);font-size:10px;">${t.company}</span>
      </div>
    </li>`).join('');
}

function renderProperties() {
  const list = document.getElementById('property-list');
  list.innerHTML = properties.map(p => `
    <li class="property-item ${activePropertyFilter === p.address ? 'property-item-active' : ''}" onclick="togglePropertyFilter('${p.address.replace(/'/g,"\\'")}')">
      <div class="property-info">
        <span class="property-address"><i class="fa-solid fa-location-dot" style="color:var(--cyan-glow);margin-right:6px;"></i>${p.address}</span>
        <span class="property-meta">${p.technician}</span>
      </div>
    </li>`).join('');
}

function toggleTechFilter(name) {
  activeTechFilter = activeTechFilter === name ? null : name;
  activePropertyFilter = null;
  renderTechnicians();
  renderProperties();
  renderWorkOrders();
}

function togglePropertyFilter(address) {
  activePropertyFilter = activePropertyFilter === address ? null : address;
  activeTechFilter = null;
  renderTechnicians();
  renderProperties();
  renderWorkOrders();
}

function renderWorkOrders() {
  const board = document.getElementById('work-orders-board');
  let filtered = workOrders;
  if (activeTechFilter) filtered = filtered.filter(w => w.technician === activeTechFilter);
  if (activePropertyFilter) filtered = filtered.filter(w => w.property_address === activePropertyFilter);

  if (!filtered.length) {
    board.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-inbox"></i><p>${activeTechFilter || activePropertyFilter ? 'No work orders match the current filter.' : 'No work orders found.'}</p></div>`;
    return;
  }

  const statusClass = s => ({ 'Assigned': 'status-assigned', 'In Progress': 'status-progress', 'Completed': 'status-completed' }[s] || 'status-assigned');
  board.innerHTML = filtered.map(wo => `
    <div class="wo-card" id="wo-${wo.id}">
      <div class="wo-card-header">
        <span class="wo-id"><i class="fa-solid fa-hashtag"></i>${wo.id}</span>
        <div class="wo-badges">
          <span class="badge-source ${wo.source === 'email' ? 'source-email' : 'source-voice'}">
            <i class="fa-solid fa-${wo.source === 'email' ? 'envelope' : 'phone'}"></i>${wo.source || 'voice'}
          </span>
          <span class="badge-status ${statusClass(wo.status)}">${wo.status}</span>
          <span class="badge-urgency ${wo.urgency_level === 'Urgent' ? 'urgency-urgent' : 'urgency-standard'}">${wo.urgency_level}</span>
        </div>
      </div>
      <div class="wo-details">
        <div class="detail-row"><i class="fa-solid fa-location-dot"></i><div class="detail-content"><span class="detail-label">Address</span><span class="detail-val">${wo.property_address}</span></div></div>
        <div class="detail-row"><i class="fa-solid fa-door-open"></i><div class="detail-content"><span class="detail-label">Apartment</span><span class="detail-val">${wo.apartment_number || 'N/A'}</span></div></div>
        <div class="detail-row"><i class="fa-solid fa-user-gear"></i><div class="detail-content"><span class="detail-label">Technician</span><span class="detail-val">${wo.technician}</span></div></div>
        <div class="detail-row"><i class="fa-solid fa-clock"></i><div class="detail-content"><span class="detail-label">Scheduled</span><span class="detail-val">${wo.scheduled_time}</span></div></div>
        <div class="wo-details-full detail-row"><i class="fa-solid fa-screwdriver-wrench"></i><div class="detail-content"><span class="detail-label">Issue</span><span class="detail-val">${wo.issue_description}</span></div></div>
      </div>
      <div class="wo-footer">
        <span class="wo-time"><i class="fa-regular fa-clock"></i>${new Date(wo.created_at).toLocaleString('fi-FI')}</span>
        <div class="wo-actions-wrap">
          <div class="wo-card-actions">
            <button class="btn-action-status" onclick="cycleStatus('${wo.id}','${wo.status}')" title="Advance status"><i class="fa-solid fa-arrow-right"></i></button>
            <button class="btn-action-delete" onclick="deleteWorkOrder('${wo.id}')" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

async function cycleStatus(id, currentStatus) {
  const next = currentStatus === 'Assigned' ? 'In Progress' : 'Completed';
  try {
    const res = await authFetch(`/api/work-orders/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }) });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    const idx = workOrders.findIndex(w => w.id === id);
    if (idx !== -1) { workOrders[idx] = updated; renderWorkOrders(); }
  } catch (err) { console.error('Failed to update status:', err); }
}

async function deleteWorkOrder(id) {
  if (!confirm(`Delete Work Order ${id}?`)) return;
  try {
    const res = await authFetch(`/api/work-orders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error();
    workOrders = workOrders.filter(w => w.id !== id);
    renderWorkOrders();
    document.getElementById('wo-count').textContent = workOrders.length + ' Active';
    document.getElementById('wo-badge').textContent = workOrders.length;
  } catch (err) { console.error('Failed to delete:', err); }
}

function setupResizers() {
  makeResizable('splitter-sidebar-board', '.erp-sidebar');
}

function makeResizable(splitterId, leftSelector) {
  const splitter = document.getElementById(splitterId);
  if (!splitter) return;
  const left = document.querySelector(leftSelector);
  if (!left) return;
  let dragging = false;
  splitter.addEventListener('mousedown', e => { dragging = true; splitter.classList.add('dragging'); e.preventDefault(); });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const parent = splitter.parentElement.getBoundingClientRect();
    const newW = Math.max(180, Math.min(500, e.clientX - parent.left));
    left.style.width = newW + 'px';
    left.style.flex = `0 0 ${newW}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; splitter.classList.remove('dragging'); });
}
