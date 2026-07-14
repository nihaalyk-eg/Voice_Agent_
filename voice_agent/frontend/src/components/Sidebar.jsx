import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthWrapper';
import { useNav } from '../NavContext';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const { page, navigate, lastAgentContext } = useNav();
  const [adminOpen, setAdminOpen] = useState(false);

  const adminPages = ['work-orders', 'communications', 'customers'];

  useEffect(() => {
    if (adminPages.includes(page)) setAdminOpen(true);
  }, [page]);

  const isActive = (...pages) => pages.includes(page);

  const go = (path, pageName) => (e) => {
    if (pageName === 'voice') {
      e.preventDefault();
      navigate(path);
    } else {
      // Hard navigation to the other SPA
      e.preventDefault();
      window.location.href = path;
    }
  };

  return (
    <aside className="sidebar-nav">
      <a href="/" className="sidebar-brand" style={{ textDecoration: 'none' }}>
        <div className="logo-mark zora-logo">
          <i className="fa-solid fa-bolt"></i>
        </div>
        <span className="sidebar-brand-text zora-wordmark">Zora</span>
      </a>

      <nav className="sidebar-links">
        {lastAgentContext !== 'email' && (
          <a href="/voice" onClick={go('/voice', 'voice')} className={`sidebar-link ${isActive('voice') ? 'active' : ''}`}>
            <i className="fa-solid fa-microphone-lines"></i>
            <span>Voice Agent</span>
          </a>
        )}

        {lastAgentContext !== 'voice' && (
          <a href="/email" onClick={go('/email', 'email')} className={`sidebar-link ${isActive('email') ? 'active' : ''}`}>
            <i className="fa-solid fa-envelope-open-text"></i>
            <span>Email Agent</span>
          </a>
        )}

        <div className="sidebar-group">
          <button
            type="button"
            className={`sidebar-group-trigger ${adminOpen ? 'open' : ''} ${isActive('work-orders', 'communications', 'customers') ? 'active' : ''}`}
            onClick={() => setAdminOpen(!adminOpen)}
          >
            <i className="fa-solid fa-shield-halved group-icon"></i>
            <span>Admin</span>
            <i className="fa-solid fa-chevron-down sidebar-group-chevron"></i>
          </button>

          <div className={`sidebar-sub-links ${adminOpen ? 'open' : ''}`}>
            <a href="/communications" onClick={go('/communications', 'communications')} className={`sidebar-sub-link ${isActive('communications') ? 'active' : ''}`}>
              <i className="fa-solid fa-clock-rotate-left"></i>
              <span>Communications</span>
            </a>
            <a href="/customers" onClick={go('/customers', 'customers')} className={`sidebar-sub-link ${isActive('customers') ? 'active' : ''}`}>
              <i className="fa-solid fa-users"></i>
              <span>Customers</span>
            </a>
            <a href="/work-orders" onClick={go('/work-orders', 'work-orders')} className={`sidebar-sub-link ${isActive('work-orders') ? 'active' : ''}`}>
              <i className="fa-solid fa-receipt"></i>
              <span>Work Orders</span>
            </a>
          </div>
        </div>
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
