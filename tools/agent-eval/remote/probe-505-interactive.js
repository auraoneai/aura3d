// Page-level probe injected by the local serve harness (no framework knowledge). Posts results to /__result.
(() => {
  const q = new URLSearchParams(location.search);
  const mode = q.get("probe"), rid = q.get("rid") || "x", task = Number(q.get("task"));
  if (!mode) return;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const R = { rid, task, mode, checks: {}, notes: [], errors: [] };
  window.addEventListener("error", (e) => R.errors.push(String(e.message).slice(0, 200)));
  const oce = console.error; console.error = (...a) => { R.errors.push(a.map(String).join(" ").slice(0, 200)); oce(...a); };
  const st = () => window.__TASK_STATE__;
  const canvas = () => document.querySelector("#app");
  const snap = (o) => JSON.parse(JSON.stringify(o ?? null));
  function clickAt(fx, fy) {
    const c = canvas(), r = c.getBoundingClientRect();
    const x = r.left + r.width * fx, y = r.top + r.height * fy;
    const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
    for (const [t, C] of [["pointermove", PointerEvent], ["pointerdown", PointerEvent], ["mousedown", MouseEvent], ["pointerup", PointerEvent], ["mouseup", MouseEvent], ["click", MouseEvent]]) c.dispatchEvent(new C(t, { ...base, buttons: t.endsWith("down") ? 1 : 0 }));
  }
  const textOf = () => document.body.innerText;
  const findByText = (re, sel = "button,[role=button],a,div,span") => [...document.querySelectorAll(sel)].filter((e) => re.test((e.textContent || "").trim()) && (e.textContent || "").trim().length < 40);
  const done = async () => {
    try { await fetch("/__result", { method: "POST", body: JSON.stringify(R) }); } catch {}
    document.documentElement.setAttribute("data-probe", "done");
  };
  async function waitReady() {
    for (let i = 0; i < 200; i++) { if (st()?.ready === true) return true; await sleep(100); }
    return false;
  }
  const visibleText = (e) => { const cs = getComputedStyle(e); return cs.display !== "none" && cs.visibility !== "hidden" && e.getBoundingClientRect().width > 0; };

  async function garden() {
    const c = R.checks;
    c.stateExposed = !!st() && typeof st().plantCount === "number" && Array.isArray(st().plants);
    c.plantAtExposed = typeof window.__plantAt === "function";
    if (!c.stateExposed || !c.plantAtExposed) return;
    c.zeroInitially = st().plantCount === 0;
    c.counterInitial = /Plants:\s*0\b/.test(textOf());
    for (const [x, z] of [[-3, 0], [3, 2], [0, -3], [2, -2], [-2, 3]]) window.__plantAt(x, z);
    clickAt(0.3, 0.7); clickAt(0.5, 0.8); clickAt(0.7, 0.65);
    await sleep(300);
    R.countAfterPlant = st().plantCount;
    c.count8 = st().plantCount === 8;
    c.counterText8 = /Plants:\s*8\b/.test(textOf());
    const clickPlants = st().plants.slice(5).map((p) => ({ x: p.x, z: p.z }));
    R.clickGround = clickPlants;
    c.clickMapsToDistinctSpots = new Set(clickPlants.map((p) => p.x.toFixed(2) + "," + p.z.toFixed(2))).size === clickPlants.length && clickPlants.length === 3;
    const t0 = performance.now();
    const samples = [];
    for (const t of [500, 4000, 9000]) { await sleep(Math.max(0, t - (performance.now() - t0))); samples.push({ t: Math.round(performance.now() - t0), g: st().plants.map((p) => p.growth) }); }
    R.growth = samples;
    c.growthMonotonic = samples.every((s, i) => i === 0 || s.g.every((v, j) => v >= samples[i - 1].g[j] - 1e-6));
    c.growthRange = samples.every((s) => s.g.every((v) => v >= 0 && v <= 1.0001));
    c.growthReaches95 = samples[2].g.every((v) => v >= 0.95);
    c.growthChanges = samples[2].g.some((v, j) => v - samples[0].g[j] > 0.2);
    const clearEls = findByText(/^clear$/i, "button,[role=button],a,div,span");
    c.clearFound = clearEls.length > 0;
    (clearEls.find((e) => e.tagName === "BUTTON") || clearEls[0])?.click();
    await sleep(300);
    c.clearZero = st().plantCount === 0 && st().plants.length === 0;
    c.counterTextAfterClear = /Plants:\s*0\b/.test(textOf());
    clickAt(0.5, 0.02); await sleep(200);
    c.skyClickIgnored = st().plantCount === 0;
    // later plant smaller than earlier
    window.__plantAt(-4, -1); await sleep(2500); window.__plantAt(4, 1); await sleep(100);
    const p = st().plants; c.laterSmaller = p.length === 2 && p[1].growth < p[0].growth;
    window.__plantAt = window.__plantAt; // showcase: plant 24 plants over ~6s
    for (let i = 0; i < 24; i++) { const a = i * 2.399; const rr = 1 + 4.5 * Math.sqrt((i + 0.5) / 24); window.__plantAt(Math.cos(a) * rr, Math.sin(a) * rr * 0.8); await sleep(250); }
    R.finalCount = st().plantCount;
    c.manyPlants = st().plantCount >= 24;
  }

  async function solar() {
    const c = R.checks;
    c.stateExposed = !!st() && Array.isArray(st().planets);
    c.fnsExposed = typeof window.__focusPlanet === "function" && typeof window.__unfocus === "function";
    if (!c.stateExposed) return;
    const pl = () => snap(st().planets);
    c.planets6 = pl().length >= 6;
    const ang = (a, b) => { const na = Math.hypot(a.x, a.y, a.z), nb = Math.hypot(b.x, b.y, b.z); if (!na || !nb) return 0; return Math.acos(Math.max(-1, Math.min(1, (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb)))); };
    const a0 = pl(); await sleep(1000); const a1 = pl();
    const moved = a0.map((p, i) => Math.hypot(p.x - a1[i].x, p.y - a1[i].y, p.z - a1[i].z));
    c.planetsMove = moved.filter((m) => m > 1e-3).length >= 5;
    const order = a0.map((p, i) => ({ i, r: Math.hypot(p.x, p.y, p.z) })).sort((u, v) => u.r - v.r);
    const dA = order.map((o) => ang(a0[o.i], a1[o.i]));
    R.angDisp = order.map((o, k) => ({ name: a0[o.i].name, r: +o.r.toFixed(2), ang: +dA[k].toFixed(4) }));
    c.innerFasterThanOuter = dA[0] > dA[dA.length - 1] && dA.slice(0, 3).reduce((s, v) => s + v, 0) > dA.slice(-3).reduce((s, v) => s + v, 0);
    R.maxOrbit = order[order.length - 1].r;
    const pauseBtn = findByText(/^(pause|play)$/i, "button,[role=button]")[0];
    c.pauseBtnFound = !!pauseBtn;
    if (pauseBtn) {
      pauseBtn.click(); await sleep(200);
      const p0 = pl(); await sleep(1500); const p1 = pl();
      c.pausedFreezes = p0.every((p, i) => Math.hypot(p.x - p1[i].x, p.y - p1[i].y, p.z - p1[i].z) < 1e-3);
      c.pausedLabelPlay = /^play$/i.test(pauseBtn.textContent.trim()) && st().paused === true;
      pauseBtn.click(); await sleep(200);
      const r0 = pl(); await sleep(800); const r1 = pl();
      c.resumeMoves = r0.some((p, i) => Math.hypot(p.x - r1[i].x, p.y - r1[i].y, p.z - r1[i].z) > 1e-3) && st().paused === false;
      c.labelBackToPause = /^pause$/i.test(pauseBtn.textContent.trim());
    }
    if (!c.fnsExposed) return;
    const name = order[2] ? a0[order[2].i].name : a0[2].name;
    R.focusName = name;
    window.__focusPlanet(name); await sleep(2600);
    c.focusedName = st().focused === name;
    R.cameraDistanceToFocus = st().cameraDistanceToFocus;
    c.camDistSmall = typeof st().cameraDistanceToFocus === "number" && st().cameraDistanceToFocus < 0.25 * Math.max(R.maxOrbit * 2, 1);
    const panelOk = () => [...document.querySelectorAll("body *")].some((e) => e.children.length < 8 && visibleText(e) && e.textContent.includes(name) && (e.textContent.match(/\d[\d,.]*/g) || []).length >= 2);
    c.panelShown = panelOk();
    const d1 = st().cameraDistanceToFocus; await sleep(2000);
    c.followsKeepsClose = st().focused === name && typeof st().cameraDistanceToFocus === "number" && st().cameraDistanceToFocus < d1 * 1.5 + 0.5;
    R.focusFrameReady = true;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
    await sleep(2600);
    c.escapeUnfocuses = st().focused === null && st().cameraDistanceToFocus === null;
    c.panelHiddenAfter = !panelOk();
    // empty-space click through the DOM
    window.__focusPlanet(name); await sleep(1800); window.__unfocus(); await sleep(2200);
    c.unfocusFn = st().focused === null;
  }

  async function solarFocus() {
    const pl = st().planets; const r = pl.map((p) => ({ n: p.name, r: Math.hypot(p.x, p.y, p.z) })).sort((a, b) => a.r - b.r);
    window.__focusPlanet(r[2].n); await sleep(3200); R.focused = st().focused;
  }

  (async () => {
    try {
      R.ready = await waitReady();
      if (R.ready) {
        if (mode === "full") await (task === 10 ? garden() : solar());
        else if (mode === "focus") await solarFocus();
        else if (mode === "show" && task === 10) await garden();
      } else R.notes.push("never ready");
    } catch (e) { R.errors.push("probe exception: " + String(e.stack || e).slice(0, 300)); }
    R.textAtEnd = textOf().slice(0, 300);
    await done();
  })();
})();
