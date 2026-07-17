import React, { createContext, useContext, useState, useEffect } from 'react';

const NavContext = createContext(null);

export const useNav = () => useContext(NavContext);

const getPage = () => {
  return window.location.pathname.startsWith('/customer-db') ? 'customer-db' : 'voice';
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
