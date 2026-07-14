import React, { Suspense, lazy } from 'react';
import { useNav } from './NavContext';

const EmailAgentApp     = lazy(() => import('./pages/email/EmailAgentApp').then(m => ({ default: m.EmailAgentApp })));
const WorkOrdersApp     = lazy(() => import('./pages/work-orders/WorkOrdersApp').then(m => ({ default: m.WorkOrdersApp })));
const CommunicationsApp = lazy(() => import('./pages/communications/CommunicationsApp').then(m => ({ default: m.CommunicationsApp })));
const CustomersApp      = lazy(() => import('./pages/customers/CustomersApp').then(m => ({ default: m.CustomersApp })));
const ObservabilityApp  = lazy(() => import('./pages/observability/ObservabilityApp').then(m => ({ default: m.ObservabilityApp })));

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
  const { page } = useNav();

  return (
    <Suspense fallback={<Spinner />}>
      {page === 'email'          && <EmailAgentApp />}
      {page === 'work-orders'    && <WorkOrdersApp />}
      {page === 'communications' && <CommunicationsApp />}
      {page === 'customers'      && <CustomersApp />}
      {page === 'observability'  && <ObservabilityApp />}
    </Suspense>
  );
};
