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
