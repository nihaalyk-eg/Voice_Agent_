import React from 'react';
import { useAuth } from './AuthWrapper';
import { useNav } from '../NavContext';

export const Sidebar = () => {
  const { user, logout } = useAuth();
  const { page, navigate } = useNav();

  const isActive = (...pages) => pages.includes(page);

  const go = (path) => (e) => {
    e.preventDefault();
    navigate(path);
  };

  return (
    <aside className="sidebar-nav">
      <a href="/" onClick={go('/')} className="sidebar-brand" style={{ textDecoration: 'none' }}>
        <div className="logo-mark zora-logo">
          <i className="fa-solid fa-bolt"></i>
        </div>
        <span className="sidebar-brand-text zora-wordmark">Zora</span>
      </a>

      <nav className="sidebar-links">
        <a href="/" onClick={go('/')} className={`sidebar-link ${isActive('voice', '') ? 'active' : ''}`}>
          <i className="fa-solid fa-microphone-lines"></i>
          <span>Voice Agent</span>
        </a>

        <div style={{ padding: '12px 14px 4px 14px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
          Admin
        </div>

        <a href="/customers" onClick={go('/customers')} className={`sidebar-link ${isActive('customers', 'customer-db') ? 'active' : ''}`}>
          <i className="fa-solid fa-address-book"></i>
          <span>Customers</span>
        </a>

        <a href="/work-orders" onClick={go('/work-orders')} className={`sidebar-link ${isActive('work-orders') ? 'active' : ''}`}>
          <i className="fa-solid fa-clipboard-list"></i>
          <span>Work Orders</span>
        </a>

        <a href="/transcripts" onClick={go('/transcripts')} className={`sidebar-link ${isActive('transcripts') ? 'active' : ''}`}>
          <i className="fa-solid fa-comments"></i>
          <span>Call Transcripts</span>
        </a>

        <a href="/logs" onClick={go('/logs')} className={`sidebar-link ${isActive('logs') ? 'active' : ''}`}>
          <i className="fa-solid fa-terminal"></i>
          <span>Live Logs</span>
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
