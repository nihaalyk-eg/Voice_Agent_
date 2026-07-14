import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import Keycloak from 'keycloak-js';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthWrapper');
  return context;
};

export const AuthWrapper = ({ children }) => {
  const [kc, setKc] = useState(null);
  const kcRef = useRef(null);
  const initPromiseRef = useRef(null);

  const [user, setUser] = useState(() => {
    try {
      const cached = sessionStorage.getItem('kc_user');
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [token, setToken] = useState(() => sessionStorage.getItem('kc_token'));
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const keycloak = new Keycloak({
      url: 'https://egauth.cto.aks.egdev.eu',
      realm: 'EGAuthentication',
      clientId: 'pitchsync'
    });

    keycloak.onAuthSuccess = () => {
      sessionStorage.setItem('kc_token', keycloak.token);
      if (keycloak.refreshToken) sessionStorage.setItem('kc_refreshToken', keycloak.refreshToken);
      if (keycloak.idToken) sessionStorage.setItem('kc_idToken', keycloak.idToken);
      setToken(keycloak.token);
      setAuthenticated(true);
    };

    keycloak.onAuthRefreshSuccess = () => {
      sessionStorage.setItem('kc_token', keycloak.token);
      if (keycloak.refreshToken) sessionStorage.setItem('kc_refreshToken', keycloak.refreshToken);
      if (keycloak.idToken) sessionStorage.setItem('kc_idToken', keycloak.idToken);
      setToken(keycloak.token);
    };

    keycloak.onAuthRefreshError = () => {
      sessionStorage.removeItem('kc_token');
      sessionStorage.removeItem('kc_refreshToken');
      sessionStorage.removeItem('kc_idToken');
      sessionStorage.removeItem('kc_user');
      setToken(null);
      setAuthenticated(false);
    };

    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).then((refreshed) => {
        if (refreshed) {
          sessionStorage.setItem('kc_token', keycloak.token);
          if (keycloak.refreshToken) sessionStorage.setItem('kc_refreshToken', keycloak.refreshToken);
          if (keycloak.idToken) sessionStorage.setItem('kc_idToken', keycloak.idToken);
          setToken(keycloak.token);
        }
      }).catch(console.error);
    };

    const cachedToken = sessionStorage.getItem('kc_token');
    const cachedRefreshToken = sessionStorage.getItem('kc_refreshToken');
    const cachedIdToken = sessionStorage.getItem('kc_idToken');

    const initPromise = keycloak.init({
      onLoad: 'login-required',
      redirectUri: window.location.pathname.startsWith('/voice')
        ? window.location.origin + '/voice'
        : window.location.origin + '/email/',
      token: cachedToken || undefined,
      refreshToken: cachedRefreshToken || undefined,
      idToken: cachedIdToken || undefined,
      checkLoginIframe: false
    })
      .then(async (auth) => {
        setKc(keycloak);
        kcRef.current = keycloak;
        setAuthenticated(auth);

        if (auth) {
          sessionStorage.setItem('kc_token', keycloak.token);
          if (keycloak.refreshToken) sessionStorage.setItem('kc_refreshToken', keycloak.refreshToken);
          if (keycloak.idToken) sessionStorage.setItem('kc_idToken', keycloak.idToken);
          setToken(keycloak.token);

          try {
            const profile = await keycloak.loadUserProfile();
            let name = [profile.firstName, profile.lastName].filter(Boolean).join(' ')
              || keycloak.tokenParsed?.name
              || keycloak.tokenParsed?.preferred_username
              || keycloak.tokenParsed?.email
              || 'User';
            const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
            const userData = { name, initials, email: profile.email || keycloak.tokenParsed?.email, role: 'Zora Agent', profile };
            setUser(userData);
            sessionStorage.setItem('kc_user', JSON.stringify(userData));
          } catch {
            const name = keycloak.tokenParsed?.name || keycloak.tokenParsed?.email || 'User';
            const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
            const userData = { name, initials, role: 'Zora Agent' };
            setUser(userData);
            sessionStorage.setItem('kc_user', JSON.stringify(userData));
          }
        } else {
          sessionStorage.removeItem('kc_token');
          sessionStorage.removeItem('kc_refreshToken');
          sessionStorage.removeItem('kc_idToken');
          sessionStorage.removeItem('kc_user');
        }
        setLoading(false);
        return auth;
      })
      .catch((err) => {
        console.error('Keycloak initialization error:', err);
        setLoading(false);
        throw err;
      });

    initPromiseRef.current = initPromise;
  }, []);

  const authFetch = async (url, options = {}) => {
    if (!kcRef.current && initPromiseRef.current) await initPromiseRef.current;
    const currentKc = kcRef.current;
    if (!currentKc) throw new Error('Keycloak not initialized');
    await currentKc.updateToken(30);
    sessionStorage.setItem('kc_token', currentKc.token);
    if (currentKc.refreshToken) sessionStorage.setItem('kc_refreshToken', currentKc.refreshToken);
    if (currentKc.idToken) sessionStorage.setItem('kc_idToken', currentKc.idToken);
    setToken(currentKc.token);
    return fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${currentKc.token}` }
    });
  };

  const logout = () => {
    sessionStorage.removeItem('kc_token');
    sessionStorage.removeItem('kc_refreshToken');
    sessionStorage.removeItem('kc_idToken');
    sessionStorage.removeItem('kc_user');
    const currentKc = kcRef.current || kc;
    if (currentKc) currentKc.logout({ redirectUri: window.location.origin });
  };

  if (loading) {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', gap: '14px',
        justifyContent: 'center', alignItems: 'center',
        background: 'var(--bg-primary)', color: 'var(--text-primary)',
        fontFamily: "'Outfit', sans-serif"
      }}>
        <div className="logo-mark zora-logo" style={{ width: 48, height: 48, fontSize: 22 }}>
          <i className="fa-solid fa-bolt"></i>
        </div>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          border: '3px solid var(--border-light)', borderTopColor: 'var(--violet-glow)',
          animation: 'spin 0.8s linear infinite'
        }} />
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Authenticating…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100vw', height: '100vh', background: 'var(--bg-primary)', color: '#ff4d4d' }}>
        <p>Authentication failed. Please reload the page.</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, authFetch, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
