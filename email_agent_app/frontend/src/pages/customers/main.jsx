import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper';
import { CustomersApp } from './CustomersApp';
import '../../index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthWrapper>
      <CustomersApp />
    </AuthWrapper>
  </React.StrictMode>
);
