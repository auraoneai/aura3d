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

/** Mean Rec. 601 luma of an RGBA frame, 0..255. */
export function meanLuma(frame) {
  const d = frame.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return sum / (d.length / 4);
}

/** Mean (B - R) over an RGBA frame: rises when a large red surface turns blue. */
export function blueMinusRed(frame) {
  const d = frame.data;
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += d[i + 2] - d[i];
  return sum / (d.length / 4);
}

function planetsMoved(a, b) {
  const pa = Array.isArray(a?.planets) ? a.planets : [];
  const pb = Array.isArray(b?.planets) ? b.planets : [];
  return pa.some((p) => {
    const q = pb.find((x) => x?.name === p?.name);
    return Boolean(q && [p.x, p.y, p.z, q.x, q.y, q.z].every(num) && Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 1e-3);
  });
}

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

  async product(page) {
    const samples = [];
    for (let i = 0; i < 4; i += 1) {
      const s = await page.state();
      samples.push({ t: Date.now(), a: s?.turntableAngleDeg, finish: s?.paintFinish });
      if (i < 3) await page.sleep(500);
    }
    const angles = samples.filter((x) => num(x.a));
    // Unwrap a 0..360 wrap: the turntable only turns one way, so a drop of more than 180 deg is a wrap.
    let turned = 0;
    for (let i = 1; i < angles.length; i += 1) {
      let d = angles[i].a - angles[i - 1].a;
      if (d < -180) d += 360;
      turned += d;
    }
    const secs = angles.length > 1 ? (angles[angles.length - 1].t - angles[0].t) / 1000 : 0;
    const rate = secs > 0 ? turned / secs : null;
    const diff = await motion(page, 1000);
    return {
      checks: {
        clearcoatState: samples[0].finish === "clearcoat",
        turntableTurns: angles.length === samples.length && turned > 0,
        turntableRate: rate != null && rate >= 10 && rate <= 30,
        animated: diff > MOVING
      },
      notes: { degPerSec: rate == null ? null : Math.round(rate * 10) / 10, diff }
    };
  },
  async "product-followup"(page) {
    const s0 = await page.state();
    const red = blueMinusRed(await page.frame());
    const blue = await page.clickText(/^\s*blue\s*$/i);
    const s1 = await waitFor(page, (s) => s?.paintColor === "blue", { timeoutMs: 1500 });
    await page.sleep(300);
    const blueShift = blueMinusRed(await page.frame());
    const black = await page.clickText(/^\s*black\s*$/i);
    const s2 = await waitFor(page, (s) => s?.paintColor === "black", { timeoutMs: 1500 });
    const back = await page.clickText(/^\s*red\s*$/i);
    const s3 = await waitFor(page, (s) => s?.paintColor === "red", { timeoutMs: 1500 });
    return {
      checks: {
        startsRed: s0?.paintColor === "red",
        blueButton: blue && s1?.paintColor === "blue",
        frameShiftsBlue: blueShift - red > 1.5,
        blackButton: black && s2?.paintColor === "black",
        redRestores: back && s3?.paintColor === "red"
      },
      notes: { blueMinusRedBefore: red, blueMinusRedAfter: blueShift }
    };
  },

  async clock(page) {
    const diff = await motion(page, 1000);
    return { checks: { pendulumMoves: diff > MOVING }, notes: { diff } };
  },
  async "clock-followup"(page) {
    const s0 = await page.state();
    const angles = [];
    for (let i = 0; i < 12; i += 1) {
      const s = await page.state();
      if (num(s?.pendulumAngleDeg)) angles.push(s.pendulumAngleDeg);
      await page.sleep(125);
    }
    const swings = angles.some((a) => a > 0.5) && angles.some((a) => a < -0.5);
    const lit = meanLuma(await page.frame());
    const off = await page.clickText(/^\s*lights off\s*$/i);
    const s1 = await waitFor(page, (s) => s?.lightsOn === false, { timeoutMs: 1500 });
    await page.sleep(400);
    const dim = meanLuma(await page.frame());
    const on = await page.clickText(/^\s*lights on\s*$/i);
    const s2 = await waitFor(page, (s) => s?.lightsOn === true, { timeoutMs: 1500 });
    await page.sleep(400);
    const relit = meanLuma(await page.frame());
    return {
      checks: {
        stateExposed: s0?.lightsOn === true && num(s0?.pendulumAngleDeg),
        pendulumSwings: swings,
        lightsOffButton: off && s1?.lightsOn === false,
        lightsOffDims: s1?.lightsOn === false && dim <= lit * 0.9,
        lightsOnRestores: on && s2?.lightsOn === true && relit > dim && relit >= lit * 0.9
      },
      notes: { lit, dim, relit, angleRange: angles.length ? [Math.min(...angles), Math.max(...angles)] : null }
    };
  },

  async solar(page) {
    const s0 = await page.state();
    const planets = Array.isArray(s0?.planets) ? s0.planets.filter((p) => typeof p?.name === "string" && [p.x, p.y, p.z].every(num)) : [];
    await page.sleep(1000);
    const s1 = await page.state();
    const orbit = planetsMoved(s0, s1);
    const target = planets[Math.min(2, planets.length - 1)]?.name ?? null;
    const hasFocus = await page.eval("typeof window.__focusPlanet === 'function' && typeof window.__unfocus === 'function'");
    if (hasFocus && target) await page.eval(`window.__focusPlanet(${JSON.stringify(target)})`);
    const f1 = await waitFor(page, (s) => s?.focused === target && num(s?.cameraDistanceToFocus), { timeoutMs: 2500 });
    await page.sleep(1800); // the 1.5 s eased move has finished
    const f2 = await page.state();
    await page.sleep(800);
    const f3 = await page.state();
    const panel = target ? (await page.text()).includes(target) : false;
    const following = num(f2?.cameraDistanceToFocus) && num(f3?.cameraDistanceToFocus) && f3.cameraDistanceToFocus <= Math.max(f2.cameraDistanceToFocus * 1.3, f2.cameraDistanceToFocus + 0.5);
    await page.key("Escape");
    const e = await waitFor(page, (s) => s?.focused === null, { timeoutMs: 2500 });
    const paused = await page.clickText(/^\s*pause\s*$/i);
    const p0 = await waitFor(page, (s) => s?.paused === true, { timeoutMs: 1000 });
    await page.sleep(700);
    const p1 = await page.state();
    const play = await page.clickText(/^\s*play\s*$/i);
    const r0 = await waitFor(page, (s) => s?.paused === false, { timeoutMs: 1000 });
    await page.sleep(700);
    const r1 = await page.state();
    return {
      checks: {
        readyState: s0?.ready === true && planets.length >= 6,
        planetsOrbit: orbit,
        focusApi: Boolean(hasFocus && target && f1?.focused === target),
        panelShowsName: panel,
        cameraFollows: f2?.focused === target && following,
        escapeReturns: e?.focused === null && f1?.focused === target,
        pauseFreezes: paused && p0?.paused === true && !planetsMoved(p0, p1),
        playResumes: play && r0?.paused === false && planetsMoved(r0, r1)
      },
      notes: { planets: planets.length, target, distance: [f1?.cameraDistanceToFocus ?? null, f2?.cameraDistanceToFocus ?? null, f3?.cameraDistanceToFocus ?? null] }
    };
  },
  async "solar-followup"(page) {
    const s0 = await page.state();
    // Innermost = smallest distance from the star; the star is taken to be the origin (orbits are centred on it).
    const byRadius = (Array.isArray(s0?.planets) ? s0.planets : []).filter((p) => typeof p?.name === "string" && [p.x, p.z].every(num)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).map((p) => p.name);
    const tour = await page.clickText(/^\s*tour\s*$/i);
    const t0 = await waitFor(page, (s) => s?.touring === true && typeof s?.focused === "string", { timeoutMs: 2000 });
    const first = t0?.focused ?? null;
    const t1 = await waitFor(page, (s) => typeof s?.focused === "string" && s.focused !== first, { timeoutMs: 4500, stepMs: 150 });
    const second = t1?.focused !== first ? t1?.focused ?? null : null;
    const stop = await page.clickText(/^\s*stop tour\s*$/i);
    const e = await waitFor(page, (s) => s?.touring === false && s?.focused === null, { timeoutMs: 2500 });
    return {
      checks: {
        tourButton: tour && t0?.touring === true,
        tourOrderInnerToOuter: byRadius.length >= 2 && first === byRadius[0] && second === byRadius[1],
        stopTourReturns: stop && e?.touring === false && e?.focused === null
      },
      notes: { first, second, innermost: byRadius.slice(0, 2) }
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
