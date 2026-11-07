(async () => {
  const hooks = window.__AURA_LAST_TRAIN__ || window.__AURA_SILT__;
  const info = hooks.info();
  const diag = hooks.diagnostics();
  let adapter = null;
  try { const a = await navigator.gpu?.requestAdapter(); adapter = a ? { vendor: a.info?.vendor, architecture: a.info?.architecture, description: a.info?.description } : null; } catch (e) { adapter = String(e); }
  const text = JSON.stringify({ info, diag });
  return { hasNavigatorGpu: !!navigator.gpu, adapter, info: JSON.stringify(info).slice(0, 500), backendHits: (text.match(/[^"]{0,40}(webgpu|webgl2)[^"]{0,40}/gi) || []).slice(0, 8), errors: (diag && diag.errors) || null };
})()
