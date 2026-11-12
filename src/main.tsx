import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { DialogHost } from './components/DialogHost';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><DialogHost /></React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
