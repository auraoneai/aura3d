// Harness-owned in-page probe for the 505 games benchmark. Injected by serve-505.mjs ONLY on /?probe=<runId> pages (never into agent code or dists).
// Drives the page with real DOM events, samples the canvas after each app rAF callback, POSTs one JSON result to /__probe_result.
(() => {
  const TASK = window.__PROBE_TASK__;
  const ID = new URLSearchParams(location.search).get("probe");
  const R = { task: TASK, id: ID, checks: {}, notes: [], errors: [], samples: {} };
  window.addEventListener("error", (e) => R.errors.push(String(e.message).slice(0, 200)));
  window.addEventListener("unhandledrejection", (e) => R.errors.push("rejection " + String(e.reason).slice(0, 200)));
  let want = false, last = null;
  const off = document.createElement("canvas");
  off.width = 32; off.height = 18;
  const octx = off.getContext("2d", { willReadFrequently: true });
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => {
    const r = cb(t);
    if (want) {
      want = false;
      try {
        const c = document.getElementById("app");
        octx.drawImage(c, 0, 0, 32, 18);
        const d = octx.getImageData(0, 0, 32, 18).data;
        const l = new Float32Array(32 * 18);
        for (let i = 0; i < l.length; i++) l[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        last = l;
      } catch (e) { last = null; R.errors.push("sample " + e.message); }
    }
    return r;
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function sample() { last = null; want = true; for (let i = 0; i < 100 && !last; i++) await sleep(20); return last; }
  const diff = (a, b) => (a && b ? a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length : null);
  const canvas = () => document.getElementById("app");
  const CODES = { " ": "Space", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight", ArrowUp: "ArrowUp", Enter: "Enter" };
  const KC = { " ": 32, ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, Enter: 13, r: 82, R: 82, w: 87, a: 65, d: 68 };
  function key(type, k) {
    const init = { key: k, code: CODES[k] ?? "Key" + k.toUpperCase(), keyCode: KC[k] ?? 0, which: KC[k] ?? 0, bubbles: true, cancelable: true };
    const ev = new KeyboardEvent(type, init);
    (canvas() ?? document.body).dispatchEvent(ev);
  }
  async function tap(k, hold = 60) { key("keydown", k); await sleep(hold); key("keyup", k); }
  function pointer(type, x, y) {
    const c = canvas(); const b = c.getBoundingClientRect();
    const init = { clientX: b.left + x, clientY: b.top + y, bubbles: true, cancelable: true, button: 0, buttons: type.includes("down") ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
    const ev = type.startsWith("pointer") ? new PointerEvent(type, init) : new MouseEvent(type, init);
    c.dispatchEvent(ev);
  }
  async function click(x, y) { pointer("pointermove", x, y); pointer("mousemove", x, y); await sleep(30); pointer("pointerdown", x, y); pointer("mousedown", x, y); await sleep(30); pointer("pointerup", x, y); pointer("mouseup", x, y); pointer("click", x, y); }
  const st = () => { try { const s = window.__TASK_STATE__; return s ? JSON.parse(JSON.stringify(s)) : null; } catch { return null; } };
  const hudText = () => { const c = canvas(); const clone = document.body.cloneNode(true); clone.querySelectorAll("canvas,script,style").forEach((n) => n.remove()); return (clone.innerText || clone.textContent || "").toLowerCase(); };
  const hudHas = (s) => { const t = hudText(); return Object.entries(s || {}).filter(([k, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => t.includes(String(v).toLowerCase())).filter(Boolean).length; };
  const C = R.checks;

  async function run() {
    for (let i = 0; i < 300 && window.__TASK_READY__ !== true; i++) await sleep(50);
    C.ready = window.__TASK_READY__ === true;
    if (!C.ready) return;
    await sleep(300);
    const s0 = st();
    R.samples.initial = s0;
    C.hasState = !!s0;
    C.canvasSize = (() => { const b = canvas().getBoundingClientRect(); return Math.round(b.width) === 640 && Math.round(b.height) === 360; })();
    C.singleCanvas = document.querySelectorAll("canvas").length === 1;
    C.hudOutsideCanvas = hudText().trim().length > 0;
    C.hudShowsState = hudHas(s0) >= 2;
    if (TASK === 11) {
      C.initialOk = !!s0 && s0.status === "ready" && s0.lives === 3 && s0.bricksLeft >= 20 && s0.score === 0;
      const a = await sample();
      key("keydown", "ArrowLeft"); await sleep(400); key("keyup", "ArrowLeft");
      key("keydown", "ArrowRight"); await sleep(200); key("keyup", "ArrowRight");
      await tap(" ");
      await sleep(500);
      const b = await sample();
      R.samples.afterServe = st();
      C.servesToPlaying = st()?.status === "playing";
      C.motion = (diff(a, b) ?? 0) > 0.05; R.samples.motionDiff = diff(a, b);
      await sleep(4000);
      R.samples.after4s = st();
      C.hudFollows = hudHas(st()) >= 2;
      await tap("r");
      await sleep(300);
      const s = st();
      C.restartResets = !!s && s.status === "ready" && s.score === 0 && s.lives === 3 && s.bricksLeft >= 20;
      R.samples.afterR = s;
    } else if (TASK === 12) {
      C.initialOk = !!s0 && s0.status === "playing" && s0.height >= 0 && s0.score === 0;
      const a = await sample(); await sleep(400); const b = await sample();
      C.motion = (diff(a, b) ?? 0) > 0.05; R.samples.motionDiff = diff(a, b);
      const before = st();
      for (let i = 0; i < 3; i++) { await tap(" "); await sleep(700); }
      const after = st(); R.samples.afterDrops = after;
      C.dropsChangeState = !!after && !!before && (after.height !== before.height || after.score !== before.score || after.status === "lost");
      await click(320, 180); await sleep(400);
      R.samples.afterClick = st();
      C.clickChangesOrRestarts = !!st();
      C.hudFollows = hudHas(st()) >= 2;
      await tap("r"); await sleep(300);
      const s = st(); R.samples.afterR = s;
      C.restartResets = !!s && s.score === 0 && s.status === "playing";
    } else if (TASK === 13) {
      C.initialOk = !!s0 && s0.status === "ready" && typeof s0.score === "number";
      await tap(" "); await sleep(100);
      const a = await sample(); await sleep(300); const b = await sample();
      C.motion = (diff(a, b) ?? 0) > 0.05; R.samples.motionDiff = diff(a, b);
      const s1 = st(); await sleep(1000); const s2 = st();
      R.samples.s1 = s1; R.samples.s2 = s2;
      C.playing = s1?.status === "playing" || s1?.status === "lost";
      C.scoreIncreases = !!s1 && !!s2 && s2.score > s1.score;
      await tap(" "); const sj = st(); R.samples.afterJump = sj;
      C.typesOk = !!sj && typeof sj.airborne === "boolean" && typeof sj.speed === "number" && typeof sj.score === "number";
      C.airborneAfterJump = sj?.airborne === true;
      let seen = new Set(); let maxScore = 0; let maxSpeed = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 20000) {
        const s = st(); if (s) { seen.add(s.status); maxScore = Math.max(maxScore, s.score); maxSpeed = Math.max(maxSpeed, s.speed); if (s.status === "lost" || s.status === "won") break; }
        await tap(" ", 40); await sleep(550);
      }
      R.samples.statuses = [...seen]; R.samples.maxScore = maxScore; R.samples.maxSpeed = maxSpeed; R.samples.final = st();
      C.eventuallyEndsOrRuns = seen.has("lost") || seen.has("won") || seen.has("playing");
      C.lostOccurred = seen.has("lost");
      C.hudFollows = hudHas(st()) >= 2;
      const before = st(); await tap("r"); await sleep(300);
      const s = st(); R.samples.afterR = s;
      C.restartResets = !!s && s.score < Math.max(1, (before?.score ?? 0)) && (s.status === "ready" || s.status === "playing");
    } else if (TASK === 14) {
      C.initialOk = !!s0 && s0.status === "ready" && Array.isArray(s0.activeCells) && typeof s0.timeLeft === "number";
      await tap("Enter"); await sleep(400);
      const s1 = st(); R.samples.afterEnter = s1;
      C.startsOnEnter = s1?.status === "playing" && s1.timeLeft <= 45;
      await sleep(1500); const s2 = st();
      C.timerDecreases = !!s1 && !!s2 && s2.timeLeft < s1.timeLeft; R.samples.timer = [s1?.timeLeft, s2?.timeLeft];
      const a = await sample(); await sleep(600); const b = await sample();
      C.motion = (diff(a, b) ?? 0) > 0.05; R.samples.motionDiff = diff(a, b);
      // sweep: watch activeCells for 6 s, click a coarse 3x3 grid of canvas positions on the lit ones to see if pointer input moves the score
      const cells = new Set(); let scoreMin = 1e9, scoreMax = -1;
      const pos = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) pos.push([120 + c * 200, 90 + r * 90]);
      const t0 = performance.now(); let clicks = 0;
      while (performance.now() - t0 < 8000) {
        const s = st(); if (s) { (s.activeCells || []).forEach((x) => cells.add(x)); scoreMin = Math.min(scoreMin, s.score); scoreMax = Math.max(scoreMax, s.score); }
        const p = pos[clicks % 9]; await click(p[0], p[1]); clicks++; await sleep(150);
      }
      R.samples.cellsSeen = [...cells]; R.samples.scoreRange = [scoreMin, scoreMax];
      C.lanternsPop = cells.size >= 2;
      C.pointerChangesScore = scoreMax > 0 || scoreMin < 1e9 && scoreMin !== scoreMax;
      R.samples.afterClicks = st();
      C.hudFollows = hudHas(st()) >= 2;
      await tap("r"); await sleep(400);
      const s = st(); R.samples.afterR = s;
      C.restartResets = !!s && s.score === 0 && s.status === "playing" && s.timeLeft > 40;
    }
  }
  run().catch((e) => R.errors.push("probe " + String(e.stack || e).slice(0, 300))).finally(() => {
    R.done = true; R.finalErrors = R.errors.length;
    fetch("/__probe_result?id=" + encodeURIComponent(ID), { method: "POST", body: JSON.stringify(R) }).catch(() => {});
    document.title = "PROBE_DONE";
  });
})();
