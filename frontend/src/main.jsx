import React from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.jsx';
import './styles.css';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const application = <React.StrictMode><App googleEnabled={Boolean(clientId)} /></React.StrictMode>;
createRoot(document.getElementById('root')).render(
  clientId ? <GoogleOAuthProvider clientId={clientId}>{application}</GoogleOAuthProvider> : application
);
