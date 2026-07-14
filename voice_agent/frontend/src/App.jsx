import React, { Suspense, lazy } from 'react';
import { useNav } from './NavContext';

const VoiceAgentApp = lazy(() => import('./pages/voice/VoiceAgentApp').then(m => ({ default: m.VoiceAgentApp })));

const Spinner = () => (
  <div style={{
    width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', gap: '14px',
    justifyContent: 'center', alignItems: 'center', background: 'var(--bg-primary)',
    animation: 'voice-spinner-fade-in 0.15s ease-out',
  }}>
    <div className="logo-mark zora-logo" style={{ width: 48, height: 48, fontSize: 22 }}>
      <i className="fa-solid fa-bolt"></i>
    </div>
    <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border-light)', borderTopColor: 'var(--violet-glow)', animation: 'voice-spinner-spin 0.8s linear infinite' }} />
    <style>{`
      @keyframes voice-spinner-spin { to { transform: rotate(360deg); } }
      @keyframes voice-spinner-fade-in { from { opacity: 0; } to { opacity: 1; } }
    `}</style>
  </div>
);

export const App = () => {
  return (
    <Suspense fallback={<Spinner />}>
      <VoiceAgentApp />
    </Suspense>
  );
};
