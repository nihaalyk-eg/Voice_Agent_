import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { VoiceConsoleApp } from './VoiceConsoleApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <VoiceConsoleApp />
    </AuthWrapper>
  </React.StrictMode>
);
