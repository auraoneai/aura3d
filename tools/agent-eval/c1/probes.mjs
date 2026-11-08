// C1 functional probes: scripted interactions that check the requested behaviour actually works in the built page.
// Every probe takes a `page` driver and returns { checks: { name: boolean }, notes: {...} }. The driver is CDP-backed in
// c1/score.mjs and faked in unit tests:
//   page.state()               -> parsed window.__TASK_STATE__ (or null)
//   page.eval(expr)            -> value of a page expression (returnByValue)
//   page.sleep(ms)
//   page.key(code)             -> keyDown + keyUp of a DOM KeyboardEvent.code ("Space", "KeyR", "Digit1", ...)
//   page.clickCanvas(fx, fy)   -> real mouse click at a fraction of the #app canvas box (0..1, 0..1)
//   page.clickText(re)         -> real mouse click on the first visible button/element whose text matches; false if none
//   page.text()                -> document.body.innerText
//   page.frame()               -> { width, height, data } RGBA screenshot
//   page.diff(a, b)            -> mean absolute RGB difference 0..255
// Probes never throw for a missing feature: a missing state or button is a failed check, not a probe error.

const MOVING = 0.2; // mean RGB diff above this between two frames counts as motion (cheatsheet-lib THRESHOLDS.minAnimatedDiff)

async function motion(page, ms = 1000) {
  const a = await page.frame();
  await page.sleep(ms);
  const b = await page.frame();
  return page.diff(a, b);
}

async function waitFor(page, predicate, { timeoutMs = 3000, stepMs = 100 } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const s = await page.state();
    if (predicate(s)) return s;
    if (Date.now() >= until) return s;
    await page.sleep(stepMs);
  }
}

const num = (v) => typeof v === "number" && Number.isFinite(v);

