import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { WorkOrdersApp } from './WorkOrdersApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <WorkOrdersApp />
    </AuthWrapper>
  </React.StrictMode>
);
