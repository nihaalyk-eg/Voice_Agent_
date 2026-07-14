import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthWrapper } from './components/AuthWrapper';
import { NavProvider } from './NavContext';
import { App } from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <AuthWrapper>
    <NavProvider>
      <App />
    </NavProvider>
  </AuthWrapper>
);
