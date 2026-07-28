import React, { createContext, useContext, useState, useEffect } from 'react';

const NavContext = createContext(null);

export const useNav = () => useContext(NavContext);

const getPage = () => {
  const path = window.location.pathname;
  // All SPA routes are under /voice/
  if (path.startsWith('/voice/customers') || path.startsWith('/voice/admin') || path.startsWith('/voice/customer-db')) {
    return 'customers';
  }
  if (path.startsWith('/voice/work-orders')) return 'work-orders';
  if (path.startsWith('/voice/transcripts')) return 'transcripts';
  return 'voice';
};

export const NavProvider = ({ children }) => {
  const [page, setPage] = useState(getPage);
  const [lastAgentContext, setLastAgentContext] = useState('voice');

  useEffect(() => {
    const onPop = () => setPage(getPage());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
