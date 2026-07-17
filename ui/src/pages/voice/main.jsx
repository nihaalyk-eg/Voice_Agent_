import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { NavProvider, useNav } from '../../NavContext';
import { VoiceAgentApp } from './VoiceAgentApp';
import { CustomerDBApp } from '../customer-db/CustomerDBApp';
import '../../index.css';

const Router = () => {
  const { page } = useNav();
  return page === 'customer-db' ? <CustomerDBApp /> : <VoiceAgentApp />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthWrapper>
    <NavProvider>
      <Router />
    </NavProvider>
  </AuthWrapper>
);
