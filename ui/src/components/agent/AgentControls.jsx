import React from 'react';

export function AgentControls({ 
  isActive, 
  isConnecting, 
  startDisabled, 
  needsPhone, 
  startSession, 
  hangupSession, 
  hangupConfirming, 
  sessionState, 
  toggleMute, 
  muted 
}) {
  return (
    <div style={{ display: 'flex', gap: '10px', flexShrink: 0, flexWrap: 'wrap' }}>
      {!isActive && (
        <button
          type="button"
          onClick={startSession}
          disabled={startDisabled}
          title={needsPhone ? 'Dial a Caller ID number first' : ''}
          style={{
            flex: '1 1 200px', padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
            cursor: startDisabled ? 'not-allowed' : 'pointer',
            background: 'var(--violet-glow)',
            color: '#fff',
            border: 'none',
            opacity: startDisabled ? 0.5 : 1,
            fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'opacity 0.15s',
          }}
        >
          {isConnecting
            ? <><i className="fa-solid fa-circle-notch fa-spin"></i> Connecting…</>
            : <><i className="fa-solid fa-phone"></i> {needsPhone ? 'Dial a number first' : 'Start Session'}</>
          }
        </button>
      )}
      {isActive && (
        <>
          <button
            type="button"
            onClick={hangupSession}
            style={{
              flex: '1 1 200px', padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 700,
              cursor: 'pointer',
              background: hangupConfirming
                ? 'var(--red-glow)'
                : 'rgba(239,68,68,0.15)',
              color: hangupConfirming ? '#fff' : 'var(--red-glow)',
              border: `1px solid ${hangupConfirming ? 'var(--red-glow)' : 'rgba(239,68,68,0.4)'}`,
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
              animation: hangupConfirming ? 'pulse-red 1s infinite' : 'none',
            }}
          >
            <i className={`fa-solid ${hangupConfirming ? 'fa-triangle-exclamation' : 'fa-phone-slash'}`}></i>
            {hangupConfirming ? 'Confirm end?' : 'End Call'}
          </button>
          {sessionState === 'connected' && (
            <button
              type="button"
              onClick={toggleMute}
              style={{
                padding: '11px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
                background: muted ? 'rgba(239,68,68,0.1)' : 'var(--bg-card)',
                color: muted ? 'var(--red-glow)' : 'var(--text-primary)',
                border: `1px solid ${muted ? 'rgba(239,68,68,0.4)' : 'var(--border-light)'}`,
                fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <i className={`fa-solid ${muted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
              {muted ? 'Unmute' : 'Mute'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
