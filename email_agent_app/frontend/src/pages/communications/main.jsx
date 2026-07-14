import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { CommunicationsApp } from './CommunicationsApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <CommunicationsApp />
    </AuthWrapper>
  </React.StrictMode>
);
