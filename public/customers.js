let allCustomers = [];
let searchTimer = null;

document.addEventListener('DOMContentLoaded', async () => {
  await initKeycloak();
  loadCustomers();
});

async function loadCustomers(search = '') {
  const grid = document.getElementById('customers-grid');
  const countEl = document.getElementById('customer-count');
  try {
    const url = search ? `/api/customers?search=${encodeURIComponent(search)}` : '/api/customers';
    const res = await authFetch(url);
    allCustomers = await res.json();
    countEl.textContent = `${allCustomers.length} resident${allCustomers.length !== 1 ? 's' : ''}`;
    renderCustomers(allCustomers);
  } catch (err) {
    grid.innerHTML = `<div class="customers-empty"><i class="fa-solid fa-circle-xmark"></i><p>Failed to load customers.</p></div>`;
    console.error(err);
  }
}

function handleSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadCustomers(value.trim()), 300);
}

function renderCustomers(customers) {
  const grid = document.getElementById('customers-grid');
  if (!customers.length) {
    grid.innerHTML = `<div class="customers-empty"><i class="fa-solid fa-user-slash"></i><p>No customers found.</p></div>`;
    return;
  }

  grid.innerHTML = customers.map(c => {
    const initials = c.full_name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    return `
      <div class="customer-card">
        <div class="customer-card-header">
          <div class="customer-avatar">${initials}</div>
          <div>
            <div class="customer-name">${c.full_name}</div>
            <div class="customer-phone">${c.phone_number}</div>
          </div>
        </div>
        <div class="customer-details">
          <div class="customer-detail-row">
            <i class="fa-solid fa-location-dot"></i>
            <span>${c.property_address}</span>
          </div>
          <div class="customer-detail-row">
            <i class="fa-solid fa-door-open"></i>
            <span>Apartment ${c.apartment_number}</span>
          </div>
          ${c.email ? `<div class="customer-detail-row"><i class="fa-solid fa-envelope"></i><span>${c.email}</span></div>` : ''}
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="customer-lang-badge"><i class="fa-solid fa-globe"></i>${c.language_preference}</span>
          ${c.notes ? `<span class="customer-notes"><i class="fa-solid fa-note-sticky" style="margin-right:4px;color:var(--violet-glow);"></i>${c.notes}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}
