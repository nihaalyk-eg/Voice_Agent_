import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { ObservabilityApp } from './ObservabilityApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <ObservabilityApp />
    </AuthWrapper>
  </React.StrictMode>
);
