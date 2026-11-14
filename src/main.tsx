import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { DialogHost } from './components/DialogHost';
import { UpdatePrompt } from './components/UpdatePrompt';
import { OfflineBar } from './components/OfflineBar';
import { ApkSaved } from './components/ApkSaved';

import { startNativeBack } from './lib/nativeBack';
import { installOverlayAutoBack, installRootGuard } from './lib/backStack';
startNativeBack();
installOverlayAutoBack();
installRootGuard(/ShopOS(App|Admin|Booker)\//.test(navigator.userAgent) || window.matchMedia?.('(display-mode: standalone)').matches);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /><DialogHost /><UpdatePrompt /><ApkSaved /><OfflineBar /></React.StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
