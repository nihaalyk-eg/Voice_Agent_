// ==========================================================================
// Keycloak Auth (shared across all pages)
// ==========================================================================
let kc = null;

async function initKeycloak() {
  kc = new Keycloak({
    url: 'https://egauth.cto.aks.egdev.eu',
    realm: 'EGAuthentication',
    clientId: 'pitchsync'
  });
  await kc.init({ onLoad: 'login-required', checkLoginIframe: false });
  setupSidebarUser();
}

async function authFetch(url, options = {}) {
  await kc.updateToken(30);
  return fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${kc.token}` }
  });
}

function setupSidebarUser() {
  const nameEl = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (!kc?.tokenParsed) return;
  const name = kc.tokenParsed.name || kc.tokenParsed.preferred_username || 'User';
  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  if (nameEl) nameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = initials;
}

function logout() {
  kc.logout({ redirectUri: window.location.origin });
}
