import React from 'react';

export const EscalationBanner = ({ active, reason, onDismiss }) => {
  if (!active) return null;

  return (
    <div id="escalation-banner" className="escalation-banner escalation-active">
      <div className="escalation-content">
        <i className="fa-solid fa-triangle-exclamation"></i>
        <span id="escalation-text">EMERGENCY ESCALATION — {reason || 'Transferring to 24/7 operator'}</span>
        <button 
          type="button" 
          className="btn-dismiss-escalation" 
          onClick={onDismiss}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
  );
};
