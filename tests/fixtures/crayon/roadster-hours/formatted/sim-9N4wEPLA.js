import { C as e, D as t, O as n, S as r, T as i, b as a, k as o, v as s, y as c } from "./world-BJq13QzJ.js";
var l = `skybreak.career.v1`, u = [{ id: `reservoir`, name: `Thrust reservoir`, desc: `+20% thrust capacity`, cost: [2, 4], max: 2 }, { id: `cooling`, name: `Thermal recovery`, desc: `Cool faster. Recharge sooner.`, cost: [2, 4], max: 2 }, { id: `aero`, name: `Aero stabilizer`, desc: `Sharper grip and air control`, cost: [2, 4], max: 2 }];
function d() {
  return { version: 1, unlocked: 0, credits: 0, upgrades: { reservoir: 0, cooling: 0, aero: 0 }, results: {}, awards: [], resume: null, settings: { sound: true, quality: `high`, shake: true, slowmo: true, controls: `auto`, touchHelpSeen: false } };
}
function f(e2) {
  try {
    let t2 = typeof e2 == `string` ? JSON.parse(e2) : e2;
    if (!t2 || t2.version !== 1) return d();
    let n2 = d();
    n2.unlocked = a(Math.floor(+t2.unlocked || 0), 0, s.length - 1), n2.credits = a(Math.floor(+t2.credits || 0), 0, 100);
    for (let e3 of u) n2.upgrades[e3.id] = a(Math.floor(+t2.upgrades?.[e3.id] || 0), 0, 2);
    for (let e3 of s.map((e4) => e4.id)) {
      let r3 = t2.results?.[e3];
      r3 && Number.isFinite(r3.time) && r3.time > 0 && (n2.results[e3] = { time: r3.time, score: a(+r3.score || 0, 0, 1e7), medal: [`gold`, `silver`, `bronze`].includes(r3.medal) ? r3.medal : `bronze`, cells: a(+r3.cells || 0, 0, 10) });
    }
    n2.awards = Array.isArray(t2.awards) ? t2.awards.filter((e3) => typeof e3 == `string`).slice(0, 20) : [];
    let r2 = t2.resume, i2 = r2?.route ? s.findIndex((e3) => e3.id === r2.route) : r2?.level;
    return Number.isInteger(i2) && i2 >= 0 && i2 < s.length && i2 <= n2.unlocked && Number.isInteger(r2.checkpoint) && r2.checkpoint >= 0 && r2.checkpoint < s[i2].gates.length && (n2.resume = { route: s[i2].id, level: i2, checkpoint: r2.checkpoint, time: a(+r2.time || 0, 0, 3600), score: a(+r2.score || 0, 0, 1e7), cells: Array.isArray(r2.cells) ? [...new Set(r2.cells.filter((e3) => Number.isInteger(e3) && e3 >= 0 && e3 < s[i2].cells.length))] : [], crashes: a(+r2.crashes || 0, 0, 1e3) }), t2.settings && (n2.settings.controls = [`auto`, `touch`, `keys`].includes(t2.settings.controls) ? t2.settings.controls : `auto`, n2.settings.touchHelpSeen = t2.settings.touchHelpSeen === true, n2.settings.sound = t2.settings.sound !== false, n2.settings.shake = t2.settings.shake !== false, n2.settings.slowmo = t2.settings.slowmo !== false, n2.settings.quality = [`high`, `balanced`].includes(t2.settings.quality) ? t2.settings.quality : `high`), n2;
  } catch {
    return d();
  }
}
function p(e2, t2) {
  let n2 = u.find((e3) => e3.id === t2);
  if (!n2) return false;
  let r2 = e2.upgrades[t2];
  return r2 >= n2.max || e2.credits < n2.cost[r2] ? false : (e2.credits -= n2.cost[r2], e2.upgrades[t2]++, true);
}
var m = Math.PI * 2, h = { spin: { max: 5.6, accel: 30, points: [400, 700, 1e3] }, flip: { max: 4.8, accel: 24, points: [500, 800, 1200] }, combo: 400, landing: { roll: { clean: 0.5, hard: 1.5 }, spin: { clean: 0.45, hard: 1.2 }, flip: { clean: 0.45, hard: 1 } } }, g = { rate: 3.2, back: 5, grip: 10.8, downforce: 5.5, vlat: 8.5, lowSpeed: 0.45, yawCap: 1.6, drift: 0.42 }, _ = (e2, t2 = false) => Math.min(g.vlat * (t2 ? 1.2 : 1), Math.max(0, e2) * g.lowSpeed), v = { accel: [0, 16, 24, 30], top: [0, 84, 92, 100], drain: [0, 11, 13, 40], heat: 6, min: 6, window: [0.6, 1], grace: 0.22, doubleTap: 0.32, shockwave: 2.5 }, y = { trick: 8, roll: 8, nearMiss: 6, overTop: 8, lineup: 10, air: 2 }, b = (e2, t2) => {
  e2.thrust = Math.min(e2.capacity, e2.thrust + t2);
}, x = { halfLen: 2.25, halfWid: 0.92, height: 1.25 };
function S(e2) {
  let t2 = o(e2.piece || `sedan`, e2.v || 0), n2 = e2.end ?? e2.s + 300;
  return { ...e2, piece: e2.piece || `sedan`, v: e2.v || 0, end: n2, spawn: e2.s, wake: a(30 * (n2 - e2.s) / Math.max(1, e2.speed), 60, 400), active: false, moving: false, passed: false, topped: false, rel: null, ...t2 };
}
function C(t2, n2, r2 = null) {
  let a2 = s[t2];
  if (!a2 || t2 > n2.unlocked) throw Error(`Level is locked`);
  let o2 = r2?.checkpoint ?? -1, c2 = o2 >= 0 ? a2.gates[o2].s + 12 : 8;
  return { levelIndex: t2, level: a2, phase: `countdown`, countdown: 2.7, s: c2, l: 0, h: 0, v: 0, vy: 0, theta: 0, wheel: 0, slip: 0, roll: 0, rollVelocity: 0, pitch: 0, spin: 0, flip: 0, rollRate: 0, spinRate: 0, flipRate: 0, thrust: 100 + n2.upgrades.reservoir * 20, capacity: 100 + n2.upgrades.reservoir * 20, heat: 0, overheated: false, grounded: true, time: r2?.time || 0, score: r2?.score || 0, combo: 1, comboTime: 0, checkpoint: o2, nextGate: o2 + 1, cells: new Set(r2?.cells || []), crashes: r2?.crashes || 0, airTime: 0, driftTime: 0, boostHold: 0, rollTravel: 0, spinTurns: 0, flipTurns: 0, airTricks: [], maxHeight: 0, maxSpeed: 0, cleanLandings: 0, airRolls: 0, airSpins: 0, airFlips: 0, combos: 0, nearMisses: 0, lineupsCleared: 0, vehiclesCleared: 0, overTops: 0, trailerRides: 0, ridden: [], wallDistance: 0, shortcuts: 0, events: [], toast: null, toastTime: 0, recoverTime: 0, boosting: false, drifting: false, act: i(a2, c2).name, traffic: a2.traffic.map(S), lineups: e(a2).lineups.map(() => ({ over: [], done: false })), lastS: c2, lastGrounded: true, offroadTime: 0, upgrades: { ...n2.upgrades }, gateMiss: false, saveDirty: false, nitro: 0, nitroTime: 0, nitroHeld: false, nitroGrace: 0, nitroWindow: false, lastNitroPress: -9, scraping: false };
}
function w(e2, t2, n2 = {}) {
  e2.events.push({ type: t2, ...n2 });
}
function T(e2, t2, n2) {
  e2.score += Math.round(t2 * e2.combo), e2.combo = a(e2.combo + 0.25, 1, 5), e2.comboTime = 5, e2.toast = n2, e2.toastTime = 1.7, w(e2, `reward`, { points: t2, label: n2 });
}
function E(e2) {
  e2.roll = 0, e2.spin = 0, e2.flip = 0, e2.rollRate = 0, e2.spinRate = 0, e2.flipRate = 0, e2.rollTravel = 0, e2.spinTurns = 0, e2.flipTurns = 0, e2.airTricks = [];
}
function D(t2, n2 = `RECOVERED`) {
  if (t2.phase !== `complete`) {
    t2.crashes++, t2.score = Math.max(0, t2.score - 150), t2.combo = 1, t2.comboTime = 0, t2.s = t2.checkpoint >= 0 ? t2.level.gates[t2.checkpoint].s + 12 : 8, t2.l = 0, t2.h = 0, t2.v = 8, t2.vy = 0, t2.theta = 0, t2.wheel = 0, t2.slip = 0, t2.nitro = 0, E(t2), t2.heat = 10, t2.thrust = t2.capacity, t2.overheated = false, t2.grounded = true, t2.recoverTime = 0.75, t2.airTime = 0, t2.gateMiss = false, t2.offroadTime = 0;
    for (let e2 of t2.traffic || []) e2.rel = null, e2.spawn > t2.s - 20 && (e2.s = e2.spawn, e2.active = false, e2.moving = false, e2.passed = false, e2.topped = false);
    t2.lineups && e(t2.level).lineups.forEach((e2, n3) => {
      e2.s1 > t2.s - 5 && (t2.lineups[n3] = { over: [], done: false });
    }), t2.toast = n2, t2.toastTime = 2, w(t2, `recover`, { reason: n2 }), t2.saveDirty = true;
  }
}
function O(e2) {
  return e2.checkpoint < 0 ? null : { route: e2.level.id, level: e2.levelIndex, checkpoint: e2.checkpoint, time: e2.time, score: e2.score, cells: [...e2.cells], crashes: e2.crashes };
}
function k(e2, t2) {
  if (e2.phase === `complete` || e2.nextGate < e2.level.gates.length) return false;
  e2.phase = `complete`;
  let n2 = r(e2.level, e2.time, e2.score, e2.cells.size), i2 = t2.results[e2.level.id], a2 = { time: e2.time, score: e2.score, medal: n2, cells: e2.cells.size, crashes: e2.crashes, cleanLandings: e2.cleanLandings, airRolls: e2.airRolls, spins: e2.airSpins, flips: e2.airFlips, combos: e2.combos, lineups: e2.lineupsCleared, vehicles: e2.vehiclesCleared }, o2 = { bronze: 1, silver: 2, gold: 3 }, s2 = o2[i2?.medal] || 0;
  t2.results[e2.level.id] = { time: Math.min(i2?.time ?? 1 / 0, e2.time), score: Math.max(i2?.score ?? 0, e2.score), medal: s2 > o2[n2] ? i2.medal : n2, cells: Math.max(i2?.cells ?? 0, e2.cells.size) };
  let c2 = 0;
  for (let [r2, i3] of [[`clear`, 2], [`silver`, 1], [`gold`, 1], [`cells`, 1]]) {
    let a3 = r2 === `clear` || r2 === `silver` && o2[n2] >= 2 || r2 === `gold` && n2 === `gold` || r2 === `cells` && e2.cells.size >= Math.ceil(e2.level.cells.length * 0.6), s3 = e2.level.id + `:` + r2;
    a3 && !t2.awards.includes(s3) && (t2.awards.push(s3), c2 += i3);
  }
  return t2.credits += c2, t2.unlocked = Math.max(t2.unlocked, e2.level.unlocks ?? 0), t2.resume = null, e2.result = { ...a2, credits: c2 }, w(e2, `finish`, e2.result), true;
}
function A(n2, r2, i2, a2 = n2.h) {
  let o2 = t(n2.level, r2, i2), s2 = (e2, t2, n3, s3) => {
    for (let c2 of e2) r2 > c2.s0 + t2 - 0.4 && r2 < c2.s1 + t2 + 0.4 && i2 > c2.l0 + n3 - 0.6 && i2 < c2.l1 + n3 + 0.6 && a2 >= c2.y1 - 0.6 && (!o2 || c2.y1 > o2.height) && (o2 = { height: c2.y1, shortcut: false, roof: s3 });
  };
  for (let t2 of e(n2.level).vehicles) t2.roofs.length && r2 > t2.s0 - 1 && r2 < t2.s1 + 1 && s2(t2.roofs, 0, 0, `p` + t2.index);
  return n2.traffic && n2.traffic.forEach((e2, t2) => {
    e2.roofs.length && Math.abs(r2 - e2.s) < e2.halfLen + 1 && s2(e2.roofs, e2.s, e2.l, `t` + t2);
  }), o2;
}
function j(e2, t2, n2 = 0, r2 = 0) {
  return e2.s + x.halfLen - 0.3 > t2.s0 + n2 && e2.s - x.halfLen + 0.3 < t2.s1 + n2 && e2.l + x.halfWid - 0.15 > t2.l0 + r2 && e2.l - x.halfWid + 0.15 < t2.l1 + r2 && e2.h < t2.y1 - 0.35 && e2.h + x.height > t2.y0;
}
function M(e2, t2) {
  e2.airTricks.includes(t2) || e2.airTricks.push(t2);
}
function N(e2, t2, n2, r2, i2, o2) {
  let s2 = t2 + `Rate`, c2 = e2[t2], l2 = e2[s2];
  if (n2) l2 += a(n2 * i2.max - l2, -i2.accel * r2, i2.accel * r2);
  else {
    let e3 = Math.round((c2 + l2 * 0.08) / m) * m;
    l2 += ((e3 - c2) * (3 + o2) - l2) * Math.min(1, r2 * 10);
  }
  e2[t2] = c2 + l2 * r2, e2[s2] = l2;
}
var P = (e2) => `${e2 * 360} SPIN`, F = (e2, t2) => `${[``, ``, `DOUBLE `, `TRIPLE `][e2] ?? e2 + `\xD7 `}${t2 ? `FRONT` : `BACK`} FLIP`;
function I(t2, n2) {
  t2.airTime = 0, t2.rollTravel = 0, t2.spin = 0, t2.flip = 0, t2.spinRate = 0, t2.flipRate = 0, t2.spinTurns = 0, t2.flipTurns = 0, t2.airTricks = [];
  let r2 = n2 ? e(t2.level).lineups.find((e2) => e2.kicker === n2) : null;
  w(t2, `launch`, r2 ? { kicker: true, lineup: r2.index, big: r2.big, count: r2.count } : {});
}
function L(e2, t2, n2) {
  let r2 = v, i2 = t2 && !e2.nitroHeld, o2 = !t2 && e2.nitroHeld;
  e2.nitroHeld = t2, e2.nitroTime += n2, i2 && (e2.time - e2.lastNitroPress < r2.doubleTap && e2.thrust >= e2.capacity * 0.97 && e2.nitro < 3 ? (e2.nitro = 3, e2.nitroTime = 0, e2.toast = `SHOCKWAVE`, e2.toastTime = 1.2, w(e2, `nitro`, { level: 3 })) : e2.nitro === 1 && e2.nitroTime >= r2.window[0] && e2.nitroTime <= r2.window[1] ? (e2.nitro = 2, w(e2, `nitro`, { level: 2 }), T(e2, 150, `PERFECT NITRO`)) : !e2.nitro && e2.thrust > r2.min && !e2.overheated && (e2.nitro = 1, e2.nitroTime = 0, w(e2, `nitro`, { level: 1 })), e2.lastNitroPress = e2.time), o2 && e2.nitro && e2.nitro < 3 && (e2.nitroGrace = r2.grace), !t2 && e2.nitro && e2.nitro < 3 && (e2.nitroGrace -= n2, e2.nitroGrace <= 0 && (e2.nitro = 0)), e2.nitro === 3 && e2.nitroTime > r2.shockwave && (e2.nitro = 0), e2.nitro && (e2.thrust = Math.max(0, e2.thrust - n2 * r2.drain[e2.nitro]), e2.heat = a(e2.heat + n2 * r2.heat, 0, 100), (e2.thrust <= 0 || e2.overheated) && (e2.nitro = 0)), e2.nitroWindow = e2.nitro === 1 && e2.nitroTime >= r2.window[0] && e2.nitroTime <= r2.window[1];
}
function R(t2, r2, o2, s2) {
  if (o2 = a(o2, 0, 0.04), t2.events = [], t2.phase === `paused` || t2.phase === `complete`) return;
  if (t2.phase === `countdown`) {
    t2.countdown -= o2, t2.countdown <= 0 && (t2.phase = `running`, w(t2, `go`));
    return;
  }
  if (t2.time += o2, t2.toastTime = Math.max(0, t2.toastTime - o2), t2.recoverTime = Math.max(0, t2.recoverTime - o2), r2.recover) {
    D(t2);
    return;
  }
  t2.comboTime -= o2, t2.comboTime <= 0 && (t2.combo = Math.max(1, t2.combo - o2 * 0.8));
  let l2 = t2.s, u2 = t2.l, d2 = t2.h, f2 = t2.grounded, p2 = n(t2.level, t2.s), S2 = a(r2.throttle || 0, 0, 1), C2 = a(r2.brake || 0, 0, 1), E2 = a(r2.steer || 0, -1, 1);
  L(t2, !!r2.nitro, o2);
  let O2 = !!r2.thrust && t2.thrust > 0.15 && !t2.overheated;
  t2.boosting = O2, O2 ? (t2.thrust = Math.max(0, t2.thrust - o2 * (t2.grounded ? 14 : 19)), t2.heat = a(t2.heat + o2 * (t2.grounded ? 20 : 25), 0, 100)) : (t2.heat = Math.max(0, t2.heat - o2 * (t2.grounded ? 27 : 11) * (1 + t2.upgrades.cooling * 0.3) * (t2.nitro ? 0.4 : 1)), t2.grounded && !t2.nitro && (t2.thrust = Math.min(t2.capacity, t2.thrust + o2 * (12 + t2.upgrades.cooling * 4)))), t2.grounded || b(t2, o2 * y.air), t2.heat >= 100 && (t2.overheated = true, t2.boosting = false, w(t2, `overheat`)), t2.overheated && t2.heat < 38 && (t2.overheated = false), t2.boostHold = t2.boosting && t2.grounded ? t2.boostHold + o2 : 0;
  let R2 = t2.boosting, z = 1 + t2.upgrades.aero * 0.12;
  t2.drifting = !!r2.drift && t2.grounded && t2.v > 14 && Math.abs(E2) > 0.1;
  let B = (t2.grounded ? 17 : 7) * S2 - (t2.grounded ? 30 : 11) * C2 - 1.3 - t2.v * t2.v * 24e-4;
  R2 && (B += t2.grounded ? 20 : 9), r2.drift && (B -= t2.grounded ? 2 : 9), t2.nitro && (B += v.accel[t2.nitro] * (t2.grounded ? 1 : 0.5)), t2.v = a(t2.v + B * o2, 0, Math.max(R2 ? 74 : 61, v.top[t2.nitro]));
  let V = Math.abs(E2) < Math.abs(t2.wheel) || E2 * t2.wheel < 0 ? g.back : g.rate;
  if (t2.wheel += a(E2 - t2.wheel, -V * o2, V * o2), t2.grounded) {
    let e2 = Math.max(t2.v, 1), n2 = (g.grip + g.downforce * (t2.v / 74) ** 2) * z * (t2.drifting ? 0.85 : 1), r3 = Math.asin(a(t2.wheel * _(t2.v, t2.drifting) / e2, -0.9, 0.9)), i2 = Math.min(g.yawCap, n2 / e2);
    t2.theta += a(r3 - t2.theta, -i2 * o2, i2 * o2), t2.slip += ((t2.drifting ? t2.wheel * g.drift : 0) - t2.slip) * Math.min(1, o2 * 3.5);
  } else {
    t2.slip += (0 - t2.slip) * Math.min(1, o2 * 3);
    let e2 = Math.sign(t2.l);
    !t2.level.shortcuts.some((e3) => t2.s > e3.start - 80 && t2.s < e3.end && Math.abs(t2.l - e3.l) < 10) && Math.abs(t2.l) > t2.level.width - 2.5 && t2.theta * e2 > -0.04 && (t2.theta -= e2 * Math.min(0.9 * o2, t2.theta * e2 + 0.04));
  }
  if (t2.s += t2.v * Math.cos(t2.theta) * o2 / Math.sqrt(1 + p2.dx * p2.dx), t2.l += Math.sin(t2.theta) * t2.v * o2, t2.grounded) {
    let e2 = t2.level.width - 1.15;
    if (!t2.level.shortcuts.some((e3) => t2.s >= e3.start && t2.s <= e3.end && Math.abs(t2.l - e3.l) < 5.5) && Math.abs(t2.l) > e2 && Math.abs(u2) <= e2 + 0.05 && !t2.level.gaps.some(([e3, n2]) => t2.s > e3 - 3 && t2.s < n2 + 1)) {
      let n2 = Math.sign(t2.l);
      t2.l = n2 * e2, t2.theta * n2 > 0 && (t2.theta *= 0.25), t2.wheel *= 0.5, t2.v = Math.max(8, t2.v - o2 * (10 + t2.v * 0.25)), t2.scraping || w(t2, `scrape`), t2.scraping = true;
    } else t2.scraping = false;
  }
  t2.grounded || (t2.l += Math.sin(t2.time * 0.8 + t2.s * 3e-3) * t2.level.wind * o2);
  let H = A(t2, l2, u2, d2), U = A(t2, t2.s, t2.l, d2), W = n(t2.level, t2.s);
  if (f2 && (!U || U.height < t2.h - 0.2)) {
    let e2 = H?.kicker, n2 = e2 && t2.s >= e2.s + e2.len;
    t2.grounded = false, t2.vy = n2 ? R2 ? 4.5 + t2.v * e2.lift * 1.1 : 2.8 + t2.v * e2.lift : 2.8 + (p2.ramp > 0 ? t2.v * 0.13 : 0), n2 && (t2.boostHold = 0), I(t2, n2 ? e2 : null);
  }
  if (t2.grounded && U) t2.h = U.height, t2.vy = 0, t2.airTime = 0, R2 && !U.kicker && Math.abs(W.bank) < 0.6 && (p2.ramp > 1 || t2.boostHold > 0.34) && (t2.grounded = false, t2.vy = p2.ramp > 1 ? 8 + t2.v * 0.09 : 7, t2.boostHold = 0, I(t2, null)), Math.abs(W.bank) > 0.7 && (t2.wallDistance += t2.v * o2), t2.drifting ? (t2.driftTime += o2, t2.score += o2 * t2.v * 0.9 * t2.combo, t2.driftTime > 0.8 && (t2.toast = `DRIFT CHARGE`, t2.toastTime = 0.3, t2.thrust = Math.min(t2.capacity, t2.thrust + o2 * 8))) : t2.driftTime = 0;
  else if (t2.airTime += o2, t2.vy += (-16 + (R2 ? 24 : 0) - C2 * 12) * o2, t2.vy = a(t2.vy, -28, 18), t2.h += t2.vy * o2 - (W.y - p2.y), t2.maxHeight = Math.max(t2.maxHeight, t2.h), U && t2.h <= U.height && d2 >= U.height - 1.2 && t2.vy <= 2) {
    let e2 = (e3) => Math.abs(Math.atan2(Math.sin(e3), Math.cos(e3))), n2 = h.landing, r3 = e2(t2.roll), i2 = e2(t2.spin), o3 = e2(t2.flip);
    if (t2.vy < -18 && t2.thrust > 10 && !t2.overheated && (t2.thrust -= 10, t2.vy *= 0.55, w(t2, `landingFlare`)), t2.vy < -23 || r3 > n2.roll.hard || i2 > n2.spin.hard || o3 > n2.flip.hard) {
      D(t2, `HARD LANDING`);
      return;
    }
    if (t2.grounded = true, t2.h = U.height, t2.vy = 0, t2.roll = 0, t2.spin = 0, t2.flip = 0, t2.airTime > 0.5) {
      let e3 = r3 < n2.roll.clean && i2 < n2.spin.clean && o3 < n2.flip.clean;
      if (T(t2, e3 ? 260 : 100, e3 ? `CLEAN LANDING` : `LANDED`), t2.cleanLandings += +!!e3, t2.thrust = Math.min(t2.capacity, t2.thrust + (e3 ? 16 : 4)), e3 && (t2.v = Math.min(t2.v + 4, 74)), w(t2, `land`, { clean: e3, strength: a(t2.airTime / 3, 0.2, 1), roof: !!U.roof }), U.shortcut && (t2.shortcuts++, T(t2, 220, `ROOFLINE CUT`)), U.roof && !t2.ridden.includes(U.roof) && (t2.ridden.push(U.roof), t2.trailerRides++, T(t2, 300, `TRAILER RIDE`), w(t2, `trailer`)), t2.airTricks.length >= 2) {
        let e4 = t2.airTricks.length;
        t2.combos++, T(t2, h.combo * e4 * (e4 - 1) / 2, `COMBO \xB7 ` + t2.airTricks.map((e5) => e5.toUpperCase()).join(` + `)), w(t2, `combo`, { count: e4, tricks: [...t2.airTricks] });
      }
    }
    t2.airTime = 0, t2.airTricks = [];
  } else U?.kicker && t2.h < U.height && (t2.h = U.height);
  if (t2.grounded) t2.roll = 0, t2.spin = 0, t2.flip = 0, t2.rollRate = 0, t2.spinRate = 0, t2.flipRate = 0;
  else {
    let e2 = a(r2.roll || 0, -1, 1), n2 = t2.roll;
    if (e2) {
      let n3 = e2 * 3.4 * o2;
      t2.roll += n3, t2.rollTravel += Math.abs(n3), t2.rollTravel >= Math.PI * 2 && (t2.rollTravel -= Math.PI * 2, t2.airRolls++, T(t2, 450, `AIR ROLL`), b(t2, y.roll), w(t2, `roll`), M(t2, `roll`));
    } else {
      let e3 = Math.round(t2.roll / (Math.PI * 2)) * Math.PI * 2;
      t2.roll += (e3 - t2.roll) * Math.min(1, o2 * (2.5 + t2.upgrades.aero));
    }
    t2.rollRate = o2 > 0 ? (t2.roll - n2) / o2 : 0, N(t2, `spin`, a(r2.spin || 0, -1, 1), o2, h.spin, t2.upgrades.aero), N(t2, `flip`, a(r2.flip || 0, -1, 1), o2, h.flip, t2.upgrades.aero);
    let i2 = Math.floor((Math.abs(t2.spin) + 0.3) / m);
    i2 > t2.spinTurns && (t2.spinTurns = i2, t2.airSpins++, T(t2, h.spin.points[Math.min(i2, 3) - 1] + Math.max(0, i2 - 3) * 300, P(i2)), b(t2, y.trick), w(t2, `trick`, { kind: `spin`, turns: i2, dir: Math.sign(t2.spin) }), M(t2, `spin`));
    let s3 = Math.floor((Math.abs(t2.flip) + 0.3) / m);
    s3 > t2.flipTurns && (t2.flipTurns = s3, t2.airFlips++, T(t2, h.flip.points[Math.min(s3, 3) - 1] + Math.max(0, s3 - 3) * 400, F(s3, t2.flip > 0)), b(t2, y.trick), w(t2, `trick`, { kind: `flip`, turns: s3, dir: Math.sign(t2.flip) }), M(t2, `flip`));
  }
  if (t2.h < -38 || Math.abs(t2.l) > 68 || Math.abs(t2.l) > t2.level.width + 1 && t2.h < -3) {
    D(t2, `RETURN TO RELAY`);
    return;
  }
  !U && t2.grounded && (t2.grounded = false);
  for (let e2 = 0; e2 < t2.level.cells.length; e2++) {
    let n2 = t2.level.cells[e2];
    !t2.cells.has(e2) && Math.abs(t2.s - n2.s) < 3.5 && Math.abs(t2.l - n2.l) < 2.4 && Math.abs(t2.h - n2.h) < 2.7 && (t2.cells.add(e2), T(t2, 200, `DATA CELL`), t2.thrust = Math.min(t2.capacity, t2.thrust + 12), w(t2, `cell`, { index: e2 }), t2.saveDirty = true);
  }
  for (let e2 of t2.traffic) {
    if (!e2.active && t2.s > e2.spawn - e2.wake && (e2.active = true), e2.moving = e2.active && e2.s < e2.end, e2.moving && (e2.s = Math.min(e2.end, e2.s + e2.speed * o2)), t2.v > (e2.moving ? e2.speed : 0) + 5 && Math.abs(t2.s - e2.s) < e2.halfLen + 3 && e2.boxes.some((n3) => j(t2, n3, e2.s, e2.l))) {
      D(t2, `TRAFFIC IMPACT`);
      return;
    }
    let n2 = t2.s - e2.s, r3 = e2.rel;
    if (e2.rel = n2, r3 == null || !(r3 < 0 && n2 >= 0)) continue;
    let i2 = Math.abs(e2.l - t2.l), a2 = i2 - e2.halfWid - x.halfWid;
    !e2.topped && i2 < e2.halfWid + 0.5 && t2.h >= e2.hgt - 0.35 ? (e2.topped = true, t2.overTops++, T(t2, 200 + (c[e2.piece] || 100), `OVER THE TOP`), b(t2, y.overTop), w(t2, `hop`, { piece: e2.piece })) : !e2.passed && a2 >= 0 && a2 < 2.7 && t2.h < 2 && (e2.passed = true, t2.nearMisses++, T(t2, 120, `CLOSE PASS`), b(t2, y.nearMiss), w(t2, `closePass`, { clear: a2 }));
  }
  let G = e(t2.level);
  for (let e2 of G.vehicles) if (t2.s > e2.s0 - 3 && t2.s < e2.s1 + 3 && Math.abs(t2.l - (e2.l0 + e2.l1) / 2) < (e2.l1 - e2.l0) / 2 + 2 && e2.boxes.some((e3) => j(t2, e3))) {
    D(t2, `VEHICLE IMPACT`);
    return;
  }
  G.lineups.forEach((e2, n2) => {
    let r3 = t2.lineups[n2];
    if (!r3 || r3.done || t2.s < e2.s0 - 3 || (e2.rows.forEach((e3, n3) => {
      !r3.over.includes(n3) && t2.s > e3.s0 - 0.5 && t2.s < e3.s1 + 0.5 && t2.l > e3.l0 - 0.6 && t2.l < e3.l1 + 0.6 && t2.h >= e3.top - 0.35 && r3.over.push(n3);
    }), t2.s <= e2.s1 + 1.5)) return;
    r3.done = true;
    let i2 = r3.over.map((t3) => e2.rows[t3]), a2 = i2.reduce((e3, t3) => e3 + t3.count, 0);
    if (!a2) return;
    let o3 = r3.over.length === e2.rows.length, s3 = Math.round(i2.reduce((e3, t3) => e3 + t3.points, 0) * (o3 ? 1.25 : 1));
    t2.vehiclesCleared += a2, o3 && t2.lineupsCleared++, T(t2, s3, o3 && e2.label ? e2.label : `LINEUP CLEAR \xB7 ` + a2), b(t2, y.lineup), w(t2, `lineup`, { index: n2, count: a2, all: o3, big: e2.big });
  });
  for (let e2 of t2.level.hazards) (e2.type !== `vent` || Math.sin(t2.time * 1.6 + e2.s) > -0.35) && Math.abs(t2.s - e2.s) < 2.5 && Math.abs(t2.l - e2.l) < e2.r + 1 && t2.h < (e2.type === `vent` ? 5 : 1.5) && (t2.v = Math.max(5, t2.v - 15), t2.l += t2.l > e2.l ? 1.8 : -1.8, t2.heat = Math.min(98, t2.heat + 15), t2.combo = 1, t2.toast = e2.type === `vent` ? `VENT TURBULENCE` : `BARRIER HIT`, t2.toastTime = 1.4, w(t2, `impact`));
  let K = t2.level.gates[t2.nextGate];
  if (K && l2 < K.s && t2.s >= K.s && (Math.abs(t2.l - K.l) < t2.level.width - 1 && t2.h >= -0.5 && t2.h < (K.ceiling ?? 60) ? (t2.checkpoint = t2.nextGate++, T(t2, 350, `RELAY ` + t2.nextGate + ` / ` + t2.level.gates.length), t2.saveDirty = true, w(t2, `checkpoint`, { index: t2.checkpoint })) : (t2.gateMiss = true, t2.toast = `MISSED RELAY \xB7 R TO RECOVER`, t2.toastTime = 5)), K && t2.s > K.s + 55 && t2.nextGate === t2.checkpoint + 1) {
    D(t2, `MISSED RELAY`);
    return;
  }
  t2.s >= t2.level.length && (t2.nextGate >= t2.level.gates.length ? (T(t2, 500, `ROUTE COMPLETE`), k(t2, s2)) : D(t2, `RELAYS REQUIRED`)), t2.maxSpeed = Math.max(t2.maxSpeed, t2.v), t2.lastS = l2, t2.lastGrounded = f2, t2.act = i(t2.level, t2.s).name;
}
export {
  d as a,
  D as c,
  C as i,
  O as l,
  u as n,
  A as o,
  p as r,
  f as s,
  l as t,
  R as u
};
