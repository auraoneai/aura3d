(() => {
  'use strict';
  // One anonymous browser ID across tabs. No landing-page demonstration traffic.
  const key = 'tennis-presence-id';
  let fallback = null, timer = null, active = true, pending = false;
  function playerId() {
    try {
      let id = localStorage.getItem(key);
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id || '')) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
      }
      return id;
    } catch { return fallback ||= crypto.randomUUID(); }
  }
  async function heartbeat() {
    clearTimeout(timer);
    if (!active || document.hidden || pending || !crypto.randomUUID) return;
    pending = true;
    try {
      await fetch('/api/players-online', {method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({id:playerId()}), cache:'no-store', signal:AbortSignal.timeout(10000)});
    } catch {} finally {
      pending = false;
      if (active && !document.hidden) timer = setTimeout(heartbeat, 25000);
    }
  }
  // Let the lease expire: closing one tab must not remove another active tab.
  document.addEventListener('visibilitychange', () => {
    clearTimeout(timer);
    if (!document.hidden) void heartbeat();
  });
  window.addEventListener('pagehide', () => { active = false; clearTimeout(timer); });
  window.addEventListener('pageshow', () => { active = true; void heartbeat(); });
  window.addEventListener('online', () => { void heartbeat(); });
  void heartbeat();
})();