export const PROBES = {
  async spider(page) {
    const diff = await motion(page);
    return { checks: { animatesWithoutInput: diff > MOVING }, notes: { diff } };
  },
  async "spider-followup"(page) {
    const s0 = await page.state();
    const walkDiff = await motion(page, 500);
    await page.key("Space");
    const s1 = await waitFor(page, (s) => s?.walking === false, { timeoutMs: 1000 });
    await page.sleep(200);
    const pausedDiff = await motion(page, 500);
    await page.key("Space");
    const s2 = await waitFor(page, (s) => s?.walking === true, { timeoutMs: 1000 });
    const resumedDiff = await motion(page, 500);
    return {
      checks: {
        startsWalking: s0?.walking === true,
        spacePauses: s1?.walking === false,
        pauseFreezesPose: pausedDiff < Math.max(MOVING, walkDiff * 0.25),
        spaceResumes: s2?.walking === true && resumedDiff > MOVING
      },
      notes: { walkDiff, pausedDiff, resumedDiff }
    };
  },

  async portal(page) {
    const s0 = await page.state();
    await page.sleep(1000);
    const s1 = await page.state();
    const diff = await motion(page);
    return {
      checks: {
        portalActive: s0?.portalActive === true,
        particlesLive: num(s1?.particleCount) && s1.particleCount > 0,
        timeAdvances: num(s0?.time) && num(s1?.time) && s1.time > s0.time,
        animated: diff > MOVING
      },
      notes: { particleCount: s1?.particleCount ?? null, diff }
    };
  },
  async "portal-followup"(page) {
    const closed = await page.clickText(/close portal/i);
    const s1 = await waitFor(page, (s) => s?.portalActive === false && s?.particleCount === 0, { timeoutMs: 1500 });
    const label = await page.text();
    const opened = await page.clickText(/open portal/i);
    const s2 = await waitFor(page, (s) => s?.portalActive === true && s?.particleCount > 0, { timeoutMs: 2500 });
    return {
      checks: {
        closeButton: closed,
        closes: s1?.portalActive === false && s1?.particleCount === 0,
        labelSwitches: /open portal/i.test(label),
        reopens: opened && s2?.portalActive === true && s2?.particleCount > 0
      },
      notes: {}
    };
  },

  async canyon(page) {
    const diff = await motion(page, 1500);
    return { checks: { flythroughMoves: diff > MOVING }, notes: { diff } };
  },
  async "canyon-followup"(page) {
    const pos = (s) => (s ? [s.cameraX, s.cameraY, s.cameraZ] : null);
    const moved = (a, b) => Boolean(a && b && a.every(num) && b.every(num) && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1e-3);
    const s0 = await page.state();
    await page.sleep(700);
    const s1 = await page.state();
    const paused = await page.clickText(/pause flythrough/i);
    const p0 = await waitFor(page, (s) => s?.flying === false, { timeoutMs: 1000 });
    await page.sleep(700);
    const p1 = await page.state();
    const resumed = await page.clickText(/resume flythrough/i);
    const r0 = await waitFor(page, (s) => s?.flying === true, { timeoutMs: 1000 });
    await page.sleep(700);
    const r1 = await page.state();
    return {
      checks: {
        flyingAtStart: s0?.flying === true && moved(pos(s0), pos(s1)),
        pauseStopsCamera: paused && p0?.flying === false && !moved(pos(p0), pos(p1)),
        resumeMovesCamera: resumed && r0?.flying === true && moved(pos(r0), pos(r1))
      },
      notes: { start: pos(s0), paused: pos(p1) }
    };
  },

  async stacker(page) {
    const s0 = await page.state();
    let best = s0?.height ?? 0;
    // Drop at a fixed cadence: some drops land, eventually one misses (or the game is won) and the status leaves "playing".
    let s = s0;
    for (let i = 0; i < 40 && s?.status === "playing"; i += 1) {
      await page.key("Space");
      await page.sleep(i < 3 ? 120 : 650);
      s = await page.state();
      if (num(s?.height)) best = Math.max(best, s.height);
    }
    const ended = s?.status === "lost" || s?.status === "won";
    const hud = await page.text();
    await page.key("KeyR");
    const r = await waitFor(page, (x) => x?.status === "playing" && x?.score === 0, { timeoutMs: 1500 });
    return {
      checks: {
        startsPlaying: s0?.status === "playing" && s0?.score === 0,
        dropStacks: num(s0?.height) && best > s0.height,
        gameEnds: ended,
        hudShowsScore: /score/i.test(hud),
        restartResets: r?.status === "playing" && r?.score === 0
      },
      notes: { bestHeight: best, endStatus: s?.status ?? null }
    };
  },
  async "stacker-followup"(page) {
    const s0 = await page.state();
    await page.key("KeyP");
    const p = await waitFor(page, (s) => s?.paused === true, { timeoutMs: 1000 });
    const hud = await page.text();
    const frozen = await motion(page, 500);
    await page.key("Space");
    await page.sleep(400);
    const afterDrop = await page.state();
    await page.key("KeyP");
    const r = await waitFor(page, (s) => s?.paused === false, { timeoutMs: 1000 });
    return {
      checks: {
        pPauses: p?.paused === true,
        hudSaysPaused: /paused/i.test(hud),
        pausedIgnoresDrop: p?.paused === true && afterDrop?.height === p?.height,
        pausedFreezesSlab: frozen < MOVING,
        pResumes: r?.paused === false && s0?.status === r?.status
      },
      notes: { frozen }
    };
  },

  async garden(page) {
    const s0 = await page.state();
    const overlay0 = /plants:\s*0/i.test(await page.text());
    await page.clickCanvas(0.5, 0.78);
    const s1 = await waitFor(page, (s) => s?.plantCount === 1, { timeoutMs: 1500 });
    const hasPlantAt = await page.eval("typeof window.__plantAt === 'function'");
    if (hasPlantAt) await page.eval("window.__plantAt(1.25, -0.75)");
    const s2 = await waitFor(page, (s) => s?.plantCount === 2, { timeoutMs: 1500 });
    const placed = s2?.plants?.find((p) => Math.abs(p.x - 1.25) < 0.05 && Math.abs(p.z + 0.75) < 0.05);
    await page.sleep(1200);
    const s3 = await page.state();
    const grows = Boolean(s2?.plants?.[0] && s3?.plants?.[0] && s3.plants[0].growth > s2.plants[0].growth);
    const olderBigger = Boolean(s3?.plants?.length >= 2 && s3.plants[0].growth > s3.plants[1].growth);
    await page.clickCanvas(0.5, 0.03); // the sky strip: must not plant
    await page.sleep(300);
    const s4 = await page.state();
    const overlay2 = /plants:\s*2/i.test(await page.text());
    const cleared = await page.clickText(/^\s*clear\s*$/i);
    const s5 = await waitFor(page, (s) => s?.plantCount === 0, { timeoutMs: 1500 });
    return {
      checks: {
        readyEmpty: s0?.ready === true && s0?.plantCount === 0 && overlay0,
        clickPlantsOnGround: s1?.plantCount === 1 && num(s1?.plants?.[0]?.x) && num(s1?.plants?.[0]?.z),
        plantAtExact: Boolean(hasPlantAt && placed),
        plantsGrow: grows && olderBigger,
        skyClickIgnored: s4?.plantCount === 2,
        overlayCount: overlay2,
        clearRemovesAll: cleared && s5?.plantCount === 0
      },
      notes: { firstPlant: s1?.plants?.[0] ?? null }
    };
  },
  async "garden-followup"(page) {
    await page.clickText(/^\s*clear\s*$/i);
    await page.sleep(200);
    await page.eval("window.__plantAt?.(-1, 0.5)");
    await page.sleep(100);
    await page.eval("window.__plantAt?.(1, -0.5)");
    const s0 = await waitFor(page, (s) => s?.plantCount === 2, { timeoutMs: 1500 });
    const undone = await page.clickText(/^\s*undo\s*$/i);
    const s1 = await waitFor(page, (s) => s?.plantCount === 1, { timeoutMs: 1500 });
    const overlay = /plants:\s*1/i.test(await page.text());
    await page.clickText(/^\s*undo\s*$/i);
    const s2 = await waitFor(page, (s) => s?.plantCount === 0, { timeoutMs: 1500 });
    const kept = s1?.plants?.[0];
    return {
      checks: {
        undoButton: undone,
        undoRemovesNewest: s0?.plantCount === 2 && s1?.plantCount === 1 && Boolean(kept && Math.abs(kept.x + 1) < 0.05),
        overlayUpdates: overlay,
        repeatedUndo: s2?.plantCount === 0
      },
      notes: {}
    };
  },

  async materials(page) {
    const s0 = await page.state();
    await page.sleep(1200);
    const s1 = await page.state();
    const names = (s0?.spheres ?? []).map((x) => x?.name);
    return {
      checks: {
        threeSpheresNamed: ["glass", "metal", "fabric"].every((n) => names.includes(n)),
        keyLightDrifts: num(s0?.keyLightX) && num(s1?.keyLightX) && s0.keyLightX !== s1.keyLightX
      },
      notes: { names }
    };
  },
  async "materials-followup"(page) {
    const s0 = await page.state();
    await page.key("Digit2");
    const s1 = await waitFor(page, (s) => s?.selected === "metal", { timeoutMs: 1000 });
    await page.key("Digit3");
    const s2 = await waitFor(page, (s) => s?.selected === "fabric", { timeoutMs: 1000 });
    await page.key("Digit1");
    const s3 = await waitFor(page, (s) => s?.selected === "glass", { timeoutMs: 1000 });
    return {
      checks: {
        nullBeforeKey: s0?.selected === null,
        key2SelectsMetal: s1?.selected === "metal",
        key3SelectsFabric: s2?.selected === "fabric",
        key1SelectsGlass: s3?.selected === "glass"
      },
      notes: {}
    };
  },

  async lighthouse(page) {
    const s = await page.state();
    const diff = await motion(page, 1200);
    return {
      checks: {
        ready: s?.ready === true,
        enoughParts: num(s?.partCount) && s.partCount >= 12,
        threeOrMoreBands: num(s?.bandCount) && s.bandCount >= 3,
        cameraOrbits: diff > MOVING
      },
      notes: { partCount: s?.partCount ?? null, bandCount: s?.bandCount ?? null, diff }
    };
  },
  async "lighthouse-followup"(page) {
    const seen = new Set();
    const flips = [];
    let prev;
    for (let i = 0; i < 32; i += 1) {
      const s = await page.state();
      if (typeof s?.lampOn === "boolean") {
        seen.add(s.lampOn);
        if (prev !== undefined && prev !== s.lampOn) flips.push(Date.now());
        prev = s.lampOn;
      }
      await page.sleep(100);
    }
    const gaps = flips.slice(1).map((t, i) => t - flips[i]);
    // Median, not every gap: each sample is a CDP round trip, so single gaps carry polling jitter.
    const mid = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
    return {
      checks: {
        lampOnExposed: seen.size > 0,
        blinks: seen.has(true) && seen.has(false),
        aboutOneSecond: gaps.length > 0 && mid > 700 && mid < 1400
      },
      notes: { flips: flips.length, gaps }
    };
  },

  async plinko(page) {
    const s0 = await page.state();
    const dropped = await page.clickText(/drop 20 balls/i);
    const d = await waitFor(page, (s) => s?.phase === "dropping" || (s?.spawned ?? 0) > 0, { timeoutMs: 2000 });
    const settled = await waitFor(page, (s) => s?.phase === "settled", { timeoutMs: 30000, stepMs: 250 });
    const bins = settled?.bins;
    const sum = Array.isArray(bins) ? bins.reduce((a, b) => a + b, 0) : null;
    const reset = await page.clickText(/^\s*reset\s*$/i);
    const r = await waitFor(page, (s) => s?.total === 0 && s?.spawned === 0, { timeoutMs: 2000 });
    return {
      checks: {
        readyPhase: s0?.phase === "ready" && s0?.total === 0,
        dropButtonSpawns: dropped && ((d?.spawned ?? 0) > 0 || d?.phase === "dropping"),
        allTwentyLand: settled?.phase === "settled" && settled?.spawned === 20 && settled?.total === 20,
        binsSumToTotal: Array.isArray(bins) && bins.length === 7 && sum === settled?.total,
        resetClears: reset && r?.total === 0 && r?.spawned === 0
      },
      notes: { bins: bins ?? null }
    };
  },
  async "plinko-followup"(page) {
    await page.clickText(/^\s*reset\s*$/i);
    await waitFor(page, (s) => s?.total === 0, { timeoutMs: 2000 });
    const one = await page.clickText(/drop 1 ball/i);
    const s = await waitFor(page, (x) => x?.total === 1, { timeoutMs: 15000, stepMs: 250 });
    return {
      checks: {
        dropOneButton: one,
        oneBallSpawned: s?.spawned === 1,
        oneBallCounted: s?.total === 1 && Array.isArray(s?.bins) && s.bins.reduce((a, b) => a + b, 0) === 1
      },
      notes: { bins: s?.bins ?? null }
    };
  }
};

/** Run a named probe; a thrown driver error becomes an `error` field with every check false. */
export async function runProbe(name, page) {
  const probe = PROBES[name];
  if (!probe) throw new Error(`unknown probe ${name}`);
  try {
    const out = await probe(page);
    const values = Object.values(out.checks);
    return { name, ...out, passed: values.filter(Boolean).length, total: values.length };
  } catch (error) {
    return { name, checks: {}, notes: {}, passed: 0, total: null, error: String(error?.message ?? error).slice(0, 300) };
  }
}
