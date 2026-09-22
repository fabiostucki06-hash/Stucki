import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { ToastProvider } from './components/ui/Toast';
import { AppProvider } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import { unregisterStaleServiceWorkers } from './lib/reload';
import App from './App';

// This app ships no Service Worker of its own; unregister any left over from
// an earlier build/PWA experiment so they can't keep serving cached assets.
unregisterStaleServiceWorkers();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  </StrictMode>,
);
