import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { NavProvider, useNav } from '../../NavContext';
import { VoiceAgentApp } from './VoiceAgentApp';
import { CustomerDBApp } from '../customer-db/CustomerDBApp';
import '../../index.css';

const Router = () => {
  const { page } = useNav();
  if (['customers', 'customer-db', 'work-orders', 'transcripts', 'logs'].includes(page)) {
    return <CustomerDBApp activeTab={page} />;
  }
  return <VoiceAgentApp />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthWrapper>
    <NavProvider>
      <Router />
    </NavProvider>
  </AuthWrapper>
);
