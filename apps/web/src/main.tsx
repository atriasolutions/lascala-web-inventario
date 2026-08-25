import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { AuthProvider } from './lib/auth';
import { NetworkStatusProvider } from './lib/networkStatus';
import { capturePwaInstallPrompt } from './lib/pwaInstallPrompt';
import { HelpModeProvider } from './components/help/HelpModeProvider';
import { ToastProvider } from './lib/toast';
import { router } from './App';
import './styles/index.css';

capturePwaInstallPrompt();

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    }
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <NetworkStatusProvider>
        <ToastProvider>
          <HelpModeProvider>
            <RouterProvider router={router} />
          </HelpModeProvider>
        </ToastProvider>
      </NetworkStatusProvider>
    </AuthProvider>
  </StrictMode>,
);
