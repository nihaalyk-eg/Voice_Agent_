import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthWrapper';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const [adminOpen, setAdminOpen] = useState(false);
  const currentPath = window.location.pathname;

  // Auto-open admin sub-links if current page is an admin page
  useEffect(() => {
    const isAdminPage = ['/communications', '/customers', '/work-orders'].some(path => 
      currentPath === path || currentPath === `${path}.html`
    );
    if (isAdminPage) {
      setAdminOpen(true);
    }
  }, [currentPath]);

  const isActive = (paths) => {
    return paths.some(path => currentPath === path || currentPath === `${path}.html` || (path === '/' && currentPath === '/index.html'));
  };

  return (
    <aside className="sidebar-nav">
      <div className="sidebar-brand">
        <div className="logo-mark zora-logo">
          <i className="fa-solid fa-bolt"></i>
        </div>
        <span className="sidebar-brand-text zora-wordmark">Zora</span>
      </div>
      
      <nav className="sidebar-links">
        <a href="/" className={`sidebar-link ${isActive(['/']) ? 'active' : ''}`}>
          <i className="fa-solid fa-phone-volume"></i>
          <span>Voice Agent</span>
        </a>
        
        <a href="/email" className={`sidebar-link ${isActive(['/email']) ? 'active' : ''}`}>
          <i className="fa-solid fa-envelope-open-text"></i>
          <span>Email Agent</span>
        </a>
        
        {/* Admin Accordion Group */}
        <div className="sidebar-group">
          <button 
            type="button"
            className={`sidebar-group-trigger ${adminOpen ? 'open' : ''} ${isActive(['/communications', '/customers', '/work-orders']) ? 'active' : ''}`}
            onClick={() => setAdminOpen(!adminOpen)}
          >
            <i className="fa-solid fa-shield-halved group-icon"></i>
            <span>Admin</span>
            <i className={`fa-solid fa-chevron-down sidebar-group-chevron`}></i>
          </button>
          
          <div className={`sidebar-sub-links ${adminOpen ? 'open' : ''}`}>
            <a href="/communications" className={`sidebar-sub-link ${isActive(['/communications']) ? 'active' : ''}`}>
              <i className="fa-solid fa-clock-rotate-left"></i>
              <span>Communications</span>
            </a>
            <a href="/customers" className={`sidebar-sub-link ${isActive(['/customers']) ? 'active' : ''}`}>
              <i className="fa-solid fa-users"></i>
              <span>Customers</span>
            </a>
            <a href="/work-orders" className={`sidebar-sub-link ${isActive(['/work-orders']) ? 'active' : ''}`}>
              <i className="fa-solid fa-receipt"></i>
              <span>Work Orders</span>
            </a>
          </div>
        </div>
        
        <a href="/observability" className={`sidebar-link ${isActive(['/observability']) ? 'active' : ''}`}>
          <i className="fa-solid fa-chart-line"></i>
          <span>Observability</span>
        </a>
      </nav>
      
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-user-avatar" id="sidebar-user-avatar">
            {user?.initials || '?'}
          </div>
          <div className="sidebar-user-info">
            <div className="sidebar-user-name" id="sidebar-user-name">
              {user?.name || 'Loading...'}
            </div>
            <div className="sidebar-user-role">{user?.role || 'Zora Agent'}</div>
          </div>
        </div>
        <button 
          type="button" 
          className="btn-sidebar-logout" 
          onClick={logout}
        >
          <i className="fa-solid fa-right-from-bracket"></i> Sign Out
        </button>
      </div>
    </aside>
  );
};
