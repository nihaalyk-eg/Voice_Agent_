import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthWrapper } from '../../components/AuthWrapper.jsx';
import LandingApp from './LandingApp.jsx';
import '../../index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthWrapper>
      <LandingApp />
    </AuthWrapper>
  </StrictMode>
);
