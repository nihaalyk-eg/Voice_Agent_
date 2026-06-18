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
  const [authenticated, setAuthenticated] = useState(() => !!sessionStorage.getItem('kc_token'));
  const [loading, setLoading] = useState(() => !sessionStorage.getItem('kc_token'));

  useEffect(() => {
    const keycloak = new Keycloak({
      url: 'https://egauth.cto.aks.egdev.eu',
      realm: 'EGAuthentication',
      clientId: 'pitchsync'
    });

    // Event hooks for seamless session synchronization across tabs/pages
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
      console.warn('Keycloak token refresh failed, clearing session storage.');
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
      }).catch((err) => {
        console.error('Failed to update token on expiration:', err);
      });
    };

    const cachedToken = sessionStorage.getItem('kc_token');
    const cachedRefreshToken = sessionStorage.getItem('kc_refreshToken');
    const cachedIdToken = sessionStorage.getItem('kc_idToken');

    const initPromise = keycloak.init({
      onLoad: 'login-required',
      redirectUri: `${window.location.origin}/`,
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
            let name = '';
            if (profile?.firstName || profile?.lastName) {
              name = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
            }
            if (!name) {
              name = keycloak.tokenParsed?.name ||
                     keycloak.tokenParsed?.preferred_username ||
                     keycloak.tokenParsed?.email ||
                     'User';
            }
            const initials = name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
            const userData = {
              name,
              initials,
              email: profile.email || keycloak.tokenParsed?.email,
              role: 'Zora Agent',
              profile
            };
            setUser(userData);
            sessionStorage.setItem('kc_user', JSON.stringify(userData));
          } catch (e) {
            console.error('Failed to load user profile, falling back to claims', e);
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
    if (!kcRef.current && initPromiseRef.current) {
      await initPromiseRef.current;
    }
    const currentKc = kcRef.current;
    if (!currentKc) throw new Error('Keycloak not initialized');
    await currentKc.updateToken(30);
    sessionStorage.setItem('kc_token', currentKc.token);
    if (currentKc.refreshToken) sessionStorage.setItem('kc_refreshToken', currentKc.refreshToken);
    if (currentKc.idToken) sessionStorage.setItem('kc_idToken', currentKc.idToken);
    setToken(currentKc.token);

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${currentKc.token}`
      }
    });
  };

  const logout = () => {
    sessionStorage.removeItem('kc_token');
    sessionStorage.removeItem('kc_refreshToken');
    sessionStorage.removeItem('kc_idToken');
    sessionStorage.removeItem('kc_user');
    const currentKc = kcRef.current || kc;
    if (currentKc) {
      currentKc.logout({ redirectUri: window.location.origin });
    }
  };

  if (loading) {
    return (
      <div className="loading-screen" style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'var(--bg-main, #0f0d1a)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: "'Outfit', sans-serif"
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '3px solid rgba(139, 92, 246, 0.2)',
          borderTopColor: 'var(--violet-glow, #8b5cf6)',
          animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '16px', fontSize: '14px', letterSpacing: '0.5px', color: 'var(--text-secondary, #a7a2c4)' }}>
          Authenticating with Keycloak...
        </p>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0f0d1a', color: '#ff4d4d' }}>
        <p>Authentication Failed. Please reload the page.</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, token, authFetch, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
