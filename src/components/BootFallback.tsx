'use client';

import { useEffect } from 'react';

export function BootFallback() {
  useEffect(() => {
    const fallback = document.getElementById('boot-fallback');
    const showError = (message: string) => {
      if (!fallback) return;
      fallback.innerHTML = `
        <div>
          <div style="font-size:18px">Project Encounter</div>
          <div style="margin-top:10px;font-size:13px;opacity:.72">起動エラー</div>
          <pre style="margin-top:14px;max-width:320px;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left;font-size:11px;line-height:1.5;font-weight:700">${escapeHtml(message)}</pre>
        </div>
      `;
    };
    const hideWhenReady = () => {
      if (document.querySelector('[data-app-ready="true"]')) {
        fallback?.remove();
        document.getElementById('server-startup-screen')?.remove();
        return true;
      }
      return false;
    };
    const onReady = () => {
      hideWhenReady();
    };
    const onError = (event: ErrorEvent) => {
      showError(event.error?.stack || event.message || 'unknown error');
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      showError(
        reason instanceof Error
          ? reason.stack || reason.message
          : typeof reason === 'string'
            ? reason
            : JSON.stringify(reason),
      );
    };

    window.addEventListener('project-encounter-ready', onReady);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    const timer = window.setInterval(hideWhenReady, 250);
    hideWhenReady();

    return () => {
      window.removeEventListener('project-encounter-ready', onReady);
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}

function escapeHtml(input: string) {
  return input.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#039;';
    }
  });
}
