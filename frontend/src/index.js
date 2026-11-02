import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './styles/pwa-safe-area.css';
// Last, so the phone rules can correct the page stylesheets above them.
import './styles/mobile.css';
import { registerSW } from './serviceWorkerRegistration';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

registerSW();
