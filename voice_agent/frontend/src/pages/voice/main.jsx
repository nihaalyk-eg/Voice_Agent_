import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { VoiceAgentApp } from './VoiceAgentApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthWrapper>
    <VoiceAgentApp />
  </AuthWrapper>
);
