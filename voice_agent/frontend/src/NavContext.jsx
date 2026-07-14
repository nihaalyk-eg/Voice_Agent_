import React, { createContext, useContext, useState, useEffect } from 'react';

const NavContext = createContext(null);

export const useNav = () => useContext(NavContext);

const getPage = () => {
  const p = window.location.pathname;
  if (p === '/voice' || p.startsWith('/voice/')) return 'voice';
  if (p === '/work-orders' || p.startsWith('/work-orders')) return 'work-orders';
  if (p === '/communications' || p.startsWith('/communications')) return 'communications';
  if (p === '/customers' || p.startsWith('/customers')) return 'customers';
  if (p === '/observability' || p.startsWith('/observability')) return 'observability';
  return 'email';
};

export const NavProvider = ({ children }) => {
  const [page, setPage] = useState(getPage);
  // Remembers whichever of voice/email you were last on, so shared admin
  // pages (Communications) can default their content to that agent's
  // channel instead of always showing everything mixed together.
  const [lastAgentContext, setLastAgentContext] = useState(() => {
    const p = getPage();
    return p === 'voice' ? 'voice' : 'email';
  });

  useEffect(() => {
    const onPop = () => setPage(getPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (page === 'voice' || page === 'email') setLastAgentContext(page);
  }, [page]);

  const navigate = (path) => {
    window.history.pushState({}, '', path);
    setPage(getPage());
  };

  return (
    <NavContext.Provider value={{ page, navigate, lastAgentContext }}>
      {children}
    </NavContext.Provider>
  );
};
