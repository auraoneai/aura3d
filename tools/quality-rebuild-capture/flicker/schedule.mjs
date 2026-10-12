/*
 * games.json timeline -> virtual-time input schedule for the flicker probe.
 *
 * Real-time steps (`wait`, `hold`, `drag` timing) become virtual milliseconds so the same inputs land
 * on the same 60 Hz frame in every arm. Plugin steps (strip, webm, fps, audio-webm) and `until`
 * conditions are skipped; `repeat` is unrolled. A `press` is a key down plus an up two frames later
 * so per-frame edge-triggered input never misses it.
 */
export function buildSchedule(timeline, { markShot = "02-opening", pressMs = 34 } = {}) {
  const events = [];
  let t = 0;
  let markAt = null;
  const walk = (steps) => {
    for (const step of steps ?? []) {
      if (!step || typeof step !== "object") continue;
      if ("wait" in step) t += Number(step.wait) || 0;
      else if ("press" in step) { events.push({ t, kind: "down", key: step.press }); events.push({ t: t + pressMs, kind: "up", key: step.press }); t += pressMs + (step.delay ?? 0); }
      else if ("down" in step) events.push({ t, kind: "down", key: step.down });
      else if ("up" in step) events.push({ t, kind: "up", key: step.up });
      else if ("hold" in step) {
        const keys = Array.isArray(step.hold) ? step.hold : [step.hold];
        for (const k of keys) events.push({ t, kind: "down", key: k });
        t += Number(step.ms) || 0;
        for (const k of [...keys].reverse()) events.push({ t, kind: "up", key: k });
      } else if ("releaseAll" in step) events.push({ t, kind: "releaseAll" });
      else if ("repeat" in step) { for (let i = 0; i < step.repeat; i++) walk(step.steps); }
      else if ("drag" in step) {
        const d = step.drag; const n = d.steps ?? 12; const ms = d.ms ?? 500;
        events.push({ t, kind: "mouseDown", selector: d.selector ?? null, from: d.from ?? [0.5, 0.5] });
        for (let i = 1; i <= n; i++) { t += ms / n; events.push({ t, kind: "mouseMove", by: [(d.by[0] * i) / n, (d.by[1] * i) / n] }); }
        events.push({ t, kind: "mouseUp" });
      } else if ("mouse" in step) {
        const m = step.mouse;
        events.push({ t, kind: "mouseDown", selector: m.selector ?? null, from: m.from ?? [0.5, 0.5], button: m.button });
        t += m.ms ?? 300;
        events.push({ t, kind: "mouseUp", button: m.button });
      } else if ("shot" in step) { if (step.shot === markShot && markAt === null) markAt = t; }
      // click / tap / focus / until / plugin steps: no virtual-time equivalent; skipped.
    }
  };
  walk(timeline);
  events.sort((a, b) => a.t - b.t);
  return { events, markAt: markAt ?? 0, endAt: t };
}

/** Drive one schedule event through Playwright. `ctx` keeps the drag origin and held keys. */
export async function applyEvent(page, ev, ctx) {
  if (ev.kind === "down") { await page.keyboard.down(ev.key); ctx.held.add(ev.key); }
  else if (ev.kind === "up") { await page.keyboard.up(ev.key); ctx.held.delete(ev.key); }
  else if (ev.kind === "releaseAll") { for (const k of [...ctx.held]) await page.keyboard.up(k); ctx.held.clear(); }
  else if (ev.kind === "mouseDown") {
    let x = ctx.vw * ev.from[0]; let y = ctx.vh * ev.from[1];
    if (ev.selector) {
      const box = await page.locator(ev.selector).first().boundingBox({ timeout: 3000 }).catch(() => null);
      if (box) { x = box.x + box.width * ev.from[0]; y = box.y + box.height * ev.from[1]; }
    }
    ctx.origin = [x, y];
    await page.mouse.move(x, y);
    await page.mouse.down({ button: ev.button ?? "left" });
  } else if (ev.kind === "mouseMove") await page.mouse.move(ctx.origin[0] + ev.by[0], ctx.origin[1] + ev.by[1]);
  else if (ev.kind === "mouseUp") await page.mouse.up({ button: ev.button ?? "left" });
}
