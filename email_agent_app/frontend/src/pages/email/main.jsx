import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { EmailAgentApp } from './EmailAgentApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <EmailAgentApp />
    </AuthWrapper>
  </React.StrictMode>
);
