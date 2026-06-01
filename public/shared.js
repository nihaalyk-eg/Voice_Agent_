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
  // Try full profile first (has firstName + lastName), fall back to token claims
  try {
    const profile = await kc.loadUserProfile();
    setupSidebarUser(profile);
  } catch {
    setupSidebarUser(null);
  }
}

async function authFetch(url, options = {}) {
  await kc.updateToken(30);
  return fetch(url, {
    ...options,
    headers: { ...options.headers, 'Authorization': `Bearer ${kc.token}` }
  });
}

function setupSidebarUser(profile) {
  const nameEl = document.getElementById('sidebar-user-name');
  const avatarEl = document.getElementById('sidebar-user-avatar');

  let name = '';
  if (profile?.firstName || profile?.lastName) {
    name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  }
  if (!name) {
    name = kc?.tokenParsed?.name
      || kc?.tokenParsed?.preferred_username
      || kc?.tokenParsed?.email
      || 'User';
  }

  const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
  if (nameEl) nameEl.textContent = name;
  if (avatarEl) avatarEl.textContent = initials;
}

function logout() {
  kc.logout({ redirectUri: window.location.origin });
}
