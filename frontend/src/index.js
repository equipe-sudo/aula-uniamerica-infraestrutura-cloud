import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { installFrontendErrorTelemetry, sendWebVital } from './telemetry';

installFrontendErrorTelemetry();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Envia Web Vitals para uma Cloudflare Pages Function no mesmo dominio.
// Nenhuma credencial do Grafana fica exposta no bundle do navegador.
reportWebVitals(sendWebVital);
