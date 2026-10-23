// UNTRUSTED THIRD-PARTY DATA: de-minified (pretty-printed only, identifiers still minified) excerpt of the Last Train to the Sea
// game module (SHA-256 62fb7ac520225cc3c3e5799c7b17147475f8f20e4f7c04718721fcf46ac928ca). Read as text only; never execute.
// Regions: src/service/route.js + route helpers (module lines 10846-10947), boarding timing (13417-13440), src/service/economy.js incl. GM/WM (13780-14167).
// ---- route helpers
function cu(e2, t2) {
  const n2 = tu[e2], i2 = sn.clamp(t2, 0, n2.length), r2 = i2 / n2.length, a2 = n2.curve.getPoint(r2), o2 = n2.curve.getTangent(r2).normalize(), s2 = n2.curve.getTangent(Math.max(0, (i2 - 1) / n2.length)), l2 = n2.curve.getTangent(Math.min(1, (i2 + 1) / n2.length)), c2 = Math.atan2(s2.x * l2.z - s2.z * l2.x, s2.x * l2.x + s2.z * l2.z) / 2, d2 = sn.smoothstep(Math.min(i2, n2.length - i2), 65, 100), p2 = sn.clamp(7 * -c2, -0.055, 0.055) * d2, h2 = new hn().crossVectors(o2, new hn(0, 1, 0)).normalize(), u2 = new hn().crossVectors(h2, o2).normalize();
  return h2.applyAxisAngle(o2, p2), u2.applyAxisAngle(o2, p2), { position: a2, forward: o2, side: h2, up: u2, quaternion: new dn().setFromRotationMatrix(new Nn().makeBasis(o2, u2, h2)), bank: p2, u: r2, curvature: c2, grade: o2.y, verticalCurvature: (l2.y - s2.y) / 2 };
}
function du(e2, t2) {
  for (; t2 < 0; ) e2 = (e2 + tu.length - 1) % tu.length, t2 += tu[e2].length;
  for (; t2 > tu[e2].length; ) t2 -= tu[e2].length, e2 = (e2 + 1) % tu.length;
  return { leg: e2, distance: t2 };
}
function pu(e2) {
  const t2 = iu(e2), n2 = [28, 42, 24, 8, -12];
  return t2.map((t3) => {
    const i2 = { ...$h.find((e3) => e3.id === t3) };
    if ("shrine" === t3) return e2 >= 9 ? i2.position = au : e2 >= 8 && (i2.position = [644.788033, 54, -609.283602]), i2;
    const r2 = (e2 >= 6 ? Yh : Xh).indexOf(t3), a2 = Math.PI / 2 - r2 * Math.PI * 2 / 5;
    return i2.position = [430 * Math.cos(a2), n2[r2], 430 * Math.sin(a2) - 430], i2.heading = r2 * Math.PI * 2 / 5, i2;
  });
}
function hu(e2 = 5) {
  if (Qh = [5, 6, 7, 8, 9].includes(e2) ? e2 : 5, Jh.splice(0, Jh.length, ...pu(Qh)), Qh >= 6) {
    const e3 = { gardens: ["The pink-hour orchards", "Petals drift past the conservatory as the flower market closes."], observatory: ["The winter highland", "Warm bread, snowy roofs, and constellations beneath the frozen reservoir."], monsoon: ["The rain-soaked lantern market", "Soup under the awnings. Umbrellas in the lanes. Rain on the leaf roof."], saltlight: ["The moonlit harbor", "Fishing boats rock beside the quay. A gentle ray glides beneath the blue glow."] };
    for (const t2 of Jh) e3[t2.id] && (t2.subtitle = e3[t2.id][0], t2.story = e3[t2.id][1]);
  }
  eu.splice(0, eu.length, ...Qh >= 7 ? ["The Orchard Ribbon", "The Cedar Approach", "The Frostward Climb", "The Thawing Sky", "The Seaward Ribbon", "The Sunrise Return"] : 6 === Qh ? ["The Orchard Ribbon", "The Frostward Climb", "The Thawing Sky", "The Seaward Ribbon", "The Sunrise Return"] : ["The Orchard Ribbon", "The Rainfall Gardens", "The Cloud Cathedral", "The Seaward Ribbon", "The Sunrise Return"]), tu.splice(0, tu.length, ...lu()), tu.reduce((e3, t2) => e3 + t2.length, 0);
}
function uu(e2, t2 = 9) {
  var n2, i2, r2;
  if (!e2 || e2.routeRevision === t2) return e2;
  if (![5, 6, 7, 8, 9].includes(e2.routeRevision)) return e2;
  const a2 = structuredClone(e2), o2 = iu(a2.routeRevision), s2 = iu(t2), l2 = lu(pu(a2.routeRevision)), c2 = lu(pu(t2)), d2 = (e3) => Number.isInteger(e3) && e3 >= 0 && e3 < o2.length ? Math.max(0, s2.indexOf(o2[e3])) : e3, p2 = t2 >= 7 && a2.routeRevision < 7, h2 = o2.indexOf("gardens"), u2 = s2.indexOf("gardens"), f2 = s2.indexOf("shrine"), m2 = p2 ? c2[u2].length + c2[f2].length : 0, g2 = (e3, t3 = false) => {
    const n3 = {};
    for (const [i3, r3] of Object.entries(e3 || {})) {
      const e4 = Number(i3);
      if (Number.isFinite(r3) && l2[e4]) if (p2 && e4 === h2) if (t3) {
        const e5 = c2[u2].length / m2;
        n3[u2] = r3 * e5, n3[f2] = r3 * (1 - e5);
      } else {
        const t4 = Math.min(1, r3 / l2[e4].length) * m2;
        n3[u2] = Math.min(t4, c2[u2].length), n3[f2] = Math.max(0, t4 - c2[u2].length);
      }
      else n3[d2(e4)] = t3 ? r3 : r3 / l2[e4].length * c2[d2(e4)].length;
    }
    return n3;
  }, v2 = Number.isInteger(a2.leg) && l2[a2.leg] ? a2.leg : 0;
  if (a2.leg = d2(v2), a2.distance > 0) if (p2 && v2 === h2) {
    const e3 = a2.distance / l2[v2].length * m2;
    a2.distance = Math.min(e3, c2[u2].length), e3 > c2[u2].length && (a2.leg = f2, a2.distance = e3 - c2[u2].length);
  } else a2.distance = a2.distance / l2[v2].length * c2[a2.leg].length;
  for (const e3 of ["visits", "lapStops"]) a2[e3] && (a2[e3] = a2[e3].map(d2));
  for (const e3 of a2.trips || []) {
    if (!Number.isFinite(e3.fareDistance)) {
      let t3 = 0;
      for (let i3 = e3.origin, r3 = 0; r3 < o2.length && i3 !== e3.destination; r3++, i3 = (i3 + 1) % o2.length) t3 += (null == (n2 = l2[i3]) ? void 0 : n2.length) || 0;
      e3.fareDistance = Math.max(1, t3);
    }
    e3.origin = d2(e3.origin), e3.destination = d2(e3.destination), e3.journey && (e3.journey.frontiers = g2(e3.journey.frontiers), e3.journey.weights = g2(e3.journey.weights, true));
  }
  for (const e3 of Object.values(a2.arrivals || {})) e3.town = d2(e3.town);
  const x2 = a2.economy;
  if (x2) {
    const e3 = x2.attempt;
    e3 && (e3.startStation = d2(e3.startStation), e3.lastStation = d2(e3.lastStation), e3.legs = (e3.legs || []).flatMap((e4) => p2 && e4 === h2 ? [u2, f2] : [d2(e4)]), e3.frontiers = g2(e3.frontiers)), x2.leg && (x2.leg.origin = p2 && x2.leg.origin === h2 && a2.leg === f2 ? f2 : d2(x2.leg.origin)), x2.receipt && (x2.receipt.station = d2(x2.receipt.station)), x2.lastResult && (x2.lastResult.station = d2(x2.lastResult.station));
  }
  return a2.cargo && (a2.cargo.destination = d2(a2.cargo.destination)), (null == (i2 = a2.driving) ? void 0 : i2.legEarned) && (a2.driving.legEarned = Object.fromEntries(Object.entries(a2.driving.legEarned).map(([e3, t3]) => [d2(Number(e3)), t3]))), (null == (r2 = a2.driving) ? void 0 : r2.claims) && (a2.driving.claims = a2.driving.claims.map((e3) => {
    const n3 = /^(\d+):(\d+):(\d+)$/.exec(e3), i3 = /^(save|bold):(\d+)$/.exec(e3);
    return n3 ? `${t2}:${d2(Number(n3[2]))}:${n3[3]}` : i3 ? `${i3[1]}:${d2(Number(i3[2]))}` : e3;
  })), a2.routeRevision = t2, a2;
}
var fu, mu, gu, vu, xu, bu, yu, wu, _u, Mu, Su, Tu, Eu, ku, Au, Ru = Ys({ "src/service/route.js"() {
  Mh(), $h = [{ id: "shrine", name: "Cedarbell Shrine", subtitle: "The lantern-lit blossom grove", position: [600, 54, -550], heading: 1.75, color: "#bf6850", sky: ["#71b8d5", "#dce9d1"], story: "Step beneath the torii. A quiet prayer, a warm room, a forest older than the railway.", landmark: "The sanctuary beneath the cherry blossoms", boarding: 4 }, { id: "mango", name: "Mango Tide", subtitle: "The sunlit rooftop quarter", position: [0, 45, 0], heading: 0, color: "#ecc16f", sky: ["#43a8ee", "#c4e9f9"], story: "Laundry above the lanes. Tea on every terrace.", landmark: "The mango clocktower", boarding: 4 }, { id: "gardens", name: "Folded Gardens", subtitle: "A village of hanging orchards", position: [390, 132, -220], heading: Math.PI / 2, color: "#aaca89", sky: ["#50b5ee", "#d3f0ef"], story: "An entire village grows around the hanging conservatory.", landmark: "The great glass orchard", boarding: 4 }, { id: "monsoon", name: "Monsoon Exchange", subtitle: "The lantern market", position: [100, 60, -650], heading: Math.PI, color: "#aeafce", sky: ["#67b2e5", "#d1e6f2"], story: "A hundred warm windows, and the rain on the roof.", landmark: "The rain market and windmill", boarding: 4 }, { id: "observatory", name: "Drowned Observatory", subtitle: "The reservoir town", position: [-370, -12, -430], heading: Math.PI, color: "#87d6d1", sky: ["#45b7e7", "#bcf0ec"], story: "Glass domes and little houses look over an ancient reservoir.", landmark: "The tide dome", boarding: 4 }, { id: "saltlight", name: "Saltlight Terminus", subtitle: "The village at the sea", position: [-330, -65, 160], heading: 0, color: "#f1b594", sky: ["#49b2f1", "#d0eefb"], story: "Fishing boats, whitewashed walls, and nowhere to hurry.", landmark: "The lighthouse by the sea", boarding: 4 }], Xh = ["mango", "gardens", "monsoon", "observatory", "saltlight"], Yh = ["mango", "gardens", "observatory", "monsoon", "saltlight"], Kh = ["mango", "gardens", "shrine", "observatory", "monsoon", "saltlight"], Zh = [...Xh, "shrine"], Jh = [], Qh = 5, eu = [], tu = [], nu = (e2) => Jh.findIndex((t2) => t2.id === e2), iu = (e2) => e2 >= 7 ? Kh : 6 === e2 ? Yh : Xh, ru = class extends Xa {
    constructor(e2, t2) {
      super(), this.points = e2, this.rise = t2, this.arcLengthDivisions = 1600;
    }
    getPoint(e2, t2 = new hn()) {
      const n2 = this.points.map((e3) => e3.clone());
      for (let t3 = 5; t3 > 0; t3--) for (let i2 = 0; i2 < t3; i2++) n2[i2].lerp(n2[i2 + 1], e2);
      return t2.copy(n2[0]), t2.y += this.rise * Math.sin(Math.PI * e2) ** 4, t2;
    }
  }, au = [734.364099, 54, -727.850806], hu(5);
} });
function Cu(e2, t2 = 0) {
  const n2 = du(e2.leg, e2.distance + t2), i2 = cu(n2.leg, n2.distance);
  return i2.sample = (n3) => Cu(e2, t2 + n3), i2;
}
var Pu, Iu, zu, Lu, Nu, Du = Ys({ "src/service/orchard-junction.js"() {
  Ru(), fu = 65, mu = 180, gu = 1 / 0, vu = () => ({ choice: "direct", locked: false, delivered: false, rewarded: false, preferencePaid: false, earned: 0 }), xu = () => false, bu = (e2) => e2.phase.startsWith("orchard-"), yu = () => false, wu = () => false, _u = () => null, Mu = (e2) => e2, Su = (e2) => e2, Tu = (e2, t2) => e2.distance + t2, Eu = () => ({ count: 0, bonus: 0, kind: "rushed" }), ku = () => 0, Au = () => 0;
} });
function Uu(e2) {
  Pu = e2, Nu();
}
async function Ou(e2, t2) {
  Zo.itemStart(e2);
  try {
    const n2 = await fetch(e2, { signal: AbortSignal.timeout(6e4) });
    if (!n2.ok) throw Error("Could not load " + e2);
    return await n2[t2]();
  } catch (t3) {
    throw Zo.itemError(e2), t3;
  } finally {
    Zo.itemEnd(e2);
  }
}
// ---- boarding timing
function u_(e2) {
  const t2 = new Set(e2.manifest.map((t3) => p_(e2, t3)));
  return Array.from({ length: mx(e2) }, (e3, t3) => t3).filter((e3) => !t2.has(e3));
}
function f_(e2, t2) {
  const n2 = e2.pendingBoarders.indexOf(t2), i2 = Yx(e2.leg, e2.circuits, mx(e2) > 12 && Sx(e2)).indexOf(t2), r2 = u_(e2)[n2], a2 = yx(r2, e2), o2 = r2 < 12 ? cf(e2) : null, s2 = r2 >= 12 ? ff(e2) : (null == o2 ? void 0 : o2.doorX) || 0, l2 = o2 ? 1.24 : 0.94, c2 = o2 ? o2.halfWidth - 0.12 : 1.25;
  if (n2 < 0 || !a2) return null;
  const d2 = [[-3 - 1.85 * i2, 0.13, 4.05], [s2, 0.13, 4.05], [s2, 0.13, 3], [s2, l2, c2], [s2, l2, 0], [a2[0], l2, 0], [a2[0], l2 + 0.04, a2[1]]];
  return { points: d2, start: 0.25, duration: c_(d2) / d_, index: r2 };
}
function m_(e2, t2) {
  const n2 = e2.pendingAlighters.indexOf(t2), i2 = p_(e2, t2), r2 = yx(i2, e2), a2 = i2 < 12 ? cf(e2) : null, o2 = i2 >= 12 ? ff(e2) : (null == a2 ? void 0 : a2.doorX) || 0, s2 = a2 ? 1.24 : 0.94, l2 = a2 ? a2.halfWidth - 0.12 : 1.25;
  if (n2 < 0 || !r2) return null;
  const c2 = (e3) => Math.abs(e3[1]) + Math.abs(e3[0] - o2) + 1.25, d2 = Math.max(...e2.pendingAlighters.filter((t3) => p_(e2, t3) >= 12 == i2 >= 12).map((t3) => c2(yx(p_(e2, t3), e2)))), p2 = 0.12 + 1.2 * e2.pendingAlighters.slice(0, n2).filter((t3) => p_(e2, t3) >= 12 == i2 >= 12).length + (d2 - c2(r2)) / d_, h2 = [[r2[0], s2 + 0.04, r2[1]], [r2[0], s2, 0], [o2, s2, 0], [o2, s2, l2], [o2, 0.13, 3], [o2, 0.13, 3.4], [3, 0.13, 3.4]];
  return { points: h2, start: p2, duration: c_(h2) / d_, index: n2 };
}
function g_(e2, t2) {
  const n2 = t2 ? e2.pendingBoarders : e2.pendingAlighters, i2 = !t2 && Ax(e2) ? Cx(e2) : null;
  return Math.max(t2 ? 0.6 : 0, i2 ? i2.start + i2.duration + 0.2 : 0, ...n2.map((n3) => {
    const i3 = t2 ? f_(e2, n3) : m_(e2, n3);
    return i3.start + i3.duration + 0.2;
  }));
}
function v_(e2, t2) {
// ---- economy.js (GM, WM)
var MM, SM, TM, EM, kM, AM, RM, CM, PM, IM, zM, LM, NM, DM, UM = Ys({ "src/service/economy.js"() {
  Rx(), Ru(), nb(), uM(), Xb(), J_ = 100, Q_ = 50, eM = 200, tM = 2.5, nM = (e2, t2, n2) => Math.max(t2, Math.min(n2, e2)), iM = (e2, t2 = 1e9) => Number.isFinite(e2) ? nM(e2, 0, t2) : 0, rM = (e2, t2 = 1e9) => Math.floor(iM(e2, t2)), aM = (e2) => Array.isArray(e2) ? [...new Set(e2.filter((e3) => Number.isInteger(e3) && e3 >= 0 && e3 < Jh.length))] : [], oM = (e2) => Object.values(e2).reduce((e3, t2) => e3 + t2, 0), sM = (e2) => ({ ...e2, frontiers: { ...e2.frontiers }, weights: { ...e2.weights } }), lM = (e2) => {
    var t2;
    return (null == (t2 = e2.journey) ? void 0 : t2.distance) ? nM(e2.journey.comfort / e2.journey.distance * 100, 0, 100) : 0;
  }, cM = (e2) => {
    var t2;
    return Math.round(Q_ * nM(oM((null == (t2 = e2.journey) ? void 0 : t2.weights) || {}) / mM(e2), 0, 2.7));
  }, dM = (e2) => 1 + Math.min(1, e2.economy.attempt.streak / eM), pM = (e2, t2 = 1) => ({ id: t2, status: "active", startStation: e2, lastStation: e2, legs: [], lanterns: 3, catches: 0, fares: 0, tips: 0, bonuses: 0, lost: 0, deliveries: 0, requests: 0, streak: 0, wobble: 0, peakMultiplier: 1, distance: 0, comfort: 0, fullLoad: 0, frontiers: {} }), hM = (e2) => e2 && ["complete", "failed"].includes(e2.status) ? { id: rM(e2.id), status: e2.status, grade: ["Bronze", "Silver", "Gold"].includes(e2.grade) ? e2.grade : null, station: rM(e2.station, Jh.length - 1), fares: rM(e2.fares), tips: rM(e2.tips), bonuses: rM(e2.bonuses), lost: rM(e2.lost), deliveries: rM(e2.deliveries), requests: rM(e2.requests), comfort: iM(e2.comfort, 100), lanterns: rM(e2.lanterns, 3), legs: rM(e2.legs, Jh.length) } : null;
} });
function OM(e2) {
  const t2 = PM();
  for (const n2 of ["driver", "garage", "difficulty", "timeOfDay", "camera", "muted", "score"]) t2[n2] = e2[n2];
  return t2.economy = { ...bM(e2.economy), attempt: { ...t2.economy.attempt, id: e2.economy.attempt.id + 1 }, leg: null, receipt: null }, t2;
}
function FM(e2) {
  var t2, n2, i2;
  const r2 = PM(), a2 = e2 && "object" == typeof e2 ? e2 : {};
  if (!a2.service || "object" != typeof a2.service) {
    const e3 = Number(a2.trainX) || -5, t3 = [-5, 135, 265, 395, 525];
    return r2.leg = nu(Xh[t3.reduce((n3, i3, r3) => Math.abs(i3 - e3) < Math.abs(t3[n3] - e3) ? r3 : n3, 0)]), r2.muted = !!a2.muted, r2.economy = vM(r2.leg), r2;
  }
  const o2 = uu(a2.service, Qh);
  r2.garage = (function(e3) {
    var t3, n3, i3, r3;
    const a3 = Fw();
    if (!e3 || "object" != typeof e3) return a3;
    a3.skins = { ...Fh(e3.skins), towns: [...new Set(Array.isArray(null == (t3 = e3.skins) ? void 0 : t3.towns) ? e3.skins.towns.filter((e4) => ["mango", "gardens", "observatory", "monsoon", "saltlight", "shrine"].includes(e4)) : [])].slice(0, 2), seen: true === (null == (n3 = e3.skins) ? void 0 : n3.seen) }, a3.model = Eh(e3.model).id, a3.workshop = (function(e4) {
      const t4 = cw();
      return e4 && "object" == typeof e4 ? (t4.owned = [.../* @__PURE__ */ new Set([...t4.owned, ...Array.isArray(e4.owned) ? e4.owned.filter((e5) => "string" == typeof e5 && lw(e5) && !e5.startsWith("fitting:")) : []])], t4.wishlist = Array.isArray(e4.wishlist) ? [...new Set(e4.wishlist.filter((e5) => "string" == typeof e5 && lw(e5)))].slice(0, 3) : [], t4.seatFabrics = Array.from({ length: 16 }, (t5, n4) => Fb.some((t6) => {
        var i4;
        return "interior" === t6.slot && t6.id === (null == (i4 = e4.seatFabrics) ? void 0 : i4[n4]);
      }) ? e4.seatFabrics[n4] : null), t4.seatFabrics.some(Boolean) || (t4.seatFabrics = []), t4.artisans = Array.isArray(e4.artisans) ? [...new Set(e4.artisans.filter((e5) => ["mango", "gardens", "observatory", "monsoon", "saltlight", "shrine"].includes(e5)))] : [], ux.some((t5) => t5.id === e4.rear) && t4.owned.includes("rear:" + e4.rear) && (t4.rear = e4.rear), t4.project = e4.project && lw(e4.project.key) && t4.owned.includes(e4.project.key) ? { key: e4.project.key, stage: ["unclamp", "remove", "align", "lower"].includes(e4.project.stage) ? e4.project.stage : "unclamp" } : null, t4.blueprints = Array.isArray(e4.blueprints) ? e4.blueprints.slice(0, 3).map((e5) => e5 && Th.some((t5) => t5.id === e5.model) && e5.equipped && "object" == typeof e5.equipped ? { name: String(e5.name || "").replace(/[<>&"']/g, "").slice(0, 24), seatFabrics: Array.from({ length: 16 }, (t5, n4) => Fb.some((t6) => {
        var i4;
        return "interior" === t6.slot && t6.id === (null == (i4 = e5.seatFabrics) ? void 0 : i4[n4]);
      }) ? e5.seatFabrics[n4] : null), model: e5.model, rear: ux.some((t5) => t5.id === e5.rear) ? e5.rear : "none", canopy: nw.some((t5) => t5.id === e5.canopy) ? e5.canopy : null, chassis: iw.some((t5) => t5.id === e5.chassis) ? e5.chassis : "standard", equipped: Object.fromEntries(Object.entries(e5.equipped).filter(([e6, t5]) => Fb.some((n4) => n4.id === t5 && n4.slot === e6))) } : null) : [], nw.some((t5) => t5.id === e4.canopy) && t4.owned.includes("canopy:" + e4.canopy) && (t4.canopy = e4.canopy), iw.some((t5) => t5.id === e4.chassis) && t4.owned.includes("chassis:" + e4.chassis) && (t4.chassis = e4.chassis), t4.deliveries = [...new Set(Array.isArray(e4.deliveries) ? e4.deliveries.filter((e5) => "string" == typeof e5 && lw(e5)) : [])].slice(0, 24), t4.discoveries = Array.isArray(e4.discoveries) ? [...new Set(e4.discoveries.filter((e5) => ["windvane", "founders-bell", "cat", "market-letter"].includes(e5)))] : [], t4.commissions = Array.isArray(e4.commissions) ? [...new Set(e4.commissions.filter((e5) => ["first-fit", "garden-carriage", "coastal-mail", "market-letter"].includes(e5)))] : [], t4) : t4;
    })(e3.workshop), a3.workshop.owned = a3.workshop.owned.filter((e4) => !of.some((t4) => e4 === "body:" + t4)), df(a3) && a3.workshop.owned.push(...of.map((e4) => "body:" + e4)), Bh(a3), _x(a3, a3.model) || (a3.model = "hearthwing"), lf(a3.model) && (a3.workshop.canopy = null);
    for (const t4 in a3.upgrades) a3.upgrades[t4] = Number.isFinite(null == (i3 = e3.upgrades) ? void 0 : i3[t4]) ? Math.floor(Bw(e3.upgrades[t4], 0, 3)) : 0;
    for (const t4 in a3.condition) Number.isFinite(null == (r3 = e3.condition) ? void 0 : r3[t4]) && (a3.condition[t4] = Bw(e3.condition[t4], 30, 100));
    return a3.kilometers = Number.isFinite(e3.kilometers) ? Bw(e3.kilometers, 0, 1e7) : 0, a3.jobs = Number.isFinite(e3.jobs) ? Math.floor(Bw(e3.jobs, 0, 1e6)) : 0, a3.history = Array.isArray(e3.history) ? e3.history.filter((e4) => e4 && "string" == typeof e4.title && e4.title.length < 100 && Number.isFinite(e4.at) && Number.isFinite(e4.cost)).slice(0, 8).map((e4) => ({ title: e4.title, at: Math.max(0, e4.at), cost: Math.max(0, e4.cost) })) : [], a3;
  })(o2.garage), r2.driver = hx(o2.driver || { name: null == (t2 = a2.travelPass) ? void 0 : t2.name });
  const s2 = mx(r2);
  r2.cargo = o2.cargo && o2.cargo.id && Number.isInteger(o2.cargo.destination) && o2.cargo.destination >= 0 && o2.cargo.destination < Jh.length ? { id: String(o2.cargo.id).slice(0, 80), destination: o2.cargo.destination } : null, r2.difficulty = F_(o2.difficulty), r2.timeOfDay = MM(o2.timeOfDay);
  for (const e3 of ["leg", "distance", "passengers", "circuits", "served", "played", "score", "catches"]) Number.isFinite(o2[e3]) && (r2[e3] = Math.max(0, o2[e3]));
  var l2, c2, d2, p2;
  r2.leg = zM(Math.floor(r2.leg), 0, Jh.length - 1), r2.circuits = Math.floor(r2.circuits), r2.served = Math.floor(r2.served), o2.routeRevision !== Qh && (r2.distance = r2.distance / (IM[o2.routeRevision] || IM[1])[r2.leg] * tu[r2.leg].length), r2.distance = zM(r2.distance, 0, tu[r2.leg].length), r2.orchard = (l2 = o2.orchard, { ...vu(), locked: true === (null == l2 ? void 0 : l2.locked), delivered: true === (null == l2 ? void 0 : l2.delivered), rewarded: true === (null == l2 ? void 0 : l2.rewarded), preferencePaid: true === (null == l2 ? void 0 : l2.preferencePaid), earned: Number.isFinite(null == l2 ? void 0 : l2.earned) ? Math.max(0, Math.min(660, l2.earned)) : 0 }), 0 === r2.leg && r2.distance >= fu && (r2.orchard.locked = true), r2.visits = NM(o2.visits), r2.lapStops = NM(o2.lapStops), r2.lapStops.length || (r2.lapStops = [r2.leg]), r2.zoroAt = Number.isFinite(o2.zoroAt) && o2.zoroAt >= 0 ? zM(o2.zoroAt, 0, r2.played) : r2.visits.includes(1) ? Math.max(0, r2.played - 30) : null, r2.camera = ["follow", "cab", "window", "panorama"].includes(o2.camera) ? o2.camera : "follow", r2.muted = !!o2.muted, r2.claimedRides = LM(o2.claimedRides), r2.deliveredRides = LM(o2.deliveredRides), r2.delivered = r2.deliveredRides.length, r2.comfort = Number.isFinite(o2.comfort) ? zM(o2.comfort, 0, 100) : 100, r2.manifest = Array.isArray(o2.manifest) && o2.manifest.length ? LM(o2.manifest).filter(jx).slice(0, s2) : (c2 = zM(Math.floor(r2.passengers), 0, s2), d2 = r2.leg, p2 = o2.phase, [.../* @__PURE__ */ new Set([...Array.from({ length: Math.min(Jh.length, d2 + ("ready" === p2 || "enroute" === p2 ? 1 : 0)) }, (e3, t3) => t3), ...Jh.map((e3, t3) => t3)])].flatMap((e3) => Yx(e3)).slice(0, c2));
  const h2 = /* @__PURE__ */ new Set();
  r2.trips = r2.manifest.map((e3) => {
    const t3 = Array.isArray(o2.trips) ? o2.trips.find((t4) => (null == t4 ? void 0 : t4.id) === e3) : null, n3 = t3 && Number.isInteger(t3.seat) && t3.seat >= 0 && t3.seat < s2 && !h2.has(t3.seat) ? t3.seat : Array.from({ length: s2 }, (e4, t4) => t4).find((e4) => !h2.has(e4));
    h2.add(n3);
    const i3 = t3 && Number.isInteger(t3.origin) && t3.origin >= 0 && t3.origin < Jh.length ? t3.origin : jx(e3).town, a3 = t3 && Number.isInteger(t3.destination) && t3.destination >= 0 && t3.destination < Jh.length ? t3.destination : $x(e3), l3 = gM(null == t3 ? void 0 : t3.journey);
    if (!(null == t3 ? void 0 : t3.journey)) {
      for (let e4 = i3, t4 = 0; t4 < Jh.length && e4 !== r2.leg && e4 !== a3; t4++, e4 = (e4 + 1) % Jh.length) l3.frontiers[e4] = tu[e4].length;
      r2.distance > 0 && (l3.frontiers[r2.leg] = r2.distance);
    }
    return { id: e3, seat: n3, ride: t3 && "string" == typeof t3.ride && t3.ride.length < 100 ? t3.ride : `legacy:${r2.circuits}:${e3}`, origin: i3, destination: a3, journey: l3, fareDistance: Number.isFinite(null == t3 ? void 0 : t3.fareDistance) ? Math.max(1, t3.fareDistance) : mM({ origin: i3, destination: a3 }) };
  }).filter((e3) => !r2.deliveredRides.includes(e3.ride)), r2.manifest = r2.trips.map((e3) => e3.id), r2.passengers = r2.manifest.length;
  for (const e3 of r2.deliveredRides) {
    const t3 = e3.split(":").slice(-1)[0];
    jx(t3) && (r2.arrivals[t3] = { town: $x(t3), circuit: Number(e3.split(":")[0]) || 0, at: 0, exit: 0 });
  }
  for (const [e3, t3] of Object.entries(o2.arrivals || {})) jx(e3) && t3 && Number.isInteger(t3.town) && t3.town >= 0 && t3.town < Jh.length && (r2.arrivals[e3] = { town: t3.town, circuit: Number.isFinite(t3.circuit) ? Math.max(0, Math.floor(t3.circuit)) : 0, at: Number.isFinite(t3.at) ? zM(t3.at, 0, r2.played) : 0, exit: Number.isInteger(t3.exit) ? zM(t3.exit, 0, 15) : 0 });
  if (r2.phase = r2.distance > 0.01 ? "enroute" : "ready" === o2.phase ? "ready" : "docked", "ready" === r2.phase && (r2.door = 1, r2.steps = 1), r2.distance <= 0.01 && Number.isFinite(o2.phaseTime) && Array.isArray(o2.pendingBoarders) && Array.isArray(o2.pendingAlighters) && ["opening", "deploying", "alighting", "boarding", "retracting", "closing"].includes(o2.phase)) {
    r2.phase = o2.phase, r2.phaseTime = Number.isFinite(o2.phaseTime) ? zM(o2.phaseTime, 0, 60) : 0, r2.boardingTime = r2.phaseTime, r2.pendingAlighters = LM(o2.pendingAlighters).filter((e4) => r2.trips.some((t3) => t3.id === e4 && t3.destination === r2.leg));
    const e3 = Kx(r2);
    r2.pendingBoarders = LM(o2.pendingBoarders).filter((t3) => e3.includes(t3)).slice(0, s2 - r2.manifest.length), r2.door = ["opening"].includes(r2.phase) ? zM(r2.phaseTime, 0, 1) : "closing" === r2.phase ? 1 - zM(r2.phaseTime, 0, 1) : 1, r2.steps = "opening" === r2.phase || "closing" === r2.phase ? 0 : "deploying" === r2.phase ? zM(r2.phaseTime / 1.2, 0, 1) : "retracting" === r2.phase ? 1 - zM(r2.phaseTime / 1.3, 0, 1) : 1;
  }
  return xu(r2) && Math.abs(Mu(r2.distance) - gu) < 1 && ["orchard-docked", "orchard-opening", "orchard-ready", "orchard-closing"].includes(o2.phase) && (r2.phase = "orchard-closing" === o2.phase ? "orchard-ready" : o2.phase, r2.phaseTime = Number.isFinite(o2.phaseTime) ? zM(o2.phaseTime, 0, 6) : 0, r2.door = r2.steps = "orchard-ready" === r2.phase ? 1 : 0), Number.isFinite(null == (i2 = null == (n2 = o2.garage) ? void 0 : n2.skins) ? void 0 : i2.passengers) || (r2.garage.skins.passengers = r2.delivered, r2.garage.skins.deliveries = Math.max(r2.garage.skins.towns.length, new Set(Object.values(r2.arrivals).map((e3) => e3.circuit + ":" + e3.town)).size)), Bh(r2.garage, r2.score), r2.economy = (function(e3, t3) {
    var n3, i3, r3;
    const a3 = vM(t3.leg, rM(t3.score));
    if (!e3 || 1 !== e3.version) return t3.distance > 0 && (a3.attempt.frontiers[t3.leg] = t3.distance), a3;
    a3.wallet = rM(e3.wallet), a3.owned = [.../* @__PURE__ */ new Set([...a3.owned, ...Array.isArray(e3.owned) ? e3.owned.filter(Vb) : []])];
    for (const t4 of Object.keys(a3.equipped)) {
      const r4 = null == (n3 = e3.equipped) ? void 0 : n3[t4];
      a3.owned.includes(r4) && (null == (i3 = Vb(r4)) ? void 0 : i3.slot) === t4 && (a3.equipped[t4] = r4);
    }
    a3.achievements = Array.isArray(e3.achievements) ? [...new Set(e3.achievements.filter(Gb))] : [], a3.completed = rM(e3.completed), a3.bestGrade = ["Bronze", "Silver", "Gold"].includes(e3.bestGrade) ? e3.bestGrade : null;
    const o3 = e3.attempt || {};
    for (const e4 of ["id", "fares", "tips", "bonuses", "lost", "deliveries", "requests"]) a3.attempt[e4] = rM(o3[e4]);
    for (const e4 of ["distance", "comfort", "fullLoad"]) a3.attempt[e4] = iM(o3[e4], 1e4);
    if (a3.attempt.id = Math.max(1, a3.attempt.id), a3.attempt.status = ["complete", "failed"].includes(o3.status) ? o3.status : "active", a3.attempt.startStation = rM(o3.startStation, Jh.length - 1), a3.attempt.lastStation = rM(o3.lastStation, Jh.length - 1), a3.attempt.legs = aM(o3.legs), a3.attempt.lanterns = Number.isFinite(o3.lanterns) ? rM(o3.lanterns, 3) : 3, a3.attempt.catches = 3 - a3.attempt.lanterns, a3.attempt.streak = iM(o3.streak, eM), a3.attempt.wobble = iM(o3.wobble, 10), a3.attempt.peakMultiplier = nM(Number(o3.peakMultiplier) || 1, 1, 2), a3.attempt.frontiers = fM(o3.frontiers), e3.leg && Number.isInteger(e3.leg.origin) && e3.leg.origin >= 0 && e3.leg.origin < Jh.length) {
      const t4 = e3.leg;
      a3.leg = { origin: t4.origin, departed: !!t4.departed, arrived: !!t4.arrived, settled: !!t4.settled, elapsed: iM(t4.elapsed, 1e6), distance: iM(t4.distance, 1e4), comfort: iM(t4.comfort, 1e4), catches: rM(t4.catches), lost: rM(t4.lost), request: xM(t4.request) };
    }
    var s3;
    if (a3.receipt = (s3 = e3.receipt) && Number.isInteger(s3.id) ? { id: rM(s3.id), station: rM(s3.station, Jh.length - 1), fares: rM(s3.fares), tips: rM(s3.tips), bonuses: rM(s3.bonuses), lost: rM(s3.lost), seen: !!s3.seen, driving: rM(s3.driving, 115), routeBonus: rM(s3.routeBonus, 660), request: xM(s3.request), deliveries: Array.isArray(s3.deliveries) ? s3.deliveries.filter((e4) => jx(e4.id)).slice(0, 16).map((e4) => ({ id: e4.id, tip: rM(e4.tip, 135), comfort: iM(e4.comfort, 100) })) : [] } : null, a3.receiptSequence = Math.max(rM(e3.receiptSequence), (null == (r3 = a3.receipt) ? void 0 : r3.id) || 0), a3.lastResult = hM(e3.lastResult), "active" !== a3.attempt.status && (!a3.lastResult || a3.lastResult.id !== a3.attempt.id)) {
      const e4 = a3.attempt;
      a3.lastResult = hM({ ...e4, station: e4.lastStation, grade: "complete" === e4.status ? "Bronze" : null, comfort: e4.distance ? e4.comfort / e4.distance * 100 : 0, legs: e4.legs.length });
    }
    return a3;
  })(o2.economy, r2), r2.driving = (function(e3) {
    var t3;
    const n3 = Ku();
    if (!e3) return n3;
    n3.claims = Array.isArray(e3.claims) ? [...new Set(e3.claims.filter((e4) => "string" == typeof e4 && /^[a-z0-9:]+$/.test(e4)))].slice(0, 40) : [], n3.charge = Number.isFinite(e3.charge) ? Xu(e3.charge, 0, 1) : 0, n3.earned = Number.isFinite(e3.earned) ? Xu(e3.earned, 0, 1e4) : 0;
    for (let i3 = 0; i3 < Jh.length; i3++) Number.isFinite(null == (t3 = e3.legEarned) ? void 0 : t3[i3]) && (n3.legEarned[i3] = Xu(e3.legEarned[i3], 0, 115));
    return n3.seq = Number.isFinite(e3.seq) ? Xu(e3.seq, 0, 1e4) : 0, n3;
  })(o2.driving), r2.garage.workshop.seatFabrics = r2.garage.workshop.seatFabrics.map((e3) => r2.economy.owned.includes(e3) ? e3 : null), "failed" === r2.economy.attempt.status && (r2.leg = r2.economy.attempt.lastStation, r2.distance = 0, r2.phase = "ended", r2.door = 0, r2.steps = 0), "ready" === r2.phase && wM(r2), "enroute" !== r2.phase || r2.economy.leg || (wM(r2), _M(r2)), r2;
}
function BM(e2, t2) {
  e2.phase = t2, e2.phaseTime = 0, e2.boardingTime = 0;
}
function HM(e2) {
  return xu(e2) && e2.distance > fu && e2.distance < tu[0].length - 65 ? null : e2.distance <= 7 ? e2.leg : tu[e2.leg].length - e2.distance <= 7 ? (e2.leg + 1) % Jh.length : null;
}
function VM(e2, t2, n2 = false) {
  n2 && 0 === e2.leg && ku(e2), (function(e3, t3, n3, i2) {
    const r2 = e3.economy, a2 = r2.attempt;
    a2.lastStation = n3;
    const o2 = r2.leg;
    if (!i2 || !(null == o2 ? void 0 : o2.departed) || o2.arrived || o2.origin !== t3 || n3 !== (t3 + 1) % Jh.length || "active" !== a2.status) return;
    o2.arrived = true, a2.legs.includes(t3) || a2.legs.push(t3);
    const s2 = o2.request;
    if ("accepted" === (null == s2 ? void 0 : s2.status)) {
      const e4 = o2.distance ? o2.comfort / o2.distance * 100 : 0;
      s2.status = o2.distance >= 0.9 * tu[t3].length && ("connection" === s2.kind ? o2.elapsed <= s2.limit : e4 >= ("cargo" === s2.kind ? 80 : 85) && 0 === o2.catches) ? "success" : "failed";
    }
  })(e2, e2.leg, t2, n2), n2 && 0 === t2 && (e2.orchard = { ...vu(), rewarded: e2.orchard.rewarded, preferencePaid: e2.orchard.preferencePaid, earned: e2.orchard.earned }), n2 && (0 === t2 && e2.lapStops.length === Jh.length && (e2.circuits++, e2.lapStops = []), e2.lapStops.includes(t2) || e2.lapStops.push(t2)), e2.leg = t2, e2.distance = 0, e2.speed = 0, e2.roll = 0, e2.rollVelocity = 0, e2.criticalTime = 0, e2.reverseHold = 0, BM(e2, "docked");
}
function GM(e2, t2, n2, i2) {
  var r2;
  const a2 = DM(e2);
  if ("junction" === t2) return yu(a2) && ["direct", "orchard"].includes(n2) && (a2.orchard.choice = n2), a2;
  if (bu(a2) && ("doors" === t2 && "orchard-docked" === a2.phase && BM(a2, "orchard-opening"), "depart" === t2 && "orchard-ready" === a2.phase && BM(a2, "orchard-closing"), "doors" === t2 || "depart" === t2)) return a2;
  if ("skin-seen" === t2) return Hh(a2.garage), a2;
  if ("skin-equip" === t2) return pf(a2) && Eh(n2).id === n2 && _x(a2.garage, n2) && (n2 !== a2.garage.model && (a2.economy.equipped = { ...a2.economy.equipped, body: "body-factory", roof: "roof-factory" }), a2.garage.model = n2, a2.garage.workshop.canopy = null, Hh(a2.garage)), a2;
  if ("belonging" === t2) return (function(e3, t3) {
    const n3 = Lf.find((e4) => e4.id === t3);
    if (!n3 || !zf(e3)) return false;
    const i3 = Nf(e3.driver);
    if (!i3.includes(t3)) {
      if (e3.economy.wallet < n3.price) return false;
      e3.economy.wallet -= n3.price, i3.push(t3);
    }
    e3.driver = { ...e3.driver, belongings: i3, accessory: e3.driver.accessory === t3 ? null : t3 };
  })(a2, n2), a2;
  if ("town-letter" === t2 && zf(a2)) {
    const e3 = a2.garage.workshop;
    return "collect" !== n2 || e3.discoveries.includes("market-letter") || e3.discoveries.push("market-letter"), "deliver" === n2 && e3.discoveries.includes("market-letter") && !e3.commissions.includes("market-letter") && (e3.commissions.push("market-letter"), a2.economy.wallet += 45), a2;
  }
  if ("driver-profile" === t2) return Vw(a2, i2) && (a2.driver = hx({ ...a2.driver, ...n2 })), a2;
  if (t2.startsWith("town-")) {
    if (!(Vw(a2, i2) || ["town-buy", "town-artisan"].includes(t2) && zf(a2))) return a2;
    if ("town-wishlist" === t2 && lw(n2)) {
      const e3 = a2.garage.workshop;
      e3.wishlist = e3.wishlist.includes(n2) ? e3.wishlist.filter((e4) => e4 !== n2) : [n2, ...e3.wishlist].slice(0, 3);
    }
    if ("town-seat" === t2) {
      const e3 = Vb(null == n2 ? void 0 : n2.fabric);
      Number.isInteger(null == n2 ? void 0 : n2.seat) && n2.seat >= 0 && n2.seat < mx(a2) && "interior" === (null == e3 ? void 0 : e3.slot) && a2.economy.owned.includes(e3.id) && (a2.garage.workshop.seatFabrics[n2.seat] = e3.id);
    }
    if ("town-artisan" === t2 && ["mango", "gardens", "observatory", "monsoon", "saltlight", "shrine"].includes(n2) && !a2.garage.workshop.artisans.includes(n2) && a2.garage.workshop.artisans.push(n2), "town-project" === t2 && (a2.garage.workshop.project = n2 && lw(n2.key) && a2.garage.workshop.owned.includes(n2.key) ? { key: n2.key, stage: ["unclamp", "remove", "align", "lower"].includes(n2.stage) ? n2.stage : "unclamp" } : null), "town-blueprint" === t2) {
      const e3 = Math.max(0, Math.min(2, Number((null == n2 ? void 0 : n2.slot) ?? n2) || 0));
      a2.garage.workshop.blueprints[e3] = { ...Mx(a2), name: String((null == n2 ? void 0 : n2.name) || "").replace(/[<>&"']/g, "").slice(0, 24) };
    }
    if ("town-restore" === t2) {
      const e3 = a2.garage.workshop.blueprints[Number(n2)];
      if (e3 && _x(a2.garage, e3.model) && kx(a2, e3.rear)) {
        a2.garage.model = e3.model, e3.canopy && !lf(e3.model) || (a2.garage.workshop.canopy = null);
        for (const t3 of ["rear", "canopy", "chassis"]) {
          const n3 = e3[t3];
          n3 && fw(a2, t3 + ":" + n3);
        }
        for (const t3 of Object.values(e3.equipped)) a2.economy.owned.includes(t3) && fw(a2, "fitting:" + t3);
        a2.garage.workshop.seatFabrics = (e3.seatFabrics || []).map((e4) => a2.economy.owned.includes(e4) ? e4 : null), jw(a2.garage, "Restored saved build", 0, a2.played);
      }
    }
    if ("town-buy" === t2 && (function(e3, t3) {
      const n3 = lw(t3), i3 = e3.garage.workshop;
      return !(!n3 || "body" === n3.type && sf(n3.id) || pw(e3, t3) || e3.economy.wallet < n3.price || (e3.economy.wallet -= n3.price, ("fitting" === n3.type ? e3.economy.owned : i3.owned).push("fitting" === n3.type ? n3.id : t3), i3.deliveries.includes(t3) || i3.deliveries.push(t3), 0));
    })(a2, n2) && jw(a2.garage, "Purchased " + lw(n2).name, lw(n2).price, a2.played), "town-fit" === t2 && fw(a2, n2) && jw(a2.garage, "Fitted " + lw(n2).name, 0, a2.played), "town-discover" === t2 && ["windvane", "founders-bell", "cat"].includes(n2) && !a2.garage.workshop.discoveries.includes(n2) && a2.garage.workshop.discoveries.push(n2), "town-commission" === t2) {
      const e3 = hw.find((e4) => e4.id === n2);
      e3 && e3.test(a2) && !a2.garage.workshop.commissions.includes(e3.id) && (a2.garage.workshop.commissions.push(e3.id), a2.economy.wallet += e3.bonus, jw(a2.garage, e3.name + " completed", 0, a2.played));
    }
    return a2;
  }
  if ("garage-upgrade" === t2) return (function(e3, t3, n3) {
    if (!Vw(e3, n3)) return false;
    const i3 = Uw.find((e4) => e4.id === t3), r3 = e3.garage;
    if (!i3 || r3.upgrades[t3] >= 3) return false;
    const a3 = i3.prices[r3.upgrades[t3]];
    e3.economy.wallet < a3 || (e3.economy.wallet -= a3, r3.upgrades[t3]++, r3.condition[t3] = 100, jw(r3, `${i3.name} \xB7 level ${r3.upgrades[t3]}`, a3, e3.played));
  })(a2, n2, i2), a2;
  if ("garage-service" === t2) return (function(e3, t3, n3) {
    if (!Vw(e3, n3)) return false;
    const i3 = Ow.find((e4) => e4.id === t3);
    !i3 || e3.garage.condition[i3.condition] >= 99.95 || e3.economy.wallet < i3.price || (e3.economy.wallet -= i3.price, e3.garage.condition[i3.condition] = 100, e3.garage.jobs++, jw(e3.garage, i3.name, i3.price, e3.played));
  })(a2, n2, i2), a2;
  if ("garage-fit" === t2) {
    if (!Vw(a2, i2) || !n2 || Eh(n2.model).id !== n2.model || !_x(a2.garage, n2.model)) return a2;
    const e3 = { ...a2.economy.equipped }, t3 = [];
    for (const i3 of Object.keys(e3)) {
      const o3 = null == (r2 = n2.equipped) ? void 0 : r2[i3], s2 = Vb(o3);
      if (!s2 || s2.slot !== i3 || o3 !== e3[i3] && !uf(n2.model, i3)) return a2;
      e3[i3] = o3, a2.economy.owned.includes(o3) || t3.push(s2);
    }
    const o2 = t3.reduce((e4, t4) => e4 + t4.price, 0);
    return a2.economy.wallet < o2 || (a2.economy.wallet -= o2, a2.economy.owned.push(...t3.map((e4) => e4.id)), a2.economy.equipped = e3, a2.garage.model !== n2.model && (a2.garage.workshop.canopy = null), a2.garage.model = n2.model, jw(a2.garage, `${Eh(n2.model).name} \xB7 fitted`, o2, a2.played)), a2;
  }
  if ("time-of-day" === t2) return a2.timeOfDay = MM(n2), a2;
  if ("difficulty" === t2) return a2.difficulty = F_(n2), a2;
  if ("request-accept" === t2 || "request-decline" === t2) return (function(e3, t3) {
    var n3;
    const i3 = null == (n3 = e3.economy.leg) ? void 0 : n3.request;
    "ready" !== e3.phase || e3.economy.leg.departed || "offered" !== (null == i3 ? void 0 : i3.status) || (i3.status = t3 ? "accepted" : "declined", t3 && "cargo" === i3.kind && (e3.cargo = { id: `mail:${e3.economy.attempt.id}:${e3.leg}`, destination: (e3.leg + 1) % Jh.length }));
  })(a2, "request-accept" === t2), a2;
  if ("buy-reward" === t2) return (function(e3, t3) {
    const n3 = Vb(t3);
    if (!n3) return false;
    const i3 = e3.economy;
    if (!i3.owned.includes(t3)) {
      if (i3.wallet < n3.price) return false;
      i3.wallet -= n3.price, i3.owned.push(t3);
    }
    i3.equipped[n3.slot] = t3;
  })(a2, n2), a2;
  if ("read-receipt" === t2) return a2.economy.receipt && (a2.economy.receipt.seen = true), a2;
  if ("new-service" === t2) return "active" === a2.economy.attempt.status ? a2 : OM(a2);
  if ("wing-boost" === t2) return (function(e3) {
    tf(e3) && (e3.driving.charge = 0, e3.driving.boost = 5, nf(e3, "boost", "Wings open \xB7 auto-stabilizing for 5s"));
  })(a2), a2;
  if ("active" !== a2.economy.attempt.status) return a2;
  if ("doors" === t2 && "enroute" === a2.phase && Math.abs(a2.speed) < 0.25) {
    const e3 = HM(a2);
    null !== e3 && VM(a2, e3, e3 !== a2.leg);
  }
  return "doors" === t2 && "docked" === a2.phase ? (a2.pendingAlighters = a2.trips.filter((e3) => e3.destination === a2.leg).map((e3) => e3.id), BM(a2, "opening")) : "depart" === t2 && "ready" === a2.phase && (_M(a2), BM(a2, "retracting"), a2.speed = 0), a2;
}
function WM(e2, t2, { accelerate: n2 = false, brake: i2 = false, reverse: r2 = false, left: a2 = false, right: o2 = false, cruisePace: s2 = null } = {}) {
  var l2, c2;
  const d2 = ["docked", "ready", "ended"].includes(e2.phase) ? { ...e2 } : DM(e2);
  if (t2 = zM(t2, 0, 0.1), d2.score > (d2.garage.skins.earned || 0) && (d2.garage = Hw(d2.garage), Bh(d2.garage, d2.score)), d2.played += t2, d2.phaseTime += t2, d2.cruise = false, ("enroute" === d2.phase || "recovery" === d2.phase || bu(d2)) && (function(e3, t3) {
    var n3;
    const i3 = e3.economy.leg;
    (null == i3 ? void 0 : i3.departed) && !i3.arrived && "active" === e3.economy.attempt.status && (i3.elapsed += t3, "accepted" === (null == (n3 = i3.request) ? void 0 : n3.status) && "connection" === i3.request.kind && i3.elapsed > i3.request.limit && (i3.request.status = "failed"));
  })(d2, t2), bu(d2)) return d2.speed = 0, d2.roll *= Math.exp(4 * -t2), d2.rollVelocity = 0, d2.rearRoll *= Math.exp(4 * -t2), d2.rearVelocity = 0, "orchard-opening" === d2.phase && (d2.door = d2.steps = zM(d2.phaseTime / 1.2, 0, 1), d2.phaseTime >= 5.2 && (Au(d2), BM(d2, "orchard-ready"))), "orchard-closing" === d2.phase && (d2.door = d2.steps = 1 - zM(d2.phaseTime / 2.3, 0, 1), d2.phaseTime >= 2.3 && (d2.door = d2.steps = 0, BM(d2, "enroute"))), d2;
  if ("enroute" !== d2.phase) {
    if ((d2.driving.boost || d2.driving.near || d2.driving.bold) && (d2.driving = { ...d2.driving, boost: 0, near: null, bold: false, boldMeters: 0 }), d2.speed = 0, d2.roll *= Math.exp(4 * -t2), d2.rollVelocity = 0, d2.rearRoll = (d2.rearRoll || 0) * Math.exp(4 * -t2), d2.rearVelocity = 0, d2.trim *= Math.exp(4 * -t2), "opening" === d2.phase) d2.door = zM(d2.phaseTime, 0, 1), d2.phaseTime >= 1 && (d2.door = 1, BM(d2, "deploying"));
    else if ("deploying" === d2.phase) d2.steps = zM(d2.phaseTime / 1.2, 0, 1), d2.phaseTime >= 1.2 && (d2.steps = 1, BM(d2, "alighting"));
    else if ("alighting" === d2.phase) d2.boardingTime = d2.phaseTime, d2.phaseTime >= g_(d2, false) && (function(e3) {
      if (Ax(e3)) {
        const t4 = Cx(e3);
        e3.zoroAt = e3.played - Math.max(0, e3.boardingTime - t4.start - t4.duration);
      }
      const t3 = e3.trips.filter((t4) => e3.pendingAlighters.includes(t4.id) && !e3.deliveredRides.includes(t4.ride));
      !(function(e4, t4) {
        var n3, i3, r3, a3;
        const o3 = e4.economy, s3 = o3.leg, l3 = t4.map((e5) => ({ id: e5.id, tip: cM(e5), comfort: lM(e5) })), c3 = l3.length * J_, d3 = l3.reduce((e5, t5) => e5 + t5.tip, 0);
        let p3 = 0;
        (null == s3 ? void 0 : s3.arrived) && !s3.settled && "success" === (null == (n3 = s3.request) ? void 0 : n3.status) && (p3 = s3.request.bonus, o3.attempt.requests++, yM(e4, "steady" === s3.request.kind ? "green-thumb" : "on-time")), (function(e5, t5, n4, i4) {
          const r4 = t5 + n4 + i4;
          e5.score += r4, e5.economy.wallet += r4;
          const a4 = e5.economy.attempt;
          a4.fares += t5, a4.tips += n4, a4.bonuses += i4;
        })(e4, c3, d3, p3), o3.attempt.deliveries += l3.length, (l3.length || (null == s3 ? void 0 : s3.arrived) && !s3.settled) && (o3.receipt = { id: ++o3.receiptSequence, station: e4.leg, fares: c3, tips: d3, bonuses: p3, routeBonus: (null == s3 ? void 0 : s3.arrived) && !s3.settled && 0 === s3.origin && (null == (i3 = e4.orchard) ? void 0 : i3.earned) || 0, driving: (null == s3 ? void 0 : s3.arrived) && !s3.settled && (null == (r3 = e4.driving) ? void 0 : r3.legEarned[s3.origin]) || 0, lost: s3 && !s3.settled ? s3.lost : 0, deliveries: l3, seen: false, request: (null == s3 ? void 0 : s3.arrived) && s3.request ? { ...s3.request } : null }), (null == s3 ? void 0 : s3.arrived) && (s3.settled = true, (null == (a3 = e4.cargo) ? void 0 : a3.destination) === e4.leg && (e4.cargo = null));
      })(e3, t3), t3.length && (function(e4, t4, n3 = 0, i3 = 0) {
        !e4.skins.towns.includes(t4) && e4.skins.towns.length < 2 && e4.skins.towns.push(t4), n3 > 0 && (e4.skins.deliveries = (e4.skins.deliveries || 0) + 1, e4.skins.passengers = (e4.skins.passengers || 0) + n3), Bh(e4, i3);
      })(e3.garage, Jh[e3.leg].id, t3.length, e3.score);
      for (const n3 of t3) e3.deliveredRides.includes(n3.ride) || (e3.deliveredRides.push(n3.ride), e3.arrivals[n3.id] = { town: e3.leg, circuit: e3.circuits, at: b_(e3, n3.id), exit: e3.pendingAlighters.indexOf(n3.id) });
      e3.trips = e3.trips.filter((t4) => !e3.pendingAlighters.includes(t4.id)), e3.manifest = e3.trips.map((e4) => e4.id), e3.passengers = e3.manifest.length, e3.delivered = e3.deliveredRides.length, e3.pendingAlighters = [], e3.pendingBoarders = Kx(e3), BM(e3, "boarding");
    })(d2);
    else if ("boarding" === d2.phase) {
      if (d2.boardingTime = d2.phaseTime, d2.phaseTime >= g_(d2, true)) {
        const e3 = u_(d2);
        for (const [t3, n3] of d2.pendingBoarders.entries()) {
          const i3 = qx(n3, d2.circuits);
          !d2.claimedRides.includes(i3) && !d2.manifest.includes(n3) && d2.manifest.length < mx(d2) && (d2.trips.push({ id: n3, seat: e3[t3], ride: i3, origin: d2.leg, destination: $x(n3), journey: gM(null), fareDistance: mM({ origin: d2.leg, destination: $x(n3) }) }), d2.manifest.push(n3), d2.claimedRides.push(i3), delete d2.arrivals[n3]);
        }
        d2.pendingBoarders = [], d2.passengers = d2.manifest.length, d2.served++, d2.visits.includes(d2.leg) || d2.visits.push(d2.leg), BM(d2, "ready"), (function(e4, t3 = false) {
          const n3 = e4.economy, i3 = n3.attempt;
          if ("active" !== i3.status) return;
          if (!t3 && (i3.legs.length < Jh.length || e4.leg !== i3.startStation)) return;
          const r3 = i3.distance ? i3.comfort / i3.distance * 100 : 0;
          i3.status = t3 ? "failed" : "complete";
          const a3 = t3 ? null : r3 >= 90 && 0 === i3.catches && i3.requests >= 3 ? "Gold" : r3 >= 75 && i3.catches <= 1 ? "Silver" : "Bronze";
          if (n3.lastResult = { id: i3.id, status: i3.status, grade: a3, station: e4.leg, fares: i3.fares, tips: i3.tips, bonuses: i3.bonuses, lost: i3.lost, deliveries: i3.deliveries, requests: i3.requests, comfort: r3, lanterns: i3.lanterns, legs: i3.legs.length }, !t3) {
            n3.completed++;
            const t4 = [null, "Bronze", "Silver", "Gold"];
            t4.indexOf(a3) > t4.indexOf(n3.bestGrade) && (n3.bestGrade = a3), 0 === i3.catches && yM(e4, "lantern-keeper"), "Gold" === a3 && yM(e4, "gold-service");
          }
        })(d2), wM(d2);
      }
    } else "retracting" === d2.phase ? (d2.steps = 1 - zM(d2.phaseTime / 1.3, 0, 1), d2.phaseTime >= 1.3 && (d2.steps = 0, BM(d2, "closing"))) : "closing" === d2.phase ? (d2.door = 1 - zM(d2.phaseTime, 0, 1), d2.phaseTime >= 1 && (d2.door = 0, BM(d2, "enroute"))) : "recovery" === d2.phase && d2.phaseTime >= 2.4 && (d2.roll = 0, d2.rollVelocity = 0, d2.criticalTime = 0, BM(d2, "enroute"));
    return d2;
  }
  if (d2.door > 0 || d2.steps > 0) return d2.speed = 0, d2;
  const p2 = d2.speed, h2 = d2.leg, u2 = d2.distance, f2 = Cu(d2).grade, m2 = d2.passengers / 12 + ((null == (c2 = null == (l2 = d2.cargo) ? void 0 : l2.id) ? void 0 : c2.startsWith("mail:")) ? 0.12 : 0), g2 = -3.4 * f2, v2 = Ww(d2.garage);
  if (i2) d2.reverseHold = 0, d2.speed = Math.sign(d2.speed) * Math.max(0, Math.abs(d2.speed) - 5 * v2.brake * t2);
  else if (r2) d2.speed > 0.01 ? (d2.speed = Math.max(0, d2.speed - 4.5 * v2.brake * t2), d2.reverseHold = 0) : (d2.reverseHold += t2, d2.reverseHold >= 0.45 && (d2.speed = Math.max(-EM, d2.speed - Math.max(0.55, 1.5 - g2) * t2)));
  else if (n2) if (d2.reverseHold = 0, d2.speed < 0) d2.speed = Math.min(0, d2.speed + 4.5 * t2);
  else if (AM[s2]) {
    const e3 = AM[s2] * (1 - 0.1 * m2), n3 = zM(0.9 * (e3 - d2.speed), -1.6, ("fast" === s2 ? 3.2 : 2.2) * v2.motor * (1 - 0.22 * m2));
    d2.speed = zM(d2.speed + (n3 + g2) * t2, 0, TM);
  } else d2.speed = zM(d2.speed + (3.2 * v2.motor * (1 - 0.22 * m2) + g2 - 0.16 - 0.013 * d2.speed * d2.speed) * t2, 0, TM);
  else d2.reverseHold = 0, d2.speed = Math.sign(d2.speed) * Math.max(0, Math.abs(d2.speed) - RM * t2);
  d2.driving.boost > 0 && (!n2 || i2 || r2 || $u(d2.garage.model, d2.leg, d2.distance) > 0.05) && (d2.driving.boost = 0), d2.driving.boost > 0 && f2 < -0.035 && (d2.speed = Math.min(TM, d2.speed + 2.2 * t2)), Math.abs(d2.speed) < 1e-8 && (d2.speed = 0), 0 === d2.leg && !d2.orchard.locked && d2.distance + Math.max(0, d2.speed) * t2 >= fu && (d2.orchard.locked = true);
  const x2 = xu(d2) && !d2.orchard.delivered && Mu(d2.distance) <= gu, b2 = x2 ? gu - Mu(d2.distance) : xu(d2) ? Mu(tu[0].length) - Mu(d2.distance) : tu[d2.leg].length - d2.distance;
  if (d2.speed > 0 && d2.distance > 20) {
    const e3 = Math.sqrt(3.6 * Math.max(0, b2));
    d2.speed = Math.min(d2.speed, e3);
  }
  d2.distance = Tu(d2, d2.speed * t2);
  const y2 = x2 && d2.speed >= 0 && gu - Mu(d2.distance) < 0.1, w2 = d2.distance, _2 = d2.speed >= 0 && d2.distance > 20 && tu[d2.leg].length - d2.distance < 0.1;
  d2.distance < 0 && (d2.leg = (d2.leg + Jh.length - 1) % Jh.length, d2.distance += tu[d2.leg].length), !_2 && d2.distance > tu[d2.leg].length && (d2.distance -= tu[d2.leg].length, d2.leg = (d2.leg + 1) % Jh.length);
  const M2 = Cu(d2), S2 = zM(Math.min(d2.distance, tu[d2.leg].length - d2.distance) / 75, 0, 1);
  d2.gust = (0.3 * Math.sin(0.62 * d2.played + 7e-3 * d2.distance + d2.leg) + 0.16 * Math.sin(0.21 * d2.played + d2.leg)) * S2;
  const T2 = Math.abs(d2.speed) / kM, E2 = (o2 ? 1 : 0) - (a2 ? 1 : 0), k2 = zM(1 + M2.verticalCurvature * d2.speed * d2.speed / 9.81, 0.68, 1.35), A2 = (M2.curvature * d2.speed * d2.speed * 0.85 + d2.gust * T2) / k2 + (0.09 * Math.sin(1.3 * d2.played) + 0.085 * Math.cos(0.43 * d2.played + d2.leg) + 0.07) * Math.min(1, T2), R2 = d2.driving.boost > 0 && $u(d2.garage.model, d2.leg, d2.distance) < 0.05;
  if (R2) {
    const e3 = Math.exp(8 * -t2);
    d2.roll *= e3, d2.rollVelocity *= e3, d2.rearRoll *= e3, d2.rearVelocity *= e3, d2.trim *= e3;
  } else !(function(e3, t3, { control: n3, force: i3, load: r3 }) {
    const a3 = B_(e3.difficulty), o3 = 0 === n3 ? 14 : n3 * e3.trim < 0 ? 11 : 5;
    e3.trim += (n3 - e3.trim) * (1 - Math.exp(-t3 * o3));
    const s3 = a3.damping + 0.28 * r3 + (0 === n3 ? 0.7 : 0), l3 = i3 * a3.disturbance + e3.trim * a3.steering + e3.roll * a3.instability;
    e3.rollVelocity += (l3 - e3.rollVelocity * s3) * t3 / (1 + 0.35 * r3), e3.rollVelocity = Math.max(-a3.maxRate, Math.min(a3.maxRate, e3.rollVelocity)), e3.roll = Math.max(-0.49, Math.min(0.49, e3.roll + e3.rollVelocity * t3));
  })(d2, t2, { control: E2, force: A2 * v2.sway, load: m2 }), (function(e3, t3) {
    if ("none" === fx(e3.garage).id) return void (e3.rearRoll = e3.rearVelocity = 0);
    const n3 = 1.13 * e3.roll + Math.sin(0.13 * e3.distance) * Math.min(0.025, 2e-3 * Math.abs(e3.speed));
    e3.rearVelocity = ((e3.rearVelocity || 0) + 9 * (n3 - (e3.rearRoll || 0)) * t3) * Math.exp(4 * -t3), e3.rearRoll = Math.max(-0.5, Math.min(0.5, (e3.rearRoll || 0) + e3.rearVelocity * t3));
  })(d2, t2);
  const C2 = !R2 && Math.max(Math.abs(d2.roll), Math.abs(d2.rearRoll)) > 0.34;
  d2.criticalTime = C2 ? d2.criticalTime + t2 : Math.max(0, d2.criticalTime - t2 * (R2 ? 8 : 2));
  const P2 = (!n2 || i2 || r2) && p2 > 4 && (p2 - d2.speed) / Math.max(t2, 1e-4) > 3.8, I2 = Math.max(0, Math.min(w2, tu[h2].length) - Math.max(u2, d2.economy.attempt.frontiers[h2] || 0));
  if (d2.comfort = zM(d2.comfort + (Math.abs(d2.roll) > 0.22 ? 4 * -t2 : n2 ? 0.018 * I2 : 0) - (P2 ? 18 * t2 : 0), 0, 100), xu(d2) || (function(e3, { leg: t3, from: n3, to: i3, fresh: r3, dt: a3, harsh: o3, powered: s3, control: l3, grade: c3 }) {
    const d3 = e3.driving, p3 = e3.economy.attempt, h3 = Math.max(Math.abs(e3.roll), Math.abs(e3.rearRoll || 0)), u3 = h3 < 0.13 && Math.abs(e3.rollVelocity) < 0.24 && !o3;
    if (d3.boost > 0 && (d3.boost = !s3 || "enroute" !== e3.phase || $u(e3.garage.model, t3, e3.distance) > 0.05 ? 0 : Math.max(0, d3.boost - a3)), "active" !== p3.status || "enroute" !== e3.phase) return;
    s3 && u3 && r3 > 0 && e3.speed >= 2.5 && 0 === d3.boost && (d3.charge = Math.min(1, d3.charge + r3 / 160));
    for (const a4 of ef(t3)) n3 < a4.distance && i3 >= a4.distance && r3 > 0 && !d3.claims.includes(a4.id) && (s3 && u3 && e3.speed >= a4.min && e3.speed <= a4.max ? rf(e3, a4.id, a4.bonus, "gate", "Perfect line!") : d3.claims.push(a4.id));
    h3 > 0.3 && e3.criticalTime > 0.18 && e3.criticalTime < 1.25 && r3 > 0 && e3.speed > 5 && !d3.near && !d3.claims.includes(`save:${t3}`) && (d3.near = { at: e3.played, distance: e3.distance, corrected: false }), d3.near && (l3 * e3.roll < 0 && (d3.near.corrected = true), e3.played - d3.near.at > 4 || e3.criticalTime >= 1.25 || e3.speed < 4 ? d3.near = null : u3 && d3.near.corrected && r3 > 0 && e3.distance > d3.near.distance + 5 && (rf(e3, `save:${t3}`, 20, "save", "Saved it! The passengers exhale"), d3.near = null));
    const f3 = s3 && r3 > 0 && u3 && e3.speed >= 11.5 && Math.abs(c3) > 0.055 && p3.streak >= 65;
    d3.boldMeters = f3 ? d3.boldMeters + r3 : 0, d3.bold = f3 && d3.boldMeters >= 15, d3.boldMeters >= 28 && e3.passengers > 0 && rf(e3, `bold:${t3}`, 20, "bold", "What a ride! Smooth speed earns extra tips");
  })(d2, { leg: h2, from: u2, to: w2, fresh: I2, dt: t2, harsh: P2, powered: n2 && !i2 && !r2, control: E2, grade: f2 }), (function(e3, t3, n3, i3, r3, { harsh: a3 = false, powered: o3 = true } = {}) {
    var s3, l3;
    const c3 = e3.economy.attempt;
    if ("active" !== c3.status) return;
    const d3 = nM(i3, 0, tu[t3].length), p3 = nM(n3, 0, tu[t3].length), h3 = Math.max(0, d3 - Math.max(p3, c3.frontiers[t3] || 0));
    c3.frontiers[t3] = Math.max(c3.frontiers[t3] || 0, d3), Math.abs(e3.roll) > 0.22 && Math.abs(e3.speed) > 0.2 ? (c3.wobble += r3, c3.wobble >= 0.65 && (c3.streak = 0)) : c3.wobble = Math.max(0, c3.wobble - 2 * r3);
    const u3 = Math.abs(e3.roll) < 0.13 && Math.abs(e3.rollVelocity) < 0.24 && !a3;
    o3 && h3 > 0 && e3.speed >= tM && u3 && (c3.streak = Math.min(eM, c3.streak + h3));
    const f3 = dM(e3), m3 = nM(e3.comfort / 100, 0, 1);
    c3.peakMultiplier = Math.max(c3.peakMultiplier, f3), c3.distance += h3, c3.comfort += h3 * m3, f3 >= 2 && yM(e3, "steady-hands"), o3 && e3.speed >= tM && 12 === e3.passengers && (c3.fullLoad += h3, c3.fullLoad >= 50 && yM(e3, "full-house"));
    const g3 = e3.economy.leg;
    (null == g3 ? void 0 : g3.departed) && !g3.arrived && g3.origin === t3 && (g3.distance += h3, g3.comfort += h3 * m3 * ("cargo" === (null == (s3 = g3.request) ? void 0 : s3.kind) ? Math.max(0.5, 1 - 0.8 * Math.abs(e3.rearRoll || 0)) : 1));
    const v3 = { speed: e3.speed, roll: e3.roll, rollVelocity: e3.rollVelocity || 0, harsh: a3 };
    !(function(e4, t4, n4, i4) {
      var r4;
      if (!(i4 > 0 && e4.trips.length)) return;
      const a4 = e4.played || 0, o4 = a4 - ((null == (r4 = e4.reaction) ? void 0 : r4.at) ?? -99) > 20, s4 = (t5, n5, i5) => {
        var r5;
        e4.reaction = { seq: ((null == (r5 = e4.reaction) ? void 0 : r5.seq) || 0) + 1, at: a4, id: t5.id, kind: n5, text: i5 };
      };
      if (q_(n4) && a4 - (e4.joltAt ?? -99) > 4) {
        e4.joltAt = a4;
        const n5 = e4.trips.filter((e5) => "sleeper" === K_(e5.id).id);
        for (const e5 of n5) e5.journey.weights[t4] = 0.75 * (e5.journey.weights[t4] || 0);
        if (n5.length) return void s4(n5[0], "woke", `${jx(n5[0].id).name} woke with a start${n5.length > 1 ? ` \xB7 ${n5.length} sleepers stirred` : ""}.`);
      }
      if (!o4) return;
      const l4 = Math.abs(n4.speed), c4 = e4.trips.find((e5) => "sightseer" === K_(e5.id).id), d4 = e4.trips.find((e5) => "rushed" === K_(e5.id).id);
      c4 && l4 > H_ + 2.5 ? s4(c4, "speed", `${jx(c4.id).name} can\u2019t see the view at this speed.`) : d4 && l4 < 4 && !c4 && s4(d4, "slow", `${jx(d4.id).name} keeps checking the clock.`);
    })(e3, t3, v3, h3);
    for (const n4 of e3.trips) {
      const i4 = n4.journey, r4 = Math.max(0, d3 - Math.max(p3, i4.frontiers[t3] || 0));
      i4.frontiers[t3] = Math.max(i4.frontiers[t3] || 0, d3), i4.distance += r4;
      const a4 = n4.seat >= 12 ? m3 * Math.max(0.5, 1 - 2 * Math.max(0, Math.abs(e3.rearRoll || 0) - Math.abs(e3.roll))) : m3, s4 = Z_(n4.id, a4, v3);
      i4.comfort += r4 * Math.min(1, s4), i4.weights[t3] = (i4.weights[t3] || 0) + r4 * s4 * f3 * ((null == (l3 = e3.driving) ? void 0 : l3.bold) ? 1.12 : 1) * (o3 && e3.speed >= tM ? 1 : 0);
    }
  })(d2, h2, u2, w2, t2, { harsh: P2, powered: n2 && !i2 && !r2 }), (function(e3, t3, n3 = false) {
    if (t3 <= 0) return;
    const i3 = e3.garage;
    i3.kilometers += t3 / 1e3;
    for (const [e4, r3] of Object.entries({ finish: 0.014, traction: 6e-3, stabilizer: 7e-3, brakes: n3 ? 0.05 : 4e-3 })) i3.condition[e4] = Math.max(30, i3.condition[e4] - t3 * r3);
  })(d2, Math.max(0, d2.speed) * t2, P2), d2.criticalTime > 1.5) d2.speed = Math.max(0, d2.speed) * CM, d2.catches++, d2.comfort = Math.max(0, d2.comfort - 12), (function(e3) {
    var t3;
    const n3 = e3.economy, i3 = n3.attempt;
    let r3 = 0;
    for (const t4 of e3.trips) {
      const n4 = cM(t4);
      t4.journey.weights[e3.leg] = 0, r3 += n4 - cM(t4);
    }
    i3.lanterns = Math.max(0, i3.lanterns - 1), i3.catches++, i3.streak = 0, i3.wobble = 0, i3.lost += r3, n3.leg && (n3.leg.lost += r3, n3.leg.catches++, "accepted" === (null == (t3 = n3.leg.request) ? void 0 : t3.status) && (n3.leg.request.status = "failed"));
  })(d2), d2.roll *= 0.25, d2.rollVelocity = 0, d2.rearRoll *= 0.25, d2.rearVelocity = 0, d2.criticalTime = 0, d2.wobbleAt = d2.played;
  else {
    if (y2) return d2.distance = Su(gu), d2.speed = 0, BM(d2, "orchard-docked"), d2;
    if (_2) return VM(d2, (h2 + 1) % Jh.length, true), d2;
  }
  return 0 === p2 && 0 === d2.speed && (d2.roll *= Math.exp(3 * -t2), d2.rollVelocity *= Math.exp(3 * -t2)), d2;
}
var jM, qM, $M, XM, YM, KM, ZM, JM, QM, eS, tS = Ys({ "src/service/state.js"() {
