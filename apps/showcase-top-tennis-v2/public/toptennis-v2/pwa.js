(() => {
  const button = document.getElementById('install-app');
  const banner = document.getElementById('install-banner');
  const bannerButton = document.getElementById('install-banner-action');
  const dismissButton = document.getElementById('install-banner-dismiss');
  const dismissalKey = 'tennis-install-dismissed-until';
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let dismissedUntil = 0;
  try { dismissedUntil = Number(localStorage.getItem(dismissalKey)) || 0; } catch {}
  const dismissBanner = () => {
    dismissedUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    try { localStorage.setItem(dismissalKey, String(dismissedUntil)); } catch {}
    banner.hidden = true;
  };
  dismissButton.addEventListener('click', () => { dismissBanner(); button.focus({preventScroll:true}); });
  let installPrompt;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (standalone()) return;
    installPrompt = event;
    button.hidden = false;
    banner.hidden = Date.now() < dismissedUntil;
  });
  const install = async () => {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = null;
    button.hidden = true;
    banner.hidden = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'dismissed') dismissBanner();
    } catch { /* Browser menu remains available. */ }
  };
  button.addEventListener('click', install);
  bannerButton.addEventListener('click', install);
  window.addEventListener('appinstalled', () => { button.hidden = true; banner.hidden = true; installPrompt = null; });
  const splash = document.getElementById('app-splash');
  if (matchMedia('(display-mode: standalone)').matches || navigator.standalone) {
    splash.hidden = false;
    // Never block the game on network resources or service-worker installation.
    const dismiss = () => { splash.hidden = true; };
    if (document.readyState === 'complete') dismiss();
    else window.addEventListener('load', dismiss, {once:true});
    setTimeout(dismiss, 2500);
  }
  if ('serviceWorker' in navigator) {
    const register = () => navigator.serviceWorker.register('/sw.js').then(async () => {
      const registration = await navigator.serviceWorker.ready;
      const assets = performance.getEntriesByType('resource').map(entry => entry.name).filter(value => {
        const url = new URL(value);return url.origin === location.origin && url.pathname.startsWith('/_next/static/');
      });
      registration.active?.postMessage({type:'CACHE_GAME_BOOTSTRAP',assets});
    }).catch(() => {});
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, {once:true});
  }
})();
