(() => {
  const hooks = window.__AURA_SILT__ || window.__AURA_LAST_TRAIN__;
  const r = hooks.routeHealth();
  const text = JSON.stringify(r);
  return { keys: Object.keys(r || {}), len: text.length, hits: (text.match(/[^"]{0,70}(graph|portable|canal|cloud-sea)[^"]{0,70}/gi) || []).slice(0, 12) };
})()
