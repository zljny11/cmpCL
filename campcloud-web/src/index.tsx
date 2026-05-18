import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from 'antd';
import { QueryProvider } from './app/providers/query-provider';
import { AuthProvider } from './app/providers/auth-provider';
import { AppRouter } from './app/router';
import './index.less';

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    console.error('[campcloud][window.error]', event.error ?? event.message, event);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[campcloud][unhandledrejection]', event.reason);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryProvider>
      <AuthProvider>
        <App>
          <AppRouter />
        </App>
      </AuthProvider>
    </QueryProvider>
  </React.StrictMode>,
);
