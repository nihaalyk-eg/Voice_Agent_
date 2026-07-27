import React, { createContext, useContext, useState, useEffect } from 'react';

const NavContext = createContext(null);

export const useNav = () => useContext(NavContext);

const getPage = () => {
  const path = window.location.pathname;
  if (path.startsWith('/admin') || path.startsWith('/customer-db') || path.startsWith('/customers') || path.startsWith('/work-orders') || path.startsWith('/transcripts') || path.startsWith('/logs')) {
    if (path.startsWith('/work-orders')) return 'work-orders';
    if (path.startsWith('/transcripts')) return 'transcripts';
    if (path.startsWith('/logs')) return 'logs';
    return 'customers';
  }
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
