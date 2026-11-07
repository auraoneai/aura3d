(() => {
  let vnow = 1000, id = 0, q = [];
  const realPerf = performance.now.bind(performance);
  performance.now = () => vnow;
  Date.now = () => 1.7e12 + vnow;
  window.requestAnimationFrame = (cb) => { q.push([++id, cb]); return id; };
  window.cancelAnimationFrame = (i) => { q = q.filter((e) => e[0] !== i); };
  window.__vt = {
    frame(dtMs) { vnow += dtMs; const run = q; q = []; for (const [, cb] of run) cb(vnow); return vnow; },
    get now() { return vnow; },
  };
})();
