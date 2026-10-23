// DERIVED FIXTURE — not the shipped file. Source: the game's own src/* regions of the bundled
// runtime (three.js and addons stripped), with minified three.js class ids rewritten to
// `THREE.<Name>` by demangle.mjs (ids recovered from `this.isX` / `this.type` markers). Static
// members, constants and non-class identifiers are left untouched. UNTRUSTED DATA: read as text only.
import * as THREE from "three";
//#region src/course.js
var Od = 1450, kd = {
	start: .205,
	end: .405,
	entrance: .23,
	exit: .38
}, Ad = [
	{
		s: 150,
		lane: -5
	},
	{
		s: 330,
		lane: 4.5
	},
	{
		s: 395,
		lane: -4.5
	},
	{
		s: 465,
		lane: 4.5
	},
	{
		s: 540,
		lane: -3.5
	},
	{
		s: 1120,
		lane: 4
	}
];
function jd(e, t) {
	return e.lane + Math.sin(t * .48 + e.id * .9) * 1.25;
}
var Md = [
	{
		id: "moon-hop",
		name: "MOON HOP",
		s: 105,
		lane: -5.5,
		width: 5,
		length: 18,
		height: 1.8
	},
	{
		id: "comet-kicker",
		name: "COMET KICKER",
		s: 1050,
		lane: 5.5,
		width: 5,
		length: 20,
		height: 2.4
	},
	{
		id: "last-light",
		name: "LAST LIGHT",
		s: 1380,
		lane: -5.5,
		width: 5,
		length: 22,
		height: 2.8
	}
];
function Nd(e, t, n = "bike") {
	let r = (e % Od + Od) % Od;
	return Id(n).find((e) => r >= e.s && r < e.s + e.length && Math.abs(t - e.lane) <= e.width / 2);
}
function Pd(e, t, n = "bike") {
	let r = Nd(e, t, n);
	if (!r) return 0;
	let i = ((e % Od + Od) % Od - r.s) / r.length;
	return r.height * i * i;
}
var Fd = [
	{
		id: "crystal-pop",
		name: "CRYSTAL POP",
		s: 345,
		lane: -5.5,
		width: 4.5,
		length: 14,
		height: 1.1
	},
	{
		id: "geode-transfer",
		name: "GEODE TRANSFER",
		s: 490,
		lane: 5.5,
		width: 4.5,
		length: 16,
		height: 1.5
	},
	{
		id: "inverted-ollie",
		name: "INVERTED OLLIE",
		s: 780,
		lane: -5,
		width: 4.5,
		length: 16,
		height: 1.2
	},
	{
		id: "home-kick",
		name: "HOME KICK",
		s: 1340,
		lane: 5,
		width: 4.5,
		length: 18,
		height: 1.9
	}
], Id = (e) => e === "skate" ? [...Md, ...Fd] : Md, Ld = [{
	id: "satellite-loop",
	name: "SATELLITE LOOP",
	s: 130,
	lane: 5.5,
	radius: 8,
	length: 14,
	width: 4.5
}, {
	id: "lunar-loop",
	name: "LUNAR LOOP",
	s: 1140,
	lane: -5.5,
	radius: 10,
	length: 18,
	width: 4.5
}], Rd = [{
	id: "painted",
	name: "Painted Rings",
	tag: "The opening race",
	description: "The original planet dive, crystal cave and complete gravity fold.",
	color: "#e9ad87",
	tint: "#ffffff",
	laps: 7,
	trialLaps: 5,
	radius: 220,
	waves: 13,
	elevation: 12,
	dive: 76,
	roll: 1,
	geode: !0,
	rocks: 13,
	grip: 1,
	unlock: 0,
	shortcut: {
		s: 840,
		end: 995,
		lane: -8,
		name: "Inside line",
		rate: 1.24
	}
}], zd = {
	explorer: {
		name: "Explorer",
		description: "Forgiving edges · 5 rescues · relaxed rivals",
		ai: .86,
		grip: 1.4,
		edgeGrace: 1.1,
		charges: 5,
		duration: 8,
		rescue: 18,
		mistakes: .13
	},
	racer: {
		name: "Racer",
		description: "Precise lines · 3 rescues · competitive rivals",
		ai: .96,
		grip: 1,
		edgeGrace: .55,
		charges: 3,
		duration: 6,
		rescue: 12,
		mistakes: .07
	},
	expert: {
		name: "Expert",
		description: "Exposed edges · 2 rescues · relentless rivals",
		ai: 1,
		grip: .83,
		edgeGrace: .22,
		charges: 2,
		duration: 4,
		rescue: 8,
		mistakes: .025
	}
}, Bd = (e) => Rd.find((t) => t.id === e) || Rd[0], Vd = (e) => e === "normal" ? "racer" : e === "relaxed" ? "explorer" : zd[e] ? e : "racer", Hd = [
	"LYRA",
	"IO",
	"ATLAS",
	"NOVA",
	"ORION"
], Ud = [
	15,
	12,
	10,
	8,
	6,
	4
], Wd = [
	{
		id: "original",
		name: "Expedition",
		wins: 0,
		suit: null,
		accent: null
	},
	{
		id: "moon",
		name: "Moon Silver",
		wins: 2,
		suit: "#d2dae5",
		accent: "#729bac"
	},
	{
		id: "aurora",
		name: "Aurora",
		wins: 5,
		suit: "#7bb8b0",
		accent: "#efd2a4"
	},
	{
		id: "champion",
		name: "Solar Champion",
		wins: 9,
		suit: "#ebc16d",
		accent: "#4e697b"
	}
], Gd = [
	{
		id: "balanced",
		name: "Touring",
		description: "Balanced speed and handling",
		level: 0,
		speed: 0,
		handling: 1,
		boost: 1
	},
	{
		id: "carve",
		name: "Carver",
		description: "Sharper steering · lower top speed",
		level: 2,
		speed: -1.5,
		handling: 1.16,
		boost: .96
	},
	{
		id: "comet",
		name: "Comet",
		description: "Stronger boost · wider turns",
		level: 5,
		speed: .6,
		handling: .88,
		boost: 1.1
	}
];
function Kd() {
	return {
		version: 2,
		races: 0,
		xp: 0,
		unlocked: 0,
		records: {},
		medals: {},
		ghosts: {},
		championship: null,
		championships: 0,
		finish: "original",
		equipment: "balanced"
	};
}
function qd(e) {
	let t = Kd();
	if (!e || typeof e != "object") return t;
	for (let n of [
		"races",
		"xp",
		"unlocked",
		"championships"
	]) t[n] = Math.max(0, Math.min(n === "unlocked" ? 3 : 1e9, Number(e[n]) || 0));
	for (let n of [
		"records",
		"medals",
		"ghosts"
	]) e[n] && typeof e[n] == "object" && !Array.isArray(e[n]) && (t[n] = e[n]);
	t.finish = Wd.some((n) => n.id === e.finish && n.wins <= t.races) ? e.finish : "original", e.lastChampionship && Array.isArray(e.lastChampionship.points) && e.lastChampionship.points.length === 6 && e.lastChampionship.points.every(Number.isFinite) && (t.lastChampionship = e.lastChampionship), t.equipment = Gd.some((n) => n.id === e.equipment && n.level <= t.races) ? e.equipment : "balanced";
	let n = e.championship;
	n && Number.isInteger(n.round) && n.round >= 0 && n.round < 4 && Array.isArray(n.points) && n.points.length === 6 && n.points.every(Number.isFinite) && Array.isArray(n.results) && n.results.length === n.round && (t.championship = {
		...n,
		difficulty: Vd(n.difficulty),
		vehicle: n.vehicle === "skate" ? "skate" : "bike",
		rider: Math.min(2, Math.max(0, n.rider | 0))
	});
	for (let [e, n] of Object.entries(t.records)) (!n || !Number.isFinite(n.time) || n.time <= 0 || ![
		"gold",
		"silver",
		"bronze"
	].includes(n.medal)) && delete t.records[e];
	for (let e of Object.keys(t.medals)) t.medals[e] = Array.isArray(t.medals[e]) ? [...new Set(t.medals[e].filter((e) => [
		"winner",
		"clean",
		"stunt",
		"explorer"
	].includes(e)))] : [];
	for (let [e, n] of Object.entries(t.ghosts)) (!n || !Number.isFinite(n.duration) || !Array.isArray(n.samples) || n.samples.length > 6e3 || n.samples.some((e, t) => !Array.isArray(e) || ![5, 6].includes(e.length) || !e.every(Number.isFinite) || t > 0 && e[0] < n.samples[t - 1][0])) && delete t.ghosts[e];
	return Zd(t), t;
}
var Jd = (e) => [
	e.courseId,
	e.mode === "trial" ? "trial" : "race",
	e.difficulty,
	e.vehicle,
	"continuous-v6"
].join(":");
function Yd(e) {
	return e.points.map((e, t) => ({
		id: t,
		name: t === 0 ? "YOU" : Hd[t - 1],
		points: e
	})).sort((e, t) => t.points - e.points || e.id - t.id);
}
function Xd(e, t) {
	let n = Jd(t), r = e.records[n], i = !r || t.time < r.time;
	e.races++, e.xp += 300 + (7 - t.place) * 80 + Math.min(600, t.tricks * 30 + t.stunts * 25), e.unlocked = Math.max(e.unlocked, Math.min(3, Rd.findIndex((e) => e.id === t.courseId) + 1)), i && (e.records[n] = {
		time: t.time,
		score: t.score,
		medal: t.end.medal
	}, t.mode === "trial" && t.recording?.length && (delete e.ghosts[n], e.ghosts[n] = {
		duration: t.time,
		samples: t.recording
	}));
	let a = [
		t.end.medal === "gold" ? "winner" : null,
		t.hits === 0 && t.respawns === 0 ? "clean" : null,
		t.tricks + t.stunts + t.loops >= 4 ? "stunt" : null,
		t.shortcutTime >= 8 ? "explorer" : null
	].filter(Boolean);
	e.medals[t.courseId] = [...new Set([...e.medals[t.courseId] || [], ...a])];
	let o = !1;
	if (t.mode === "championship" && e.championship) {
		let n = e.championship;
		n.round === t.round && ([{
			id: 0,
			s: t.s
		}, ...t.rivals.map((e, t) => ({
			id: t + 1,
			s: e.s
		}))].sort((e, t) => t.s - e.s || e.id - t.id).forEach((e, t) => n.points[e.id] += Ud[t]), n.results.push({
			course: t.courseId,
			place: t.place,
			time: t.time
		}), n.round++, n.round === 4 && (o = !0, e.championships++, e.lastChampionship = { ...n }, e.championship = null));
	}
	return Zd(e), {
		newBest: i,
		earned: a,
		complete: o,
		unlocks: Wd.filter((t) => t.wins === e.races).map((e) => e.name).concat(Gd.filter((t) => t.level === e.races).map((e) => e.name))
	};
}
function Zd(e) {
	let t = Object.entries(e.ghosts);
	for (; t.length > 4;) delete e.ghosts[t.shift()[0]];
	for (let [n, r] of t) {
		if (!r || !Array.isArray(r.samples)) {
			delete e.ghosts[n];
			continue;
		}
		for (; r.samples.length > 2 && JSON.stringify(r).length > 36e3;) r.samples = r.samples.filter((e, t, n) => t % 2 == 0 || t === n.length - 1);
	}
}
function Qd(e, t) {
	let n = e?.samples;
	if (!n?.length || t > e.duration || t > n[n.length - 1][0]) return null;
	let r = 0, i = n.length - 1;
	for (; r < i;) {
		let e = r + i >> 1;
		n[e][0] < t ? r = e + 1 : i = e;
	}
	let a = n[r], o = n[Math.max(0, r - 1)], s = a[0] === o[0] ? 0 : (t - o[0]) / (a[0] - o[0]);
	return {
		route: [
			"main",
			"upper",
			"lower",
			"islands",
			"bypass"
		][a[5] || 0],
		s: o[1] + (a[1] - o[1]) * s,
		lane: o[2] + (a[2] - o[2]) * s,
		height: o[3] + (a[3] - o[3]) * s,
		visible: o[4] === 0 && a[4] === 0 && (o[5] || 0) === (a[5] || 0)
	};
}
function $d(e, t, n) {
	let r = (t === "finish" ? Wd : t === "equipment" ? Gd : []).find((e) => e.id === n);
	return !r || (r.wins ?? r.level) > e.races ? !1 : (e[t] = n, !0);
}
//#endregion
//#region src/track.js
var ef = Math.PI * 2, tf = Bd("painted");
function nf(e) {
	tf = Bd(e);
}
var rf = () => tf;
function af(e, t = new THREE.Vector3()) {
	let n = e * ef, r = (e % 1 + 1) % 1, i = (e, t) => {
		let n = Math.max(0, Math.min(1, (r - e) / (t - e)));
		return n * n * (3 - 2 * n);
	}, a = i(.14, .24) * (1 - i(.37, .46)), o = tf.radius + tf.waves * Math.sin(n * 3) - tf.dive * a + 6 * Math.sin(n * 11) * a;
	return t.set(Math.cos(n) * o, tf.elevation * Math.sin(n * 2) + 5 * Math.sin(n * 3) - 5 * a + 1.2 * Math.sin(n * 12) * a, Math.sin(n) * o * .96);
}
function of(e) {
	let t = e / Od, n = t * ef, r = af(t), i = af(t + 5e-5).sub(af(t - 5e-5)).normalize(), a = (t % 1 + 1) % 1, o = Math.max(0, Math.min(1, (a - .43) / .28)), s = .17 * Math.sin(n * 3) + (1 - Math.cos(Math.PI * o)) * .5 * ef * tf.roll, c = new THREE.Vector3().crossVectors(i, new THREE.Vector3(0, 1, 0)).normalize(), l = new THREE.Vector3().crossVectors(c, i).normalize();
	return c.applyAxisAngle(i, s), l.applyAxisAngle(i, s), {
		p: r,
		tangent: i,
		side: c,
		up: l,
		quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(i, l, c))
	};
}
function sf(e, t) {
	let n = e / Od * ef;
	return .055 * Math.sin(n * 47 + t * .38) + .028 * Math.sin(n * 103 - t * .8);
}
function cf(e, t = "main") {
	if (t === "main") return of(e);
	let n = (e) => {
		let n = of(e), r = gd(e, t);
		return n.p.addScaledVector(n.side, r.side).addScaledVector(n.up, r.height);
	}, r = of(e), i = n(e), a = n(e + .05).sub(n(e - .05)).normalize().lerp(r.tangent, 1 - Sd(e, t)).normalize(), o = new THREE.Vector3().crossVectors(a, r.up).normalize(), s = new THREE.Vector3().crossVectors(o, a).normalize();
	return {
		p: i,
		tangent: a,
		side: o,
		up: s,
		quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, s, o))
	};
}
function lf(e, t = "main") {
	if (t === "main" || t === "islands") return 1;
	let n = of(e + .25).p.sub(of(e - .25).p).length(), r = cf(e + .25, t).p.sub(cf(e - .25, t).p).length();
	return Math.max(.45, Math.min(1.25, n / r));
}
//#endregion
//#region src/reentry.js
var uf = 16, df = .45, ff, pf;
function mf() {
	ff === rf() && pf || (ff = rf(), pf = {
		bike: hf("bike"),
		skate: hf("skate")
	});
}
function hf(e) {
	let t = /* @__PURE__ */ new Map(), n = (e, n, r, i) => {
		let a = new THREE.Triangle(e.p, n.p, r.p), o = a.getNormal(new THREE.Vector3());
		o.dot(cf((e.s + n.s + r.s) / 3, i).up) < 0 && o.negate();
		let s = {
			triangle: a,
			normal: o,
			route: i,
			vertices: [
				e,
				n,
				r
			]
		};
		gf(new THREE.Box3().setFromPoints([
			e.p,
			n.p,
			r.p
		]).expandByScalar(df), (e) => {
			t.has(e) || t.set(e, []), t.get(e).push(s);
		});
	}, r = (t, r, i, a, o, s = !1) => {
		let c = Math.ceil((i - r) / 1.5), l = gd((r + i) / 2, t).half, u;
		for (let d = 0; d <= c; d++) {
			let f = r + (i - r) * d / c, p = cf(f, t), m = Array.from({ length: 5 }, (n, r) => {
				let c = (a ?? -l) + ((o ?? l) - (a ?? -l)) * r / 4, u = (_d(f, t) ?? 0) + sf(f, Cd(f, c, t)) + (s ? Pd(Math.min(f, i - 1e-5), c, e) : 0);
				return {
					s: f,
					lane: c,
					p: p.p.clone().addScaledVector(p.side, c).addScaledVector(p.up, u + .06)
				};
			});
			if (u) for (let e = 0; e < 4; e++) n(u[e], u[e + 1], m[e], t), n(u[e + 1], m[e + 1], m[e], t);
			u = m;
		}
	};
	r("main", 0, Y.start), r("main", Y.start, Y.end), r("main", Y.end, ud.start), r("main", ud.end, Od);
	for (let e of ["upper", "lower"]) r(e, Y.start, Y.end);
	r("bypass", ud.start, ud.end), r("islands", ud.start, dd[0].start);
	for (let e of dd) r("islands", e.start, e.end);
	r("islands", dd.at(-1).end, ud.end);
	for (let t of Id(e)) r("main", t.s, t.s + t.length, t.lane - t.width / 2, t.lane + t.width / 2, !0);
	return t;
}
function gf(e, t) {
	for (let n = Math.floor(e.min.x / uf); n <= Math.floor(e.max.x / uf); n++) for (let r = Math.floor(e.min.y / uf); r <= Math.floor(e.max.y / uf); r++) for (let i = Math.floor(e.min.z / uf); i <= Math.floor(e.max.z / uf); i++) t(`${n},${r},${i}`);
}
function _f(e, t, n = "bike", r = 0) {
	mf();
	let i = /* @__PURE__ */ new Set(), a = pf[n] || pf.bike;
	gf(new THREE.Box3().setFromPoints([e, t]).expandByScalar(df), (e) => a.get(e)?.forEach((e) => i.add(e)));
	let o = null, s = t.clone().sub(e);
	for (let n of i) {
		let { triangle: i, normal: a } = n;
		if (s.dot(a) > 1e-5) continue;
		let c = e.clone().sub(i.a).dot(a), l = t.clone().sub(i.a).dot(a);
		if (c < -.12 || l > df) continue;
		let u = c > df ? (c - df) / Math.max(1e-9, c - l) : 0;
		if (u > 1 || o && u > o.t) continue;
		let d = e.clone().addScaledVector(s, u);
		if (d.addScaledVector(a, -d.clone().sub(i.a).dot(a)), !i.containsPoint(d)) {
			let e = i.closestPointToPoint(d, new THREE.Vector3());
			if (e.distanceToSquared(d) > .12 ** 2) continue;
			d.copy(e);
		}
		let f = i.getBarycoord(d, new THREE.Vector3()), p = n.vertices, m = p[0].s * f.x + p[1].s * f.y + p[2].s * f.z, h = p[0].lane * f.x + p[1].lane * f.y + p[2].lane * f.z, g = r + ((m - md(r) + Od * 1.5) % Od - Od / 2);
		g < 0 || (o = {
			s: g,
			lane: h,
			route: n.route,
			t: u,
			point: d,
			frame: cf(g, n.route)
		});
	}
	return o;
}
//#endregion
//#region src/race-order.js
var vf = (e, t = 0) => ({
	id: t,
	name: t ? e.name : "YOU",
	s: e.s,
	finished: t ? !!e.finished : e.phase === "finished",
	finishTime: t ? e.finishTime ?? Infinity : e.end?.time ?? e.time
}), yf = (e, t) => e.finished === t.finished ? e.finished ? e.finishTime - t.finishTime || e.id - t.id : t.s - e.s || e.id - t.id : e.finished ? -1 : 1;
function bf(e) {
	return [vf(e), ...e.rivals.map((e, t) => vf(e, t + 1))].sort(yf).map((e, t, n) => ({
		...e,
		place: t + 1,
		gap: e.finished ? "FIN" : t === 0 ? "LEAD" : n[0].s - e.s >= 1450 ? `+${Math.floor((n[0].s - e.s) / Od)} LAP` : `+${Math.round(Math.max(0, n[0].s - e.s))}m`
	}));
}
function xf(e) {
	let t = vf(e);
	return 1 + e.rivals.filter((e, n) => yf(vf(e, n + 1), t) < 0).length;
}
function Sf(e) {
	e.innerHTML = "<summary>RACE ORDER <span aria-hidden=\"true\">⌄</span></summary><ol aria-label=\"Live race standings\"></ol>";
	let t = e.querySelector("ol"), n = Array.from({ length: 6 }, (e, n) => {
		let r = document.createElement("li");
		return r.dataset.racer = n, r.classList.toggle("is-you", n === 0), r.innerHTML = "<span class=\"race-rank\"></span><span class=\"race-name\"></span><span class=\"race-gap\"></span>", t.append(r), r;
	}), r = Infinity;
	return (i, a) => {
		if (e.classList.toggle("hidden", !i.rivals.length), i.rivals.length && (r += a, !(r < .2))) {
			r = 0;
			for (let e of bf(i)) {
				let r = n[e.id];
				t.children[e.place - 1] !== r && t.insertBefore(r, t.children[e.place - 1] ?? null), r.children[0].textContent = e.place, r.children[1].textContent = e.name, r.children[2].textContent = e.gap, r.setAttribute("aria-label", `${e.place}. ${e.name}, ${e.gap}`);
			}
		}
	};
}
//#endregion
//#region src/chase-camera.js
var Cf = {
	back: 4.5,
	height: 3,
	fov: 72,
	portraitFov: 76
}, wf = {
	back: 4.5,
	height: 4,
	fov: 82,
	portraitFov: 82
};
//#endregion
//#region src/glow.js
function Tf() {
	let e = document.createElement("canvas");
	e.width = e.height = 64;
	let t = e.getContext("2d"), n = t.createRadialGradient(32, 32, 0, 32, 32, 32);
	return n.addColorStop(0, "#fff"), n.addColorStop(.1, "#fff"), n.addColorStop(.3, "#ffffff88"), n.addColorStop(1, "#ffffff00"), t.fillStyle = n, t.fillRect(0, 0, 64, 64), new THREE.CanvasTexture(e);
}
//#endregion
//#region src/palette.js
var Ef = {
	warm: [
		"#d98464",
		"#294e52",
		"#f3ddaf"
	],
	jade: [
		"#69bfb0",
		"#244f65",
		"#e8efcc"
	],
	violet: [
		"#8471b3",
		"#28325b",
		"#c8d0ef"
	],
	night: [
		"#628cce",
		"#293f6b",
		"#d0e0f1"
	],
	opal: [
		"#d2c5d9",
		"#665478",
		"#f6edd7"
	]
}, Df = [
	[0, "warm"],
	[275, "warm"],
	[320, "violet"],
	[555, "violet"],
	[610, "warm"],
	[1125, "warm"],
	[1180, "jade"],
	[1212, "opal"],
	[1247, "violet"],
	[1280, "opal"],
	[1305, "jade"],
	[1360, "warm"],
	[1450, "warm"]
], Of = Object.fromEntries(Object.entries(Ef).map(([e, t]) => [e, t.map((e) => new THREE.Color(e))]));
function kf(e) {
	let t = md(e), n = 0;
	for (; n < Df.length - 2 && t > Df[n + 1][0];) n++;
	let r = Df[n], i = Df[n + 1], a = hd((t - r[0]) / (i[0] - r[0]));
	return Of[r[1]].map((e, t) => e.clone().lerp(Of[i[1]][t], a));
}
function Af(e, t) {
	let n = [], r = [], i = [], a = [];
	for (let o = 0; o < e.attributes.position.count; o++) {
		let e = kf(typeof t == "number" ? t : t[o]);
		n.push(...e[0]), r.push(...e[1]), i.push(...e[2]), a.push(Nf(typeof t == "number" ? t : t[o]));
	}
	return e.setAttribute("paintOriginal", new THREE.Float32BufferAttribute(a, 1)), e.setAttribute("pigmentBase", new THREE.Float32BufferAttribute(n, 3)), e.setAttribute("pigmentVein", new THREE.Float32BufferAttribute(r, 3)), e.setAttribute("pigmentChalk", new THREE.Float32BufferAttribute(i, 3)), e;
}
function jf(e, { roughness: t = .86, side: n = 2, bumpScale: r = .026 } = {}) {
	let i = new THREE.MeshStandardMaterial({
		map: e,
		bumpMap: e,
		bumpScale: r,
		roughness: t,
		side: n
	});
	return i.onBeforeCompile = (e) => {
		e.vertexShader = "attribute float paintOriginal;varying float vPaintOriginal;attribute vec3 pigmentBase; attribute vec3 pigmentVein; attribute vec3 pigmentChalk; varying vec3 vPigmentBase; varying vec3 vPigmentVein; varying vec3 vPigmentChalk;\n" + e.vertexShader, e.vertexShader = e.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvPaintOriginal=paintOriginal;vPigmentBase=pigmentBase;vPigmentVein=pigmentVein;vPigmentChalk=pigmentChalk;"), e.fragmentShader = "varying float vPaintOriginal;varying vec3 vPigmentBase; varying vec3 vPigmentVein; varying vec3 vPigmentChalk;\n" + e.fragmentShader, e.fragmentShader = e.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\n   float lum=dot(sampledDiffuseColor.rgb,vec3(.2126,.7152,.0722));\n   float warm=smoothstep(-.005,.12,sampledDiffuseColor.r-sampledDiffuseColor.g);\n   vec3 pigment=mix(vPigmentVein,vPigmentBase,warm);\n   pigment=mix(pigment,vPigmentChalk,smoothstep(.29,.73,lum)*.84);\n   vec3 original=sampledDiffuseColor.rgb;float warmMask=smoothstep(.015,.18,original.r-original.g);original=mix(original,vec3(.56,.285,.245)*(.65+lum),warmMask*.38);original=mix(original,vec3(lum),.09);original*=mix(vec3(.94),vec3(.88,.67,.55),warmMask);\n   diffuseColor.rgb=mix(pigment*(.24+1.38*pow(max(0.,lum),.65)),original,vPaintOriginal);"), e.fragmentShader = e.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*(.1*(1.-vPaintOriginal));");
	}, i.customProgramCacheKey = () => "cohesive-mineral-v4", i;
}
function Mf(e = !1) {
	let t = new THREE.MeshPhysicalMaterial({
		color: e ? "#b9c5e1" : "#e5ddcf",
		roughness: e ? .3 : .72,
		metalness: e ? .23 : .03,
		iridescence: e ? 1 : .18,
		iridescenceIOR: 1.4,
		iridescenceThicknessRange: [140, 520],
		clearcoat: e ? .8 : .2,
		side: 2
	});
	return t.onBeforeCompile = (t) => {
		t.vertexShader = "varying vec3 vMineralPosition;\n" + t.vertexShader, t.vertexShader = t.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvMineralPosition=position;"), t.fragmentShader = "varying vec3 vMineralPosition;\n" + t.fragmentShader, t.fragmentShader = t.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
   float strata=sin(vMineralPosition.y*3.6+sin(vMineralPosition.z*1.8)*1.1+sin(vMineralPosition.x*2.1));
   float fine=sin(vMineralPosition.y*37.+sin(vMineralPosition.z*11.)*1.6);
   diffuseColor.rgb*=.9+.08*strata+.02*fine;
   ${e ? "diffuseColor.rgb*=mix(vec3(.64,.88,1.),vec3(1.,.69,.86),strata*.5+.5);" : ""}`), t.fragmentShader = t.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*${e ? ".17" : ".025"};`);
	}, t.customProgramCacheKey = () => "opal-cut-" + e, t;
}
function Nf(e) {
	let t = md(e), n = 0;
	for (; n < Df.length - 2 && t > Df[n + 1][0];) n++;
	let r = Df[n], i = Df[n + 1], a = hd((t - r[0]) / (i[0] - r[0]));
	return (r[1] === "warm" ? 1 - a : 0) + (i[1] === "warm" ? a : 0);
}
//#endregion
//#region src/continuous-world.js
function Pf(e, t, n, r, i, a) {
	let o = new THREE.Group();
	o.name = "One continuous orbit", e.add(o);
	let s = jf(t), c = new THREE.MeshStandardMaterial({
		color: "#e5e4b9",
		emissive: "#9ebdae",
		emissiveIntensity: .22,
		roughness: .7,
		side: 2
	}), l = jf(t, {
		roughness: .62,
		bumpScale: .04
	}), u = Mf(), d = Mf(!0), f = [];
	function p(e, t, n = "main", r = 11.5, a = 1.2) {
		let l = Math.max(2, Math.ceil((t - e) / (i ? 2.1 : 1.3))), u = [], d = [], p = [], m = [];
		for (let i = 0; i <= l; i++) {
			let o = e + (t - e) * i / l, s = cf(o, n), c = _d(o, n) ?? 0;
			[
				[-r, -(1.2 + (a - 1.2) * Sd(o, n))],
				...Array.from({ length: 13 }, (e, t) => [-r + t / 12 * r * 2, 0]),
				[r, -(1.2 + (a - 1.2) * Sd(o, n))]
			].forEach(([e, t], r) => {
				u.push(...s.p.clone().addScaledVector(s.side, e).addScaledVector(s.up, c + t + sf(o, Cd(o, e, n))));
				let i = wd(o, e, n);
				d.push(i[0], i[1] + t * .04), p.push(o);
			});
		}
		for (let e = 0; e < l; e++) {
			for (let t = 0; t < 14; t++) {
				let n = e * 15 + t;
				m.push(n, n + 1, n + 15, n + 1, n + 15 + 1, n + 15);
			}
			let t = e * 15;
			m.push(t, t + 15, t + 30 - 1, t, t + 30 - 1, t + 15 - 1);
		}
		let h = new THREE.BufferGeometry();
		h.setAttribute("position", new THREE.Float32BufferAttribute(u, 3)), h.setAttribute("uv", new THREE.Float32BufferAttribute(d, 2)), h.setIndex(m), h.computeVertexNormals();
		let g = (e, t) => {
			let r = cf(e, n);
			return r.p.addScaledVector(r.side, t).addScaledVector(r.up, (_d(e, n) ?? 0) + sf(e, Cd(e, t, n)));
		}, _ = h.attributes.normal;
		for (let n = 0; n <= l; n++) for (let i = 0; i <= 12; i++) {
			let a = e + (t - e) * n / l, o = -r + i / 12 * r * 2, s = g(a + .025, o).sub(g(a - .025, o)), c = g(a, o + .025).sub(g(a, o - .025)).cross(s).normalize();
			_.setXYZ(n * 15 + i + 1, ...c);
		}
		Af(h, p);
		let v = new THREE.Mesh(h, s);
		v.name = `Rideable ${n} ${e}-${t}`, v.receiveShadow = !0, o.add(v), f.push(v);
		for (let i of [-1, 1]) {
			let a = [], s = [], u = [], d = [];
			for (let o = 0; o <= l; o++) {
				let c = e + (t - e) * o / l, f = cf(c, n), p = _d(c, n) ?? 0;
				for (let e of [-.1, .1]) {
					let t = i * r + e;
					a.push(...f.p.clone().addScaledVector(f.side, t).addScaledVector(f.up, p + .035 + sf(c, Cd(c, t, n)))), s.push(c * .05, e), u.push(c);
				}
				if (o < l) {
					let e = o * 2;
					d.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);
				}
			}
			let f = new THREE.BufferGeometry();
			f.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)), f.setAttribute("uv", new THREE.Float32BufferAttribute(s, 2)), f.setIndex(d), f.computeVertexNormals(), Af(f, u);
			let p = new THREE.Mesh(f, c);
			o.add(p);
		}
	}
	p(0, Y.start), p(Y.start, Y.end, "main", 23 / 6), p(Y.start, Y.end, "upper", 23 / 6, 1.7), p(Y.start, Y.end, "lower", 23 / 6, 1.7), p(Y.end, ud.start), p(ud.end, 1450), p(ud.start, dd[0].start, "islands", 6.75, 3), p(dd.at(-1).end, ud.end, "islands", 6.75, 3), p(ud.start, ud.end, "bypass", 4.75, 2.5);
	let m = [];
	for (let e of dd) {
		let t = r.clone(!0);
		t.name = "Opal island " + e.id, t.traverse((t) => {
			if (!t.isMesh) return;
			let n = t.geometry.clone(), r = n.attributes.position, i = n.attributes.uv, a = [];
			for (let t = 0; t < r.count; t++) {
				let n = r.getX(t), o = r.getY(t), s = r.getZ(t), c = e.start + n * (e.end - e.start), l = cf(c, "islands"), u = l.p.addScaledVector(l.side, s * 6.75).addScaledVector(l.up, _d(c, "islands") + o * 5 + sf(c, Cd(c, s * 6.75, "islands")));
				r.setXYZ(t, ...u), i.setXY(t, ...wd(c, s * 6.75, "islands")), a.push(c);
			}
			n.computeVertexNormals(), n.computeBoundingSphere(), Af(n, a), t.geometry = n, t.material = t.material.name.includes("Opal") ? d : l, t.castShadow = !0, t.receiveShadow = !0;
		}), o.add(t), m.push(t);
	}
	let h = [];
	for (let e = 0; e < (i ? 12 : 20); e++) {
		let t = of(ud.start + 12 + e / (i ? 11 : 19) * 132), n = e % 2 ? -1 : 1, a = r.clone(!0);
		a.name = "Fractured opal escarpment", a.position.copy(t.p).addScaledVector(t.side, n < 0 ? -22 - e % 3 * 4 : 44 + e % 3 * 5).addScaledVector(t.up, 3 + e % 5 * 2), a.quaternion.copy(t.quaternion), a.rotateX((e % 3 - 1) * .14), a.rotateZ((e % 4 - 1.5) * .12), a.scale.set(5 + e % 3 * 3, 15 + e % 5 * 5, 3 + e % 4), a.traverse((e) => {
			e.isMesh && (e.material = e.material.name.includes("Opal") ? d : u, e.receiveShadow = !0);
		}), o.add(a), h.push(a);
	}
	function g(e, t, n, r) {
		let i = document.createElement("canvas");
		i.width = 512, i.height = 128;
		let a = i.getContext("2d");
		a.fillStyle = r, a.font = "bold 42px Arial", a.textAlign = "center", a.fillText(n, 256, 76);
		let s = new THREE.CanvasTexture(i);
		s.colorSpace = Xe;
		let c = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), new THREE.MeshBasicMaterial({
			map: s,
			transparent: !0,
			depthWrite: !1,
			side: 2
		})), l = of(e);
		c.position.copy(l.p).addScaledVector(l.side, t).addScaledVector(l.up, .22), c.quaternion.copy(l.quaternion), c.rotateY(-Math.PI / 2), c.rotateX(-Math.PI / 2), o.add(c);
		for (let n = 0; n < 3; n++) {
			let i = of(e + 4 + n * 2), a = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
				[
					-.6,
					0,
					-.8
				],
				[
					.3,
					0,
					0
				],
				[
					-.6,
					0,
					.8
				]
			].map((e) => new THREE.Vector3(...e))), new THREE.LineBasicMaterial({ color: r }));
			a.position.copy(i.p).addScaledVector(i.side, t).addScaledVector(i.up, .12), a.quaternion.copy(i.quaternion), o.add(a);
		}
	}
	g(Y.start - 14, -8, "UPPER", "#d6ecd7"), g(Y.start - 14, 8, "LOWER", "#c5c2eb"), g(ud.start - 16, -5, "JUMP", "#f5dfb0"), g(ud.start - 16, 7, "BYPASS", "#bfdfd5");
	for (let e of dd) {
		let t = cf(e.start + 1, "islands"), n = new THREE.Group();
		n.position.copy(t.p).addScaledVector(t.up, _d(e.start + 1, "islands") + .12), n.quaternion.copy(t.quaternion);
		for (let e of [
			-5,
			0,
			5
		]) {
			let t = new THREE.BufferGeometry().setFromPoints([
				new THREE.Vector3(-.9, 0, e - .4),
				new THREE.Vector3(.4, 0, e),
				new THREE.Vector3(-.9, 0, e + .4)
			]);
			n.add(new THREE.Line(t, new THREE.LineBasicMaterial({ color: "#f8e4a8" })));
		}
		o.add(n);
	}
	let _ = [];
	for (let e of fd) {
		let t = of(e.s), r = n.clone(!0);
		r.name = "Living checkpoint · " + e.name, r.position.copy(t.p), r.quaternion.copy(t.quaternion), r.traverse((e) => {
			if (!e.isMesh) return;
			e.material = e.material.clone();
			let t = e.material.name;
			t.includes("Gold") ? (e.material.emissive = new THREE.Color("#ecb75f"), e.material.emissiveIntensity = 3.5) : e.material = t.includes("Opal") ? d : u, e.castShadow = !0, e.receiveShadow = !0;
		}), o.add(r);
		let s = e.s * 13, c = () => (s = s * 16807 % 2147483647, s / 2147483647), l = [], f = [];
		for (let e = 0; e < (i ? 220 : 420); e++) {
			let t = c() * 12.3 + .1, n = c() * 2 - 1;
			l.push(0, t, n), f.push(e * .71);
		}
		let p = new THREE.BufferGeometry();
		p.setAttribute("position", new THREE.Float32BufferAttribute(l, 3));
		let m = new THREE.Points(p, new THREE.PointsMaterial({
			map: a,
			color: "#ffe1a1",
			size: .32,
			transparent: !0,
			opacity: .85,
			blending: 2,
			depthWrite: !1
		}));
		m.name = "Gold pigment threshold", r.add(m);
		let h = new THREE.RingGeometry(.96, 1, 64);
		h.rotateX(-Math.PI / 2);
		let g = new THREE.Mesh(h, new THREE.MeshBasicMaterial({
			color: "#f8d17d",
			transparent: !0,
			opacity: 0,
			side: 2,
			depthWrite: !1,
			blending: 2
		}));
		g.position.y = .13, r.add(g);
		let v = new THREE.Mesh(new THREE.PlaneGeometry(23, 13), new THREE.ShaderMaterial({
			transparent: !0,
			depthWrite: !1,
			side: 2,
			blending: 2,
			uniforms: {
				time: { value: 0 },
				pulse: { value: 0 }
			},
			vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
			fragmentShader: "varying vec2 vUv;uniform float time;uniform float pulse;void main(){float y=vUv.y*13.;float t=clamp((y+.6)/13.5,0.,1.);float z=(vUv.x-.5)*23.;float edge=10.1-8.3*t*t-(1.3*pow(1.-t,.55)+.1);float mask=1.-smoothstep(edge-.35,edge,abs(z));float stream=pow(max(0.,sin(z*8.+sin(y*.65-time)*1.1-time*.4)),30.);float rim=exp(-pow((abs(z)-edge+.25)*3.,2.));float alpha=(stream*.09+rim*.4)*mask*smoothstep(0.,.7,y)*(1.-smoothstep(11.5,13.,y));gl_FragColor=vec4(mix(vec3(.48,.79,1.),vec3(1.,.75,.3),.65+.35*sin(time+y)),alpha*(1.+pulse*2.));}"
		}));
		v.rotation.y = Math.PI / 2, v.position.y = 6.5, r.add(v);
		let y = [];
		for (let e of [-1, 1]) for (let t of [
			.06,
			.35,
			.66
		]) {
			let n = new THREE.Sprite(new THREE.SpriteMaterial({
				map: a,
				color: t > .5 ? "#bdaeff" : "#ffd287",
				transparent: !0,
				opacity: .6,
				blending: 2,
				depthWrite: !1
			}));
			n.position.set(-.6, -.6 + (e < 0 ? 13.5 : 12.7) * t, e * (10.1 - 8.3 * t * t)), n.scale.setScalar(t > .5 ? 3 : 4), r.add(n), y.push(n);
		}
		_.push({
			def: e,
			group: r,
			flares: y,
			curtain: m,
			veil: v,
			wave: g,
			pulse: 0,
			seed: f,
			base: l,
			left: r.getObjectByName("GateLeft"),
			right: r.getObjectByName("GateRight")
		});
	}
	function v(e, t, n) {
		for (let r of _) {
			e.events.some((e) => e.type === "gate" && e.gate === r.def.s) && (r.pulse = 1), r.pulse = Math.max(0, r.pulse - t * .65);
			let i = 1 - r.pulse;
			r.wave.scale.setScalar(1 + i * 20), r.wave.material.opacity = r.pulse * .42, r.curtain.material.opacity = .78 + r.pulse * .22, r.veil.material.uniforms.time.value = n, r.veil.material.uniforms.pulse.value = r.pulse;
			let a = r.curtain.geometry.attributes.position;
			for (let e = 0; e < a.count; e++) {
				let t = r.base, o = r.pulse * Math.sin(i * Math.PI), s = (t[e * 3 + 1] + n * .65) % 12.3 + .08, c = Math.min(1, (s + .6) / 13.5), l = Math.max(.1, 10.1 - 8.3 * c * c - (1.3 * (1 - c) ** .55 + .1));
				a.setXYZ(e, Math.sin(n * .7 + r.seed[e]) * .18 + o * 2, s, t[e * 3 + 2] * l);
			}
			a.needsUpdate = !0, r.flares.forEach((e, t) => e.material.opacity = .5 + .16 * Math.sin(n * 1.6 + t) + r.pulse * .3), r.left && (r.left.rotation.x = -r.pulse * .025), r.right && (r.right.rotation.x = r.pulse * .025);
		}
	}
	return {
		root: o,
		gates: _,
		islands: m,
		formations: h,
		surfaces: f,
		update: v,
		trigger(e) {
			if (e.type === "gate") {
				let t = _.find((t) => t.def.s === e.gate);
				t && (t.pulse = 1);
			}
		}
	};
}
//#endregion
//#region src/skater.js
var Ff = new THREE.Vector3(0, 1, 0), If = (e, t, n) => new THREE.Vector3(e, t, n);
function Lf(e, t, n) {
	let r = e.clone(!0);
	r.name = "Astronaut skateboard";
	let i = (e) => e.name.replace(/^Skate_/, "").split(".")[0];
	r.traverse((e) => {
		if (!e.isMesh) return;
		e.castShadow = e.receiveShadow = !0, e.material = e.material.clone();
		let r = i(e.material);
		(r === "SuitCanvas" || r === "Porcelain") && (e.material.map = n, e.material.bumpMap = n, e.material.bumpScale = .012), r === "SuitCanvas" && e.material.color.set(t.color), r === "CoralEnamel" && e.material.color.set(t.accent);
	});
	let a = r.getObjectByName("SkaterBody"), o = r.getObjectByName("Skateboard"), s = (e) => r.getObjectByName(e), c = 0;
	function l(e, t, n) {
		let r = s(e);
		r.position.copy(t), r.quaternion.setFromUnitVectors(Ff, n.clone().sub(t).normalize()), r.scale.set(1, t.distanceTo(n), 1);
	}
	function u(e, t, n, r = 0, i = !0) {
		c += t;
		let u = c * 5, d = !n && i && e > 2 && e < 36 ? Math.max(0, Math.sin(u)) : 0, f = n ? .16 : .045 + d * .045;
		a.position.y = -f, a.rotation.y = -.32 + r * .25, o.rotation.set(0, 0, 0), n?.trick && (o.rotation.x = Math.min(1, n.trick.elapsed / n.trick.duration) * Math.PI * 2);
		for (let [e, t] of ["L", "R"].entries()) {
			let i = If(e ? -.12 : .12, .94 - f, e ? .12 : -.12).applyAxisAngle(Ff, a.rotation.y), o = e ? If(-.38 - d * .28, .29 - d * .18, .13 + d * .17) : If(.39, .29, -.09), c = i.clone().lerp(o, .53).add(If(.15, 0, e ? .06 : -.06));
			l("Thigh" + t, i, c), l("Shin" + t, c, o), s("Knee" + t).position.copy(c), s("Boot" + t).position.copy(o).add(If(0, -.1, 0)), s("Boot" + t).rotation.y = e ? -.25 : .65;
			let u = e ? 1 : -1, p = If(.02, 1.41 - f, u * .22).applyAxisAngle(Ff, a.rotation.y), m = If(-.1 + u * .08, 1.22 - f, u * (n ? .48 : .36)), h = If(.08 + u * .18, 1.02 - f + Math.abs(r) * .13, u * (n ? .59 : .44));
			l("UpperArm" + t, p, m), l("Forearm" + t, m, h), s("Glove" + t).position.copy(h);
		}
	}
	function d(e) {
		r.traverse((t) => {
			if (t.isMesh) {
				let n = i(t.material);
				n === "SuitCanvas" && t.material.color.set(e.color), n === "CoralEnamel" && t.material.color.set(e.accent);
			}
		});
	}
	return u(0, 0, null), {
		root: r,
		pose: u,
		recolor: d
	};
}
//#endregion
//#region src/gravity.js
var Rf = {
	charges: 3,
	duration: 6,
	driftLimit: 12,
	slingTime: 1.65
};
function zf(e, t = e.s) {
	let n = cf(e.s, e.route), r = e.air, i = n.tangent.clone().multiplyScalar(Math.cos(e.heading || 0)).addScaledVector(n.side, Math.sin(e.heading || 0));
	e.flight = {
		mode: "drift",
		position: n.p.clone().addScaledVector(n.side, e.lane).addScaledVector(n.up, .12 + sf(e.s, Cd(e.s, e.lane, e.route)) + (r?.height ?? Dd(e.s, e.lane, e.route, e.vehicle) ?? 0)),
		velocity: i.clone().multiplyScalar(e.speed * .8).addScaledVector(n.side, (e.lateral - Math.sin(e.heading || 0) * e.speed) * 1.6).addScaledVector(n.up, r ? r.vy : 3.5),
		up: n.up.clone(),
		forward: i,
		age: 0,
		elapsed: 0,
		startS: vd(e.route === "islands" && e.groundedRoute === e.route && e.groundedS <= t && t - e.groundedS < 200 ? e.groundedS : t, e.route),
		route: e.route
	}, e.air = null, e.jumpBuffer = 0, e.boosting = !1, e.surge = 0, e.combo = 0, e.resonanceChain = 0, e.events.push({
		type: "launch",
		text: "ZERO G · steer · hold Rise / Brake to change height · gravity to rescue"
	});
}
function Bf(e) {
	if (!e.air || e.route !== "islands" || e.air.vy >= 0) return !1;
	let t = e.groundedRoute === e.route ? e.groundedS : e.s, n = Dd(e.s, e.lane, e.route, e.vehicle) ?? _d(vd(t, e.route), e.route) ?? 0;
	return e.air.height < n - .35;
}
function Vf(e) {
	let t = !!e.flight || Bf(e);
	return e.flight?.mode === "sling" ? !1 : t ? e.gravityTime > 0 && e.gravityRescueReady || e.gravityCharges > 0 : e.gravityCharges > 0 && e.gravityTime <= 0;
}
function Hf(e) {
	if (!Vf(e)) return !1;
	if (!e.flight && Bf(e) && zf(e), e.flight && e.gravityTime > 0 && e.gravityRescueReady || e.gravityCharges--, e.gravityTime = 0, e.gravityRescueReady = !1, e.flight) {
		let t = e.flight;
		e.flight.mode = "sling", t.from = t.position.clone(), t.elapsed = 0, t.target = cf(t.startS, t.route).p.addScaledVector(cf(t.startS, t.route).up, .05 + sf(t.startS, Cd(t.startS, 0, t.route)) + (_d(t.startS, t.route) || 0)), e.events.push({
			type: "sling",
			text: "Gravity sling · hold on!"
		});
	} else e.gravityRescueReady = !0, e.gravityTime = e.rules?.duration || Rf.duration, e.events.push({
		type: "gravity",
		text: `Gravity lock · ${e.gravityTime} seconds of extra grip`
	});
	return !0;
}
function Uf(e, t, n = {}) {
	let r = e.flight;
	if (e.boosting = !1, e.drafting = !1, e.pushing = !!n.pedal, r.mode === "drift") {
		let i = Math.max(-1, Math.min(1, n.steer || 0)) * -1.05 * t;
		r.forward.applyAxisAngle(r.up, i), r.velocity.applyAxisAngle(r.up, i), n.pedal && r.velocity.addScaledVector(r.forward, 5 * t), r.velocity.addScaledVector(r.up, (!!n.jump - +!!n.brake) * 9 * t), r.velocity.length() > 65 && r.velocity.setLength(65);
		let a = r.position.clone();
		r.age += t, r.position.addScaledVector(r.velocity, t);
		let o = r.age > .12 && _f(a, r.position, e.vehicle, e.s);
		if (o) {
			let { frame: t } = o, i = r.velocity.dot(t.tangent), a = r.velocity.dot(t.side), s = Math.hypot(i, a);
			return e.s = o.s, e.route = o.route, e.lane = o.lane, e.speed = s < 1 ? 0 : Math.min(61, s), e.heading = s < 1 ? Math.atan2(r.forward.dot(t.side), r.forward.dot(t.tangent)) : Math.atan2(a, i), e.lateral = e.speed ? a : 0, e.lean = 0, e.steerRate = 0, e.flight = null, e.air = null, e.groundedS = e.s, e.groundedRoute = e.route, e.jumpCooldown = 0, e.jumpBuffer = 0, e.jumpHeld = !!n.jump, e.edgeTime = 0, e.edgeWarning = !1, e.gravityTime <= 0 && (e.gravityRescueReady = !1), e.gravityTime = Math.max(e.gravityTime, .5), e.hitCooldown = Math.max(e.hitCooldown, .5), e.reentries = (e.reentries || 0) + 1, e.events.push({
				type: "land",
				text: "BACK ON TRACK · no gravity charge used"
			}), !0;
		}
		r.age >= (e.rules?.rescue || Rf.driftLimit) && (e.phase = "lost", e.events.push({
			type: "lost",
			text: "Lost in orbit. Try another line."
		}));
	} else {
		r.elapsed += t;
		let n = Math.min(1, r.elapsed / Rf.slingTime), i = n * n * (3 - 2 * n);
		r.position.lerpVectors(r.from, r.target, i).addScaledVector(r.up, Math.sin(n * Math.PI) * Math.min(14, r.from.distanceTo(r.target) * .15)), n >= 1 && (e.s = r.startS, e.route = r.route, e.groundedS = e.s, e.groundedRoute = e.route, e.lane = 0, e.lateral = 0, e.lean = 0, e.heading = 0, e.steerRate = 0, e.speed = r.route === "islands" ? 24 : 28, e.flight = null, e.air = null, e.jumpCooldown = 0, e.jumpBuffer = 0, e.edgeTime = 0, e.edgeWarning = !1, e.gravityTime = 2, e.hitCooldown = 2, e.respawns++, e.events.push({
			type: "land",
			text: "Back in orbit · 2 seconds of landing grip"
		}));
	}
}
function Wf(e, t, n = "main") {
	if (t < 38) return 0;
	let r = cf(e, n), i = cf(e + 3, n).tangent.sub(cf(e - 3, n).tangent).multiplyScalar(1 / 6).dot(r.side);
	return Math.max(-8.5, Math.min(8.5, -i * (t * t - 1444) * (n === "main" ? .65 : .4)));
}
//#endregion
//#region src/skate-loop.js
function Gf(e, t, n = 0) {
	let r = of(e.s), i = (t) => {
		let i = of(e.s + e.length * t), a = t * Math.PI * 2;
		return i.p.addScaledVector(r.tangent, e.radius * Math.sin(a)).addScaledVector(r.up, e.radius * (1 - Math.cos(a))).addScaledVector(i.side, e.lane + n + Math.sin(a) * e.width * .9);
	}, a = i(t), o = i(t + 1e-4).sub(i(t - 1e-4)).normalize(), s = new THREE.Vector3().crossVectors(r.side, o).normalize(), c = new THREE.Vector3().crossVectors(o, s).normalize();
	return {
		p: a,
		tangent: o,
		side: c,
		up: s,
		quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(o, s, c))
	};
}
function Kf(e, t) {
	if (e.vehicle !== "skate" || e.air || e.flight || e.loop) return !1;
	let n = Math.floor(t / Od);
	for (let r of Ld) {
		let i = n * Od + r.s;
		if (t < i && e.s >= i && Math.abs(e.lane - r.lane) < r.width / 2 && e.speed >= 20) return e.loop = {
			def: r,
			t: 0,
			lane: e.lane - r.lane,
			startS: i
		}, e.s = i, e.events.push({
			type: "gate",
			text: "LOOP LOCK · keep your momentum"
		}), !0;
	}
	return !1;
}
function qf(e, t, n, r, i) {
	let a = e.loop, o = Gf(a.def, a.t, a.lane);
	if (i && Hf(e), e.pushing = !!t.pedal, e.drafting = !1, e.boosting = !!t.boost && e.energy > 1, e.boosting && (e.energy = Math.max(0, e.energy - 20 * n), e.boostTime += n), e.speed += ((t.pedal ? 6 : 0) + (e.boosting ? 9 : 0) - (t.brake ? 24 : 0) - 1 - o.tangent.dot(of(a.def.s).up) * 5) * n, e.speed = Math.max(0, Math.min(55, e.speed)), a.lane += (t.steer || 0) * n * 2.5, r || Math.abs(a.lane) > a.def.width / 2 || e.speed < 17 && e.gravityTime <= 0) {
		e.s = a.startS + a.def.length * a.t, zf(e), e.flight.position.copy(o.p).addScaledVector(o.up, .1), e.flight.velocity.copy(o.tangent).multiplyScalar(e.speed).addScaledVector(o.up, r ? 7 : 1), e.flight.forward.copy(o.tangent), e.flight.up.copy(o.up), e.loop = null, e.events.push({
			type: "launch",
			text: "LOOP RELEASE · G to sling back"
		});
		return;
	}
	e.gravityTime > 0 && (a.lane = Math.max(-1.5, Math.min(1.5, a.lane)), e.speed = Math.max(22, e.speed)), a.t = Math.min(1, a.t + n * e.speed / (a.def.length + Math.PI * 2 * a.def.radius)), e.s = a.startS + a.def.length * a.t, a.t >= 1 && (e.s = a.startS + a.def.length, e.lane = a.def.lane + a.lane, e.lateral = 0, e.loop = null, e.loops++, e.score += 650, e.surge = 5, e.speed = Math.max(e.speed, 44), e.energy = Math.min(100, e.energy + 15), e.hitCooldown = 1, e.events.push({
		type: "stunt",
		text: "FULL ORBIT · +650"
	}));
}
function Jf(e, t) {
	let n = new THREE.Group();
	n.name = "Skate-only loops", e.add(n);
	let r = jf(t, { roughness: .78 }), i = new THREE.MeshStandardMaterial({
		color: "#f4dbba",
		emissive: "#e5b773",
		emissiveIntensity: .65
	});
	for (let e of Ld) {
		let t = [], a = [], o = [];
		for (let n = 0; n <= 180; n++) {
			for (let r of [-1, 1]) t.push(...Gf(e, n / 180, r * e.width / 2).p), a.push(...wd(e.s + e.length * n / 180, e.lane + r * e.width / 2));
			if (n < 180) {
				let e = n * 2;
				o.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);
			}
		}
		let s = new THREE.BufferGeometry();
		s.setAttribute("position", new THREE.Float32BufferAttribute(t, 3)), s.setAttribute("uv", new THREE.Float32BufferAttribute(a, 2)), s.setIndex(o), s.computeVertexNormals(), Af(s, Array.from({ length: s.attributes.position.count }, (t, n) => e.s + e.length * Math.floor(n / 2) / 180));
		let c = new THREE.Mesh(s, r);
		c.name = e.name, c.receiveShadow = !0, n.add(c);
		for (let t of [-1, 1]) {
			let r = new THREE.CatmullRomCurve3(Array.from({ length: 181 }, (n, r) => Gf(e, r / 180, t * e.width / 2).p));
			n.add(new THREE.Mesh(new THREE.TubeGeometry(r, 180, .07, 5, !1), i));
		}
	}
	return n;
}
//#endregion
//#region src/stunt-ramp.js
function Yf(e, t, n = Md) {
	let r = new THREE.Group();
	r.name = "Stunt ramps", e.add(r);
	let i = jf(t, { roughness: .78 }), a = new THREE.MeshStandardMaterial({
		color: "#eed3a0",
		emissive: "#e99e54",
		emissiveIntensity: .45,
		roughness: .45
	});
	for (let [e, t] of n.entries()) {
		let e = (e, n, r = 0) => {
			let i = t.s + e * t.length, a = of(i);
			return a.p.addScaledVector(a.side, n).addScaledVector(a.up, sf(i, n) + t.height * e * e + r);
		}, n = [], o = [], s = [];
		for (let r = 0; r <= 32; r++) {
			let i = r / 32;
			for (let [r, a] of [
				[t.lane - t.width / 2, -t.height * i * i - .08],
				[t.lane - t.width / 2, 0],
				[t.lane + t.width / 2, 0],
				[t.lane + t.width / 2, -t.height * i * i - .08]
			]) n.push(...e(i, r, a)), o.push(...wd(t.s + i * t.length, r));
		}
		for (let e = 0; e < 32; e++) for (let t = 0; t < 3; t++) {
			let n = e * 4 + t;
			s.push(n, n + 1, n + 4, n + 1, n + 5, n + 4);
		}
		s.push(128, 129, 130, 128, 130, 131);
		let c = new THREE.BufferGeometry();
		c.setAttribute("position", new THREE.Float32BufferAttribute(n, 3)), c.setAttribute("uv", new THREE.Float32BufferAttribute(o, 2)), c.setIndex(s), c.computeVertexNormals(), Af(c, Array.from({ length: c.attributes.position.count }, (e, n) => t.s + Math.floor(n / 4) / 32 * t.length));
		let l = new THREE.Mesh(c, i);
		l.name = t.name, l.castShadow = !0, l.receiveShadow = !0, r.add(l);
		for (let n of [-1, 1]) {
			let i = new THREE.CatmullRomCurve3(Array.from({ length: 33 }, (r, i) => e(i / 32, t.lane + n * t.width / 2, .06)));
			r.add(new THREE.Mesh(new THREE.TubeGeometry(i, 48, .055, 5, !1), a));
		}
		for (let n of [
			.25,
			.48,
			.71,
			.92
		]) {
			let i = [
				e(n - .045, t.lane - 1.5, .045),
				e(n + .035, t.lane, .045),
				e(n - .045, t.lane + 1.5, .045)
			];
			r.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(i), 12, .06, 5, !1), a));
		}
		let u = document.createElement("canvas");
		u.width = 768, u.height = 256;
		let d = u.getContext("2d");
		d.fillStyle = "#f2d6af", d.textAlign = "center", d.font = "bold 56px Arial", d.fillText(t.name, 384, 130);
		let f = new THREE.CanvasTexture(u);
		f.colorSpace = Xe;
		let p = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.6), new THREE.MeshBasicMaterial({
			map: f,
			transparent: !0,
			depthWrite: !1,
			side: 2
		})), m = of(t.s - 5);
		p.position.copy(m.p).addScaledVector(m.side, t.lane).addScaledVector(m.up, sf(t.s - 5, t.lane) + .04), p.quaternion.copy(m.quaternion), p.rotateY(-Math.PI / 2), p.rotateX(-Math.PI / 2), p.name = "Painted ramp label", r.add(p);
	}
	return r;
}
//#endregion
//#region src/jump.js
var Xf = {
	gravity: 14,
	platformGravity: 30,
	fieldHeight: 8.5,
	cooldown: .35,
	buffer: .24,
	coyote: .1
}, Zf = (e, t = !1, n = 29) => (e === "islands" ? Xf.platformGravity * Math.max(.8, n / 29) ** 2 : Xf.gravity) + (t ? e === "islands" ? 2 : 4 : 0), Qf = (e, t, n = !1) => t === "islands" ? 11.8 * Math.max(.8, e / 29) * Zf(t, n, e) / Zf(t, !1, e) : 7.5 + e * .025;
function $f(e, t) {
	let n = Qf(e.speed, e.route, e.gravityTime > 0);
	if (e.route !== "islands") return n;
	let r = Ed(e.s, e.lane, e.vehicle)?.tile, i = r && dd[r.id + 1];
	if (!i) return n;
	let a = (i.start - md(e.s) + 2) / Math.max(3, e.speed) * 1.04, o = (i.height - t + .3) / a + Zf(e.route, e.gravityTime > 0, e.speed) * a / 2;
	return Math.max(n, Math.min(16 * Math.max(.8, e.speed / 29), o));
}
function ep(e) {
	if (e.vehicle === "skate" && e.air && !e.air.trick && e.air.age > .12) return e.air.trick = {
		elapsed: 0,
		duration: e.route === "islands" ? .4 : .65
	}, e.events.push({
		type: "jump",
		text: "Kickflip · catch the board before landing"
	}), !0;
	if (e.air && !(e.air.platform && e.air.age <= Xf.coyote) || e.flight || e.jumpCooldown > 0 || e.speed < 3) return !1;
	let t = (Dd(e.s, e.lane, e.route, e.vehicle) ?? e.air?.height ?? 0) + (e.route === "main" ? Pd(e.s, e.lane, e.vehicle) : 0), n = e.route === "main" ? Nd(e.s, e.lane, e.vehicle) : null, r = n ? 2 * Math.sqrt(t * n.height) / n.length : 0;
	return e.jumpBuffer = 0, e.air = {
		height: t,
		launchSpeed: e.speed,
		vy: $f(e, t) + e.speed * r,
		age: 0,
		peak: t,
		ramp: n ? Math.floor(e.s / Od) + ":" + n.id : null
	}, e.events.push({
		type: "jump",
		text: "Airborne · steer gently, land inside the lane"
	}), !0;
}
function tp(e, t, n, r = e.lane) {
	if (!e.air && Dd(e.s, e.lane, e.route, e.vehicle) === null && (e.air = {
		height: Dd(t, r, e.route, e.vehicle) || 0,
		vy: 0,
		age: 0,
		peak: 0,
		platform: !0,
		fromTile: Ed(t, r, e.vehicle)?.tile?.id
	}), !e.air && e.route === "main") {
		let n = Math.floor(t / Od);
		for (let r of Id(e.vehicle)) {
			let i = n * Od + r.s + r.length;
			if (t < i && e.s >= i && Math.abs(e.lane - r.lane) < r.width / 2) {
				e.air = {
					height: r.height,
					vy: e.speed * 2 * r.height / r.length,
					age: 0,
					peak: r.height,
					ramp: n + ":" + r.id
				}, e.events.push({
					type: "jump",
					text: e.speed > 43 ? "BIG AIR · gravity sling on standby" : r.name + " · stick the landing"
				});
				break;
			}
		}
	}
	if (!e.air) return;
	let i = e.air, a = i.height;
	i.age += n, i.trick && (i.trick.elapsed += n), i.vy -= Zf(e.route, e.gravityTime > 0, i.launchSpeed ?? e.speed) * n, i.height += i.vy * n, i.peak = Math.max(i.peak, i.height);
	let o = Dd(e.s, e.lane, e.route, e.vehicle);
	o === null && (i.crossedGap = !0);
	let s = Ed(e.s, e.lane, e.vehicle)?.tile, c = !1, l = o === null ? null : o + (e.route === "main" ? Pd(e.s, e.lane, e.vehicle) : 0);
	if (e.route === "islands" && i.vy <= 0) {
		let n = np(t, e.s, r, e.lane, a, i.height, e.vehicle, i.platform ? i.fromTile : void 0);
		if (n) {
			if (n.blocked) {
				e.s = Math.max(t, n.s), e.lane = n.lane, zf(e, t);
				let r = e.flight;
				r.velocity.addScaledVector(r.forward, -1.25 * r.velocity.dot(r.forward)), e.hits++, e.events.push({
					type: "hit",
					text: "Clipped the platform face · gravity sling to recover"
				});
				return;
			}
			e.s = Math.max(t, Math.min(e.s, n.s)), e.lane = n.lane, s = n.tile, c = !0, o = l = Dd(e.s, e.lane, e.route, e.vehicle) ?? n.height, i.height = l;
		}
	}
	if (i.height > Xf.fieldHeight && e.gravityTime <= 0 || i.height < -5) {
		zf(e);
		return;
	}
	let u = i.ramp || "island:" + Math.floor(e.s / 1450) + ":" + (s?.id ?? "exit");
	if (l !== null && i.vy < 0 && i.height <= l && (e.route !== "islands" || c)) {
		if (e.air = null, e.groundedS = e.s, e.groundedRoute = e.route, e.jumpCooldown = e.route === "islands" ? 0 : Xf.cooldown, i.trick) if (i.trick.elapsed >= i.trick.duration) e.score += 300, e.tricks++, e.route !== "islands" && (e.surge = Math.max(e.surge, 2.3)), e.energy = Math.min(100, e.energy + 12), e.events.push({
			type: "stunt",
			text: "KICKFLIP · +300"
		});
		else {
			e.speed *= .55, e.events.push({
				type: "hit",
				text: "Sketchy landing · finish the flip higher up"
			});
			return;
		}
		if (e.hitCooldown = Math.max(e.hitCooldown, .25), (i.ramp || e.route === "islands" && i.crossedGap) && !e.stuntsCollected.has(u)) {
			e.stuntsCollected.add(u), e.stunts++, e.route !== "islands" && (e.surge = Math.max(e.surge, 1.8));
			let t = 250 + Math.round(i.age * 100);
			e.score += t, e.energy = Math.min(100, e.energy + 10), e.events.push({
				type: "stunt",
				text: `Clean landing · +${t} · +10 stardust`
			});
		} else i.trick || e.events.push({
			type: "land",
			text: "Wheels down. Keep your line."
		});
	}
}
function np(e, t, n, r, i, a, o, s) {
	let c = Math.min(64, Math.max(2, Math.ceil(Math.abs(t - e) / .35), Math.ceil(Math.abs(a - i) / .3))), l = null;
	for (let u = 0; u <= c; u++) {
		let d = u / c, f = e + (t - e) * d, p = n + (r - n) * d, m = i + (a - i) * d, h = Ed(f, p, o);
		if (h && (s === void 0 || h.tile?.id !== s)) {
			let e = m - h.height, t = !l || l.tile !== h.tile;
			if (e <= .35 && e >= (t ? -1.8 : -.35) || l && l.clearance >= 0 && e <= 0) return {
				...h,
				s: f,
				lane: p
			};
			if (t && h.tile && e < -1.8 && e > -5) return {
				...h,
				s: f,
				lane: p,
				blocked: !0
			};
			l = {
				tile: h.tile,
				clearance: e
			};
		} else l = null;
	}
	return null;
}
//#endregion
//#region src/race.js
var rp = Math.PI * 2, ip = Od, ap = [
	{
		name: "Sol",
		color: "#e7d8b4",
		accent: "#d86a43",
		role: "The all-rounder",
		speed: 0,
		handling: 1,
		boost: 1
	},
	{
		name: "Ciel",
		color: "#577fb0",
		accent: "#ead8a0",
		role: "The corner poet",
		speed: -1,
		handling: 1.2,
		boost: .92
	},
	{
		name: "Ember",
		color: "#ce5537",
		accent: "#9bc4bc",
		role: "The comet chaser",
		speed: 1,
		handling: .91,
		boost: 1.12
	}
], op = (e, t, n) => Math.max(t, Math.min(n, e)), sp = /* @__PURE__ */ new Map();
function cp(e = "painted") {
	if (sp.has(e)) return sp.get(e);
	let t = [], n = 0;
	for (let e = 0; e < 96; e++) {
		let r = 25 + e * (ip - 35) / 96;
		if (r >= Y.start && r < Y.end) for (let i of [
			"upper",
			"main",
			"lower"
		]) t.push({
			s: r,
			lane: Math.sin(e * .57) * 1.8,
			route: i,
			kind: i === "main" && e % 4 == 0 ? "meteor" : "dust",
			id: n++
		});
		else r >= ud.start && r < ud.end ? (t.push({
			s: r,
			lane: Math.sin(e) * 2,
			route: "bypass",
			kind: "dust",
			id: n++
		}), _d(r, "islands") !== null && t.push({
			s: r,
			lane: Math.sin(e) * 3,
			route: "islands",
			kind: "dust",
			id: n++
		})) : t.push({
			s: r,
			lane: Math.sin(e * .57) * 7.8,
			route: "main",
			kind: e % 13 == 8 ? "meteor" : "dust",
			id: n++
		});
	}
	return sp.set(e, t), t;
}
function lp({ rider: e = 0, mode: t = "cup", difficulty: n = "racer", vehicle: r = "bike", courseId: i = "painted", equipment: a = "balanced", round: o = 0 } = {}) {
	let s = Bd(i), c = zd[Vd(n)];
	return {
		groundedS: null,
		groundedRoute: null,
		gravityRescueReady: !1,
		heading: 0,
		steerRate: 0,
		route: "main",
		gatesPassed: 0,
		courseId: s.id,
		round: o,
		equipment: a,
		difficulty: Vd(n),
		rules: c,
		course: s,
		hits: 0,
		edgeTime: 0,
		edgeWarning: !1,
		shortcutTime: 0,
		shortcut: !1,
		recording: [],
		recordClock: 0,
		vehicle: r === "skate" ? "skate" : "bike",
		loop: null,
		loops: 0,
		tricks: 0,
		air: null,
		jumpHeld: !1,
		jumpCooldown: 0,
		jumpBuffer: 0,
		stunts: 0,
		stuntsCollected: /* @__PURE__ */ new Set(),
		checkpointsCollected: /* @__PURE__ */ new Set(),
		gravityCharges: c.charges,
		gravityTime: 0,
		gravityHeld: !1,
		flight: null,
		phase: "menu",
		rider: e,
		mode: t,
		laps: t === "trial" ? s.trialLaps : s.laps,
		s: 0,
		lane: 0,
		lateral: 0,
		speed: 0,
		time: 0,
		energy: 55,
		dust: 0,
		score: 0,
		surge: 0,
		resonance: 0,
		resonanceChain: 0,
		nearMisses: 0,
		lean: 0,
		boostTime: 0,
		draftTime: 0,
		boosting: !1,
		drafting: !1,
		combo: 0,
		comboTime: 0,
		hitCooldown: 0,
		respawns: 0,
		lap: 1,
		checkpoint: 0,
		countdown: 3.2,
		place: 6,
		bestLap: Infinity,
		lapStart: 0,
		lapTimes: [],
		collected: /* @__PURE__ */ new Set(),
		rivals: Array.from({ length: t === "trial" ? 0 : 5 }, (e, t) => ({
			route: "main",
			air: null,
			name: [
				"LYRA",
				"IO",
				"ATLAS",
				"NOVA",
				"ORION"
			][t],
			s: 9 + t * 5,
			lane: (t % 3 - 1) * 4.5,
			speed: 0,
			seed: t,
			finished: !1,
			energy: 55,
			hitCooldown: 0,
			lateral: 0
		})),
		events: [],
		end: null
	};
}
function up(e) {
	e.phase = "countdown", e.events.push({
		type: "countdown",
		text: "Find your rhythm."
	});
}
function dp(e) {
	return e.phase === "racing" || e.phase === "countdown" ? (e.resumePhase = e.phase, e.phase = "paused", !0) : e.phase === "paused" ? (e.phase = e.resumePhase, e.resumePhase = null, !0) : !1;
}
var fp = xf;
function pp(e, t, n) {
	if (n = op(n, 0, .05), e.events.length = 0, e.phase === "countdown") {
		let t = Math.ceil(e.countdown);
		e.countdown -= n, Math.ceil(e.countdown) !== t && e.events.push({ type: "tick" }), e.countdown <= 0 && (e.phase = "racing", e.events.push({
			type: "go",
			text: "Leave a little stardust."
		}));
		return;
	}
	if (e.phase !== "racing") return;
	let r = e.lane, i = ap[e.rider], a = Gd.find((t) => t.id === e.equipment) || Gd[0], o = e.s, s = Math.floor(o / ip);
	e.time += n, e.recordClock += n, e.mode === "trial" && e.recordClock >= .2 && (e.recordClock = 0, e.recording.length < 6e3 && e.recording.push([
		+e.time.toFixed(3),
		+e.s.toFixed(2),
		+e.lane.toFixed(2),
		+(e.air?.height ?? (Dd(e.s, e.lane, e.route, e.vehicle) || 0) + (e.route === "main" ? Pd(e.s, e.lane, e.vehicle) : 0)).toFixed(2),
		e.flight || e.loop ? 1 : 0,
		pd.indexOf(e.route)
	])), e.surge = Math.max(0, e.surge - n), e.hitCooldown = Math.max(0, e.hitCooldown - n), e.comboTime = Math.max(0, e.comboTime - n), e.comboTime || (e.combo = 0), e.jumpCooldown = Math.max(0, e.jumpCooldown - n);
	let c = !!t.jump && !e.jumpHeld;
	e.jumpHeld = !!t.jump;
	let l = !!t.gravity && !e.gravityHeld;
	if (e.gravityHeld = !!t.gravity, e.gravityTime = Math.max(0, e.gravityTime - n), l && !e.loop && Hf(e), e.loop) {
		qf(e, t, n, c, l), gp(e, n, !1), e.place = fp(e);
		return;
	}
	if (e.flight) {
		gp(e, n, !1), Uf(e, n, t) && mp(e, o), e.place = fp(e);
		return;
	}
	!e.air && Dd(e.s, e.lane, e.route, e.vehicle) !== null && (e.groundedS = e.s, e.groundedRoute = e.route), e.jumpBuffer = Math.max(0, (e.jumpBuffer || 0) - n), c && (e.air && e.air.vy > 0 || e.air?.platform && e.air.age <= Xf.coyote ? ep(e) : e.jumpBuffer = Xf.buffer), e.jumpBuffer > 0 && !e.air && ep(e) && (e.jumpBuffer = 0), e.drafting = !e.air && e.rivals.some((t) => (t.route || "main") === e.route && !t.air && t.s - e.s > 1.8 && t.s - e.s < 20 && Math.abs(t.lane - e.lane) < 2.1), e.boosting = !e.air && !!t.pedal && !!t.boost && e.energy > (e.boosting ? .4 : 8) && e.speed > 5, e.pushing = !!t.pedal;
	let u = +!!t.pedal, d = +!!t.brake, f = u ? 34 + i.speed + a.speed + (e.vehicle === "bike" ? 1.4 : -.5) + (e.route === "upper" ? 9 : e.route === "lower" ? 6 : 0) * hd(Math.min(md(e.s) - Y.start, Y.end - md(e.s)) / 18) + (e.drafting ? e.vehicle === "bike" ? 6.5 : 4 : 0) + (e.boosting ? 20 * i.boost * a.boost : 0) + (e.surge > 0 && e.route !== "islands" ? 12 : 0) : 0;
	e.air ? e.speed += (-e.speed * .06 - d * 16) * n : u ? e.speed += ((f - e.speed) * .55 - d * 23) * n : e.speed = e.speed * Math.exp(-n * (d ? 8 : 3.8)) - (d ? 10 : 1.2) * n, e.speed = op(e.speed, 0, 61), e.boosting ? (e.energy -= 20 * n, e.boostTime += n) : e.energy += n * (e.drafting ? 9 : 1.1), e.energy = op(e.energy, 0, 100), e.drafting && (e.draftTime += n, e.score += n * 8);
	let p = Wf(e.s, 42, e.route);
	!e.air && Math.abs(p) > 3.5 && e.speed > 38 && !e.boosting && (e.speed -= Math.abs(p) * n * .08);
	let m = op(t.steer || 0, -1, 1), h = i.handling * a.handling * (e.vehicle === "skate" ? 1.08 : 1);
	e.steerRate = m * (1.15 + Math.min(e.speed, 45) * .015) * Math.min(1, 35 / Math.max(1, e.speed)) * h * op(e.speed / 10, 0, 1) * (e.air ? .7 : 1), e.heading = (e.heading || 0) + e.steerRate * n;
	let g = cf(e.s, e.route), _ = g.tangent.clone().multiplyScalar(Math.cos(e.heading)).addScaledVector(g.side, Math.sin(e.heading));
	e.lateral = Math.sin(e.heading) * e.speed, e.lane += e.lateral * n;
	let v = op(e.steerRate * .18, -.24, .24) * op(e.speed / 12, 0, 1);
	e.lean += (v - e.lean) * (1 - Math.exp(-n * 9));
	let y = gd(e.s, e.route).half;
	if (e.gravityTime > 0) e.lane = op(e.lane, -y + .35, y - .35), Math.abs(e.lane) >= y - .35 && (e.lateral = 0);
	else if (Math.abs(e.lane) > y - .45) {
		if (e.edgeTime += n, e.edgeWarning = !0, e.speed = Math.max(0, e.speed - 3 * n), e.edgeTime > e.rules.edgeGrace || Math.abs(e.lane) > y + 1.5) {
			zf(e), gp(e, n, !1);
			return;
		}
	} else e.edgeTime = 0, e.edgeWarning = !1;
	if (e.shortcut = e.route === "upper" || e.route === "lower", e.s += e.speed * n * lf(e.s, e.route) * Math.max(0, Math.cos(e.heading)), e.shortcut && (e.shortcutTime += n), yd(e, o), e.s !== o) {
		let t = cf(e.s, e.route);
		e.heading = Math.atan2(_.dot(t.side), _.dot(t.tangent));
	}
	for (let t of [Y, ud]) {
		let n = s * ip + t.start - 28;
		o < n && e.s >= n && e.events.push({
			type: "route",
			text: t === Y ? "SPLIT AHEAD · left climbs / right dives" : "OPAL STEPS · left to jump / right to bypass"
		});
	}
	if (e.route === "main" && Kf(e, o)) {
		gp(e, n, !1);
		return;
	}
	if (tp(e, o, n, r), e.jumpBuffer > 0 && !e.air && !e.flight && ep(e) && (e.jumpBuffer = 0), e.flight) {
		gp(e, n, !1);
		return;
	}
	gp(e, n, !e.air || e.air.height < 1.5);
	for (let t of cp(e.courseId)) if (t.route === e.route) for (let n = s; n <= Math.floor(e.s / ip); n++) {
		let r = t.s + n * ip, i = n + ":" + t.id;
		if (!(e.air && e.air.height > 1.6 || r < o - .8 || r > e.s + .8 || e.collected.has(i) || Math.abs((t.kind === "meteor" ? jd(t, e.time) : t.lane) - e.lane) > (t.kind === "dust" ? 1.8 : 1.35))) if (e.collected.add(i), t.kind === "meteor") e.hitCooldown <= 0 && (e.hits++, e.speed *= e.difficulty === "explorer" ? .75 : .56, e.energy = Math.max(0, e.energy - 14), e.combo = 0, e.hitCooldown = 1.4, e.events.push({
			type: "hit",
			text: "Moon rock! Find a clear line."
		}));
		else {
			e.dust++, e.energy = op(e.energy + 7, 0, 100), e.combo++, e.comboTime = 3.6;
			let t = 1 + Math.min(3, Math.floor(e.combo / 4));
			e.score += 60 * t, e.events.push({
				type: "dust",
				mult: t
			});
		}
	}
	for (let t of Ad) {
		if (e.route !== "main") continue;
		let n = s * ip + t.s;
		if (o < n && e.s >= n) if ((!e.air || e.air.height < 2.7) && Math.abs(e.lane - t.lane) < 2.7) {
			e.resonance++, e.resonanceChain++, e.surge = 2.6, e.energy = op(e.energy + 12, 0, 100);
			let t = 200 + Math.min(e.resonanceChain, 5) * 100;
			e.score += t, e.events.push({
				type: "resonance",
				text: `Crystal resonance ×${e.resonanceChain} · +${t} · free surge`
			});
		} else e.resonanceChain = 0;
	}
	for (let t of cp(e.courseId)) {
		if (t.kind !== "meteor" || t.route !== e.route) continue;
		let n = s * ip + t.s;
		if (o < n && e.s >= n) {
			let n = Math.abs(jd(t, e.time) - e.lane);
			!e.air && n > 1.5 && n < 3.3 && e.hitCooldown <= 0 && (e.nearMisses++, e.energy = op(e.energy + 5, 0, 100), e.score += 125, e.events.push({
				type: "nearMiss",
				text: "Close orbit · +125 · +5 stardust"
			}));
		}
	}
	for (let t of fd) {
		let n = s * ip + t.s;
		if (o < n && e.s >= n && !e.checkpointsCollected.has(n)) if (e.route === "main" && Math.abs(e.lane) < 12 && (e.air?.height || 0) < 11) e.checkpointsCollected.add(n), e.checkpoint++, e.gatesPassed++, e.energy = op(e.energy + 10, 0, 100), e.score += 150, e.events.push({
			type: "gate",
			gate: t.s,
			text: t.name + " · +10 stardust"
		});
		else {
			e.s = n - 5, zf(e), e.events.push({
				type: "missedGate",
				text: "Missed checkpoint · gravity sling back to the approach"
			});
			return;
		}
	}
	mp(e, o);
}
function mp(e, t) {
	let n = Math.floor(t / ip), r = Math.floor(e.s / ip);
	if (r > n && r >= e.lap) {
		e.gravityCharges = Math.min(e.rules.charges, e.gravityCharges + 1);
		let t = e.time - e.lapStart;
		e.lapTimes.push(t), e.bestLap = Math.min(e.bestLap, t), e.lapStart = e.time, e.lap = r + 1, e.events.push({
			type: "lap",
			text: r === e.laps - 1 ? "Final orbit. Make it beautiful." : "One orbit closer."
		});
	}
	if (e.place = e.mode === "trial" ? 1 : fp(e), e.mode !== "free" && e.s >= e.laps * ip) {
		e.s = e.laps * ip, e.lap = e.laps, e.phase = "finished", e.place = fp(e), e.boosting = !1;
		let t = e.mode === "trial" ? e.time < e.laps * ip / 37 ? "gold" : e.time < e.laps * ip / 31 ? "silver" : "bronze" : e.place === 1 ? "gold" : e.place <= 3 ? "silver" : "bronze", n = [
			e.dust >= 25,
			e.draftTime >= 8,
			e.boostTime >= 10
		];
		e.score = Math.round(e.score + n.filter(Boolean).length * 750 + (7 - e.place) * 400), e.end = {
			medal: t,
			goals: n,
			place: e.place,
			time: e.time,
			score: e.score
		}, e.events.push({
			type: "finish",
			text: "An orbit to remember."
		});
	}
}
function hp(e) {
	return Number.isFinite(e) ? `${Math.floor(e / 60)}:${(e % 60).toFixed(2).padStart(5, "0")}` : "—";
}
function gp(e, t, n) {
	for (let r of e.rivals) {
		if (r.finished) continue;
		let i = md(r.s), a = gd(r.s, r.route).half, o = cp(e.courseId).filter((e) => e.route === r.route), s = o.find((e) => e.kind === "meteor" && e.s - i > 0 && e.s - i < 28), c = o.find((e) => e.kind === "dust" && e.s - i > 0 && e.s - i < 24), l = Md.some((e) => i > e.s - 25 && i < e.s + e.length + 8), u = bd(r.s, r.seed, Math.floor(r.s / ip)), d = u ?? (l ? 0 : c ? c.lane : Math.sin(r.s * .007 + r.seed * 1.8) * a * .55), f = Math.sin(e.time * .37 + r.seed * 3.7) > 1 - e.rules.mistakes;
		u === null && s && Math.abs(d - jd(s, e.time)) < 2.8 && !f && (d = op(jd(s, e.time) + (r.seed % 2 ? 3.1 : -3.1), -a + .7, a - .7));
		let p = [...e.rivals.filter((e) => e !== r), e].find((e) => e.route === r.route && e.s > r.s && e.s - r.s < 18 && Math.abs(e.lane - r.lane) < 2.1), m = !!p;
		u === null && p && p.s - r.s < 4 && (d = op(p.lane + (r.seed % 2 ? 2.4 : -2.4), -a + .6, a - .6)), r.energy = r.energy ?? 55, r.hitCooldown = Math.max(0, (r.hitCooldown || 0) - t), r.boosting = !r.air && !f && r.speed > 5 && r.energy > (r.boosting ? 1 : 25) && !l && r.route !== "islands";
		let h = r.route === "islands" || i > ud.start - 35 && i < ud.start && r.seed % 3 != 0, g = h ? 28.5 : (34 + (e.vehicle === "bike" ? 1.4 : -.5) + (r.seed % 3 - 1)) * e.rules.ai + (r.route === "upper" ? 9 : r.route === "lower" ? 6 : 0) + (m ? e.vehicle === "bike" ? 6.5 : 4 : 0) + (r.boosting ? 20 : 0);
		if (r.cornerClock = (r.cornerClock || 0) - t, r.cornerClock <= 0) {
			r.cornerClock = .25;
			let e = 0;
			for (let t of [
				0,
				8,
				20
			]) {
				let n = cf(r.s + t, r.route), i = cf(r.s + t + 2, r.route);
				e = Math.max(e, Math.abs(Math.atan2(i.tangent.dot(n.side), i.tangent.dot(n.tangent))) / 2 * lf(r.s + t, r.route));
			}
			r.cornerSpeed = Math.max(14, .8 / Math.max(.001, e));
		}
		g = Math.min(g, r.cornerSpeed), r.speed > r.cornerSpeed + 1 && (r.speed = Math.max(0, r.speed - 18 * t)), r.speed += (g - r.speed) * Math.min(1, t * .55) - (h && r.speed > 29 ? 23 * t : 0), r.energy = op(r.energy + (r.boosting ? -20 : m ? 9 : 1.1) * t, 0, 100);
		let _ = op((d - r.lane) * (f ? .3 : e.difficulty === "expert" ? 1.1 : .7), -1, 1) * (4 + r.speed * .115) * (e.vehicle === "skate" ? 1.16 : 1);
		r.lateral = (r.lateral || 0) + (_ - (r.lateral || 0)) * Math.min(1, t * 7), r.lane = op(r.lane + r.lateral * t, -a + .25, a - .25), r.lean = op(r.lateral * .03, -.24, .24);
		let v = r.s;
		if (r.route === "islands" && !r.air) {
			let e = dd.find((e) => i >= e.start && i < e.end);
			e && e.end - i < Math.max(5.8, r.speed * .22) && (r.air = {
				height: _d(r.s, r.route),
				launchSpeed: r.speed,
				vy: Qf(r.speed, r.route),
				age: 0
			});
		}
		if (r.s += r.speed * t * lf(r.s, r.route), yd(r, v), r.air) {
			r.air.age += t, r.air.vy -= Zf(r.route, !1, r.air.launchSpeed) * t, r.air.height += r.air.vy * t;
			let e = _d(r.s, r.route);
			e !== null && _d(v, r.route) === null && r.air.height < e - .55 ? (r.s = vd(v, r.route), r.air = null, r.speed *= .55, r.energy = Math.max(0, r.energy - 12), r.recoveries = (r.recoveries || 0) + 1) : e !== null && r.air.vy < 0 && r.air.height <= e ? (r.air = null, r.energy = op(r.energy + 10, 0, 100)) : r.air.height < -4 && (r.speed *= .65, r.air = null, r.s = vd(r.s, r.route), r.lane = 0, r.recoveries = (r.recoveries || 0) + 1);
		}
		r.finished = e.mode !== "free" && r.s >= e.laps * ip, r.finished && (r.s = e.laps * ip, r.finishTime = e.time, r.speed = 0);
		for (let t of o) {
			let n = Math.floor(v / ip) * ip + t.s;
			if (v < n && r.s >= n && !r.air) {
				let n = t.kind === "meteor" ? jd(t, e.time) : t.lane;
				Math.abs(r.lane - n) < (t.kind === "dust" ? 1.8 : 1.35) && (t.kind === "dust" ? r.energy = op(r.energy + 7, 0, 100) : r.hitCooldown ||= (r.speed *= .6, r.energy = Math.max(0, r.energy - 14), 1.4));
			}
		}
		for (let e of fd) v < Math.floor(v / 1450) * 1450 + e.s && r.s >= Math.floor(v / 1450) * 1450 + e.s && (r.energy = op(r.energy + 10, 0, 100));
		n && !r.air && r.route === e.route && Math.abs(r.s - e.s) < 1.35 && Math.abs(r.lane - e.lane) < .72 && e.hitCooldown <= 0 && (e.hits++, e.speed *= .8, r.speed *= .9, e.hitCooldown = 1.2, e.combo = 0, e.events.push({
			type: "hit",
			text: "Contact · recover your line"
		}));
	}
}
//#endregion
//#region src/landscape.js
var _p = new THREE.Color(), vp = new THREE.Vector3(), yp = new THREE.Object3D();
function bp() {
	let e = [], t = [], n = [], r = [], i = [
		[0, .65],
		[.14, .9],
		[.84, .7],
		[1, .05]
	], a = [
		"#68a7a3",
		"#93c8ba",
		"#c7aed8",
		"#e1ceb6",
		"#597c85",
		"#c58e98"
	];
	for (let r = 0; r < i.length; r++) for (let o = 0; o < 6; o++) {
		let [s, c] = i[r], l = o * rp / 6 + .12;
		e.push(Math.cos(l) * c + s * s * .12, s, Math.sin(l) * c), n.push(o / 6, s), _p.set(a[o]), t.push(_p.r, _p.g, _p.b);
	}
	for (let e = 0; e < i.length - 1; e++) for (let t = 0; t < 6; t++) {
		let n = e * 6 + t, i = e * 6 + (t + 1) % 6;
		r.push(n, i, n + 6, i, i + 6, n + 6);
	}
	for (let e = 1; e < 5; e++) {
		r.push(0, e + 1, e);
		let t = (i.length - 1) * 6;
		r.push(t, t + e, t + e + 1);
	}
	for (let e = 0; e < r.length; e += 3) [r[e + 1], r[e + 2]] = [r[e + 2], r[e + 1]];
	let o = new THREE.BufferGeometry();
	o.setAttribute("position", new THREE.Float32BufferAttribute(e, 3)), o.setAttribute("color", new THREE.Float32BufferAttribute(t, 3)), o.setAttribute("uv", new THREE.Float32BufferAttribute(n, 2)), o.setIndex(r);
	let s = o.toNonIndexed();
	return s.computeVertexNormals(), s;
}
function xp(e, t, n, r, i, a = null, o = null, s = null) {
	let c = 7931, l = () => (c = c * 16807 % 2147483647, c / 2147483647), u = [], d = [], f = [], p = [], m = [], h = kd.start * ip, g = kd.end * ip;
	for (let e = 0; e < 2; e++) for (let t = 0; t <= 120; t++) {
		let n = t / 120, r = h + (g - h) * n, i = of(r), a = (Math.abs(n - .5) * 2) ** 8;
		for (let t = 0; t <= 48; t++) {
			let o = t / 48 * rp, s = Math.sin(o * 5 + r * .031) * .7 + Math.cos(o * 9 - r * .048) * .35, c = 24 + s + (e ? 9 : 0) + a * 4, l = 19 + s + (e ? 10 : 0) + a * 3, p = i.p.clone().addScaledVector(i.side, Math.cos(o) * c).addScaledVector(i.up, 8 + Math.sin(o) * l);
			u.push(...p), m.push(r), d.push(n * 8, t / 48 * 3), _p.set(e ? "#ac7869" : "#4e777a").lerp(new THREE.Color(e ? "#d3a286" : "#b1a2b4"), .5 + .5 * Math.sin(o * 3 + r * .025)), f.push(_p.r, _p.g, _p.b);
		}
	}
	let _ = 5929;
	for (let e = 0; e < 2; e++) for (let t = 0; t < 120; t++) for (let n = 0; n < 48; n++) {
		let r = e * _ + t * 49 + n;
		p.push(r, r + 1, r + 49, r + 1, r + 49 + 1, r + 49);
	}
	for (let e of [0, 120]) for (let t = 0; t < 48; t++) {
		let n = e * 49 + t;
		p.push(n, n + _, n + 1, n + 1, n + _, n + _ + 1);
	}
	let v = new THREE.BufferGeometry();
	v.setAttribute("position", new THREE.Float32BufferAttribute(u, 3)), v.setAttribute("uv", new THREE.Float32BufferAttribute(d, 2)), v.setAttribute("color", new THREE.Float32BufferAttribute(f, 3)), v.setIndex(p), v.computeVertexNormals();
	let y = t.clone();
	y.repeat.set(1, 1), y.needsUpdate = !0, Af(v, m), v.addGroup(0, 11520 * 6, 0), v.addGroup(11520 * 6, p.length - 11520 * 6, 1);
	let b = new THREE.Mesh(v, [jf(y, { bumpScale: .14 }), new THREE.MeshStandardMaterial({
		color: "#ada4c2",
		roughness: .78,
		side: 2
	})]);
	b.name = "Painted crystal heart", b.receiveShadow = !0, b.castShadow = !0, e.add(b), b.visible = i.geode, e.updateMatrixWorld(!0);
	let x = Array.from({ length: 37 }, (e, t) => of(h + (g - h) * t / 36).p.addScaledVector(of(h + (g - h) * t / 36).up, 8));
	(i.geode ? [n, ...e.children.filter((e) => e.userData.decorativeRing)] : []).forEach((e) => e.traverse((e) => {
		if (!e.isMesh) return;
		let t = e.geometry.clone(), n = t.attributes.position, r = t.index, i = [];
		for (let t = 0; t < (r ? r.count : n.count); t += 3) {
			let a = [
				0,
				1,
				2
			].map((e) => r ? r.getX(t + e) : t + e);
			vp.set(0, 0, 0);
			for (let t of a) vp.add(new THREE.Vector3().fromBufferAttribute(n, t).applyMatrix4(e.matrixWorld));
			vp.multiplyScalar(1 / 3), x.some((e) => e.distanceToSquared(vp) < 961) || i.push(...a);
		}
		t.setIndex(i), e.geometry = t;
	}));
	let S = bp(), C = new THREE.MeshPhysicalMaterial({
		color: "#b9a3e1",
		roughness: .22,
		metalness: .25,
		clearcoat: .8,
		emissive: "#8552c2",
		emissiveIntensity: .65
	}), w = new THREE.Group();
	w.name = "Crystal garden";
	let T = [], E = [], D = [], ee = [];
	for (let e = 0; e < 84; e++) {
		let t = of(h + 18 + l() * (g - h - 36)), n = e % 4 == 0, r = (e % 2 ? 1 : -1) * (n ? 8 + l() * 9 : 18 + l() * 3), i = Math.sqrt(1 - (r / 24) ** 2), a = 8 + (n ? 1 : -1) * 19 * i, o = new THREE.Vector3(0, (n ? -1 : 1) * i / 19, -r / 576).normalize();
		yp.position.copy(t.p).addScaledVector(t.side, r).addScaledVector(t.up, a);
		let s = o.clone().applyQuaternion(t.quaternion);
		yp.position.addScaledVector(s, -1.3), yp.quaternion.copy(t.quaternion).multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), o)), yp.rotateY(l() * rp);
		let c = .55 + l() * .4;
		yp.scale.set(c, c * (.95 + l() * .32), c), yp.updateMatrix(), T.push(yp.matrix.clone()), _p.set([
			"#b89de8",
			"#65cbbb",
			"#d893b8",
			"#d9bf89"
		][Math.floor(e / 2) % 4]), E.push(_p.clone()), ee.push(..._p), D.push(...new THREE.Vector3(0, 4.6, 0).applyMatrix4(yp.matrix));
	}
	o.updateMatrixWorld(!0), o.traverse((e) => {
		if (!e.isMesh) return;
		let t = e.geometry.clone().applyMatrix4(e.matrixWorld), n = e.material.name, r = n.includes("Matrix"), i = n.includes("Tip"), o = new THREE.MeshStandardMaterial({
			color: r ? "#6e5b83" : "#ffffff",
			map: r ? a : null,
			bumpMap: a,
			bumpScale: r ? .06 : .012,
			roughness: r ? .95 : i ? .18 : .32,
			metalness: r ? 0 : .28,
			emissive: r ? "#000000" : i ? "#d5b4ff" : "#49325e",
			emissiveIntensity: i ? 1.5 : .38
		});
		r || (o.onBeforeCompile = (e) => {
			e.vertexShader = "varying vec3 mineralPoint;\n" + e.vertexShader, e.vertexShader = e.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nmineralPoint=position;"), e.fragmentShader = "varying vec3 mineralPoint;\n" + e.fragmentShader, e.fragmentShader = e.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb*=.88+.12*sin(mineralPoint.y*21.+sin(mineralPoint.x*8.)*2.);"), e.fragmentShader = e.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif");
		});
		let s = new THREE.InstancedMesh(t, o, 84);
		s.name = n, s.castShadow = !0, s.receiveShadow = !0;
		for (let e = 0; e < 84; e++) s.setMatrixAt(e, T[e]), s.setColorAt(e, E[e]);
		w.add(s);
	}), e.add(w), w.visible = i.geode;
	let te = new THREE.BufferGeometry();
	te.setAttribute("position", new THREE.Float32BufferAttribute(D, 3)), te.setAttribute("color", new THREE.Float32BufferAttribute(ee, 3));
	let O = new THREE.Points(te, new THREE.PointsMaterial({
		map: s,
		size: 3.5,
		vertexColors: !0,
		transparent: !0,
		opacity: .35,
		blending: 2,
		depthWrite: !1
	}));
	w.add(O);
	let ne = new THREE.IcosahedronGeometry(1, 2), k = ne.attributes.position;
	for (let e = 0; e < k.count; e++) {
		let t = k.getX(e), n = k.getY(e), r = k.getZ(e), i = 1 + .09 * Math.sin(t * 5 + r * 3) * Math.cos(n * 4);
		k.setXYZ(e, t * i, n * i * .89, r * i);
	}
	let A = new THREE.InstancedMesh(ne, new THREE.MeshStandardMaterial({
		map: t,
		color: "#a68577",
		roughness: 1
	}), 330);
	A.name = "Layered ring escarpment", A.receiveShadow = !0;
	for (let e = 0; e < 330; e++) {
		let t = of(e / 330 * ip), n = e % 2 ? 1 : -1;
		yp.position.copy(t.p).addScaledVector(t.side, n * (13.5 + l() * 2)).addScaledVector(t.up, -.75 - l() * .8), yp.quaternion.copy(t.quaternion), yp.rotateY(l() * rp), yp.scale.set(1.3 + l() * 2, .5 + l() * .7, .7 + l()), yp.updateMatrix(), A.setMatrixAt(e, yp.matrix);
	}
	e.add(A), A.visible = !1;
	let re = new THREE.InstancedMesh(r || ne, new THREE.MeshStandardMaterial({
		map: a,
		bumpMap: a,
		bumpScale: .08,
		color: "#9993b3",
		roughness: .95
	}), 72);
	re.receiveShadow = !0, re.castShadow = !0;
	for (let e = 0; e < 72; e++) {
		let t = of(e < 36 ? h : g), n = (e % 36 + Math.sin(e * 2.73) * .18) / 36 * rp;
		yp.position.copy(t.p).addScaledVector(t.side, Math.cos(n) * 30).addScaledVector(t.up, 8 + Math.sin(n) * 25), yp.quaternion.copy(t.quaternion), yp.rotateY(l() * rp), yp.scale.set(2.2 + l() * 1.5, 1.5 + l() * 1.5, 1.8 + l() * 1.7), yp.updateMatrix(), re.setMatrixAt(e, yp.matrix);
	}
	e.add(re), re.visible = i.geode;
	let ie = new THREE.MeshStandardMaterial({
		color: "#e7d0a1",
		emissive: "#dbaf65",
		emissiveIntensity: 2.2,
		roughness: .3,
		metalness: .4
	}), ae = new THREE.TorusGeometry(2.7, .075, 8, 80), oe = [];
	Ad.forEach((t, n) => {
		let r = of(t.s), a = new THREE.Group();
		a.position.copy(r.p).addScaledVector(r.side, t.lane).addScaledVector(r.up, 2.9), a.quaternion.copy(r.quaternion);
		let o = new THREE.Mesh(ae, ie.clone());
		o.rotation.y = Math.PI / 2, a.add(o);
		let s = new THREE.Mesh(ae, new THREE.MeshBasicMaterial({
			color: "#ffdca0",
			transparent: !0,
			opacity: .2,
			blending: 2,
			depthWrite: !1
		}));
		s.rotation.copy(o.rotation), s.scale.setScalar(1.035), a.add(s);
		for (let e = 0; e < (i.geode && t.s > h && t.s < g ? 6 : 0); e++) {
			let t = e * rp / 6, n = new THREE.Mesh(S, C);
			n.position.set(0, Math.sin(t) * 2.7, Math.cos(t) * 2.7), n.scale.set(.22, .65, .22), n.rotation.x = -t, a.add(n);
		}
		e.add(a), oe.push({
			root: a,
			ring: o,
			gate: t
		});
	});
	let se = [new THREE.PointLight("#98a9ea", 65, 48, 2), new THREE.PointLight("#d49daf", 45, 42, 2)];
	se.forEach((t) => {
		t.visible = i.geode, t.intensity = 0, e.add(t);
	});
	let j = [], ce = [];
	for (let e = 0; e < 600; e++) {
		let t = of(h + l() * (g - h)), n = t.p.clone().addScaledVector(t.side, (l() - .5) * 40).addScaledVector(t.up, 2 + l() * 22);
		j.push(...n), _p.set(e % 3 ? "#9fc9bb" : "#edc49e"), ce.push(..._p);
	}
	let le = new THREE.BufferGeometry();
	le.setAttribute("position", new THREE.Float32BufferAttribute(j, 3)), le.setAttribute("color", new THREE.Float32BufferAttribute(ce, 3));
	let ue = new THREE.Points(le, new THREE.PointsMaterial({
		size: .085,
		vertexColors: !0,
		transparent: !0,
		opacity: .6,
		depthWrite: !1,
		blending: 2
	}));
	e.add(ue), ue.visible = i.geode;
	function de(e, t) {
		let n = of(e.s);
		se[0].position.copy(n.p).addScaledVector(n.up, 7).addScaledVector(n.side, -5), se[1].position.copy(n.p).addScaledVector(n.tangent, 16).addScaledVector(n.up, 8).addScaledVector(n.side, 6);
		let r = (e.s / ip % 1 + 1) % 1, a = i.geode && r > kd.start && r < kd.end;
		se[0].intensity = a ? 65 : 0, se[1].intensity = a ? 45 : 0, ue.material.opacity = .45 + Math.sin(t * .6) * .12;
		for (let { ring: n, root: r, gate: i } of oe) n.material.emissiveIntensity = 2.2 + Math.sin(t * 2 + i.s) * .5, r.visible = e.s % ip - i.s < 5;
	}
	return {
		update: de,
		hoops: oe,
		crystals: w,
		shellMesh: b
	};
}
//#endregion
//#region src/world.js
var wm = (e) => `https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/47df78e2-1410-45d1-833c-196e1161c0b8/releases/20260912-synthwave-v1/assets/${e}`, Tm = new THREE.Vector3(), Em = new THREE.Vector3(0, 1, 0);
new THREE.Quaternion();
function Dm() {
	let e = document.createElement("canvas");
	e.width = e.height = 128;
	let t = e.getContext("2d"), n = t.createImageData(128, 128), r = 171;
	for (let e = 0; e < 128; e++) for (let t = 0; t < 128; t++) {
		r = r * 16807 % 2147483647;
		let i = (e * 128 + t) * 4, a = 205 + r % 30 + (t % 3 == 0 ? 12 : 0) - (e % 4 == 0 ? 16 : 0);
		n.data.set([
			a,
			a,
			a,
			255
		], i);
	}
	t.putImageData(n, 0, 0);
	let i = new THREE.CanvasTexture(e);
	return i.wrapS = i.wrapT = u, i.repeat.set(4, 4), i;
}
async function Om(e, t, n) {
	let r = rf(), i = matchMedia("(pointer: coarse)").matches, a = new THREE.WebGLRenderer({
		canvas: e,
		antialias: !0,
		powerPreference: "high-performance"
	});
	a.setPixelRatio(Math.min(devicePixelRatio, i ? 1.35 : 1.65)), a.setSize(innerWidth, innerHeight), a.outputColorSpace = Xe, a.toneMapping = 4, a.toneMappingExposure = 1.2, a.shadowMap.enabled = !0, a.shadowMap.type = 2;
	let o = new THREE.Scene();
	o.background = new THREE.Color("#12151c");
	let s = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .15, 2400), c = new THREE.HemisphereLight("#fcebd1", "#77829e", 1.65);
	o.add(c);
	let l = new THREE.DirectionalLight("#ffe9cc", 2.15);
	l.position.set(150, 280, -150), l.castShadow = !0, l.shadow.mapSize.set(i ? 1024 : 2048, i ? 1024 : 2048), Object.assign(l.shadow.camera, {
		left: -28,
		right: 28,
		top: 28,
		bottom: -28,
		near: 1,
		far: 500
	}), l.shadow.bias = -4e-4, l.shadow.normalBias = .02, o.add(l, l.target);
	let u = new THREE.GLTFLoader();
	t("Mixing the pigments…", .08);
	let d = 0, [p, m, h, g, _, v, y, b] = await Promise.all([
		u.loadAsync(wm("cyclist-championship.glb")),
		u.loadAsync(wm("planet.glb")),
		new as().loadAsync(wm("impasto.png")),
		u.loadAsync(wm("meteor.glb")),
		u.loadAsync(wm("skater-championship.glb")),
		u.loadAsync(wm("living-gate.glb")),
		u.loadAsync(wm("opal-platform.glb")),
		u.loadAsync(wm("cave-minerals.glb"))
	].map((e) => e.then((e) => (d++, t("Gathering worlds · " + d + " / 8", .08 + d * .09), e)))), x = g.scene.getObjectByName("SolidMeteor").geometry;
	h.colorSpace = Xe, h.wrapS = h.wrapT = f, h.anisotropy = Math.min(8, a.capabilities.getMaxAnisotropy());
	let S = (e) => (e.onBeforeCompile = (e) => {
		e.fragmentShader = e.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\nfloat luminance=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));\nfloat warm=smoothstep(.015,.18,diffuseColor.r-diffuseColor.g);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(.56,.285,.245)*(.65+luminance),warm*.38);\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(luminance),.09);");
	}, e), C = new THREE.DirectionalLight("#bdc9df", .95);
	C.position.set(-140, 80, 210), o.add(C);
	let w = Tf(), T = Pf(o, h, v.scene, y.scene, i, w);
	for (let [e, t, n, r] of [
		[
			176,
			6,
			.25,
			"#d19e7d"
		],
		[
			183,
			2,
			.25,
			"#e8d2ac"
		],
		[
			288,
			3,
			-.12,
			"#a6584f"
		],
		[
			296,
			.7,
			-.12,
			"#efd0a6"
		]
	]) {
		let i = new THREE.RingGeometry(e - t / 2, e + t / 2, 512);
		i.rotateX(-Math.PI / 2);
		let a = new THREE.Mesh(i, new THREE.MeshStandardMaterial({
			map: h,
			color: r,
			roughness: 1,
			side: 2
		}));
		a.userData.decorativeRing = !0, a.rotation.z = n, a.position.y = -15, o.add(a);
	}
	o.updateMatrixWorld(!0);
	let E = [];
	for (let e = 0; e < ip; e += 5) for (let t of e >= Y.start && e <= Y.end ? [
		"main",
		"upper",
		"lower"
	] : e >= ud.start && e <= ud.end ? ["islands", "bypass"] : ["main"]) E.push(cf(e, t).p);
	for (let e of o.children.filter((e) => e.userData.decorativeRing)) {
		let t = e.geometry, n = t.attributes.position, r = t.index, i = [];
		for (let t = 0; t < r.count; t += 3) {
			let a = new THREE.Vector3();
			for (let i = 0; i < 3; i++) a.add(new THREE.Vector3().fromBufferAttribute(n, r.getX(t + i)).applyMatrix4(e.matrixWorld));
			a.multiplyScalar(1 / 3), E.some((e) => e.distanceToSquared(a) < 529) || i.push(r.getX(t), r.getX(t + 1), r.getX(t + 2));
		}
		t.setIndex(i);
	}
	let D = m.scene;
	D.position.set(-17, 83, 48), D.scale.setScalar(150), D.rotation.set(.1, .4, 1.12);
	let ee = h.clone();
	ee.repeat.set(4, 2), ee.needsUpdate = !0, D.traverse((e) => {
		e.isMesh && (e.material = S(new THREE.MeshStandardMaterial({
			map: ee,
			bumpMap: ee,
			bumpScale: .018,
			roughness: 1,
			color: "#f9ece3"
		})));
	}), o.add(D);
	let te = [], O = [], ne = 77, k = () => (ne = ne * 16807 % 2147483647, ne / 2147483647);
	for (let e = 0; e < 8e3; e++) {
		let e = k() * 2 - 1, t = k() * rp, n = 1e3 + k() * 700, r = Math.sqrt(1 - e * e), i = new THREE.Color().setHSL(.09 + k() * .12, .12 + k() * .25, .35 + k() * .55);
		te.push(n * r * Math.cos(t), n * e, n * r * Math.sin(t)), O.push(...i);
	}
	let A = new THREE.BufferGeometry();
	A.setAttribute("position", new THREE.Float32BufferAttribute(te, 3)), A.setAttribute("color", new THREE.Float32BufferAttribute(O, 3)), o.add(new THREE.Points(A, new THREE.PointsMaterial({
		size: 1.65,
		sizeAttenuation: !1,
		vertexColors: !0,
		transparent: !0,
		opacity: .85
	})));
	let re = new THREE.IcosahedronGeometry(1, 4), ie = new THREE.MeshStandardMaterial({
		map: h,
		color: "#dfbdad",
		roughness: 1
	});
	for (let [e, t, n, r] of [
		[
			-310,
			270,
			220,
			29
		],
		[
			360,
			170,
			460,
			55
		],
		[
			-400,
			-120,
			-250,
			18
		],
		[
			400,
			370,
			-450,
			26
		]
	]) {
		let i = new THREE.Mesh(re, ie);
		i.position.set(e, t, n), i.scale.setScalar(r), i.rotation.set(.4, e * .001, .3), o.add(i);
	}
	let ae = cp(r.id), oe = [], se = new THREE.OctahedronGeometry(.33, 0), j = new THREE.MeshStandardMaterial({
		color: "#fff0bf",
		emissive: "#efb351",
		emissiveIntensity: 1.5,
		roughness: .35,
		metalness: .35
	}), ce = jm(), le = new THREE.MeshStandardMaterial({
		map: ce,
		bumpMap: ce,
		bumpScale: .045,
		color: "#b7aa95",
		roughness: .96
	});
	for (let e of ae) {
		let t = cf(e.s, e.route), n = new THREE.Mesh(e.kind === "dust" ? se : x, e.kind === "dust" ? j : le);
		if (n.position.copy(t.p).addScaledVector(t.side, e.lane).addScaledVector(t.up, (e.kind === "dust" ? 1.3 : .8) + (_d(e.s, e.route) || 0)), n.quaternion.copy(t.quaternion), e.kind === "meteor" && n.scale.set(1.15, .9, 1.1), n.castShadow = e.kind === "meteor", o.add(n), oe.push({
			o: n,
			data: e,
			base: n.position.clone(),
			up: t.up
		}), e.kind === "dust") {
			let e = new THREE.Sprite(new THREE.SpriteMaterial({
				map: w,
				color: "#ffc472",
				transparent: !0,
				opacity: .5,
				depthWrite: !1,
				blending: 2
			}));
			e.scale.setScalar(2.2), n.add(e);
		}
	}
	let ue = xp(o, h, D, x, r, ce, b.scene, w), de = Yf(o, h), fe = Yf(o, h, Fd), pe = Jf(o, h);
	fe.name = "Skate-only ramps";
	let me = Dm();
	t("Fitting the spacesuits…", .82);
	function he(e) {
		let t = p.scene.clone(!0), n = ap[e];
		t.traverse((e) => {
			if (!e.isMesh) return;
			e.castShadow = !0, e.receiveShadow = !0, e.material = e.material.clone();
			let t = e.material.name.split(".")[0];
			t === "SuitCanvas" && (e.material.color.set(n.color), e.material.map = me, e.material.bumpMap = me, e.material.bumpScale = .022), t === "CoralEnamel" && e.material.color.set(n.accent), t === "Porcelain" && (e.material.map = me, e.material.bumpMap = me, e.material.bumpScale = .008), e.material.needsUpdate = !0;
		});
		let r = new THREE.Group();
		r.add(t);
		let i = new THREE.Mesh(new THREE.PlaneGeometry(2.2, .8), new THREE.MeshBasicMaterial({
			map: w,
			color: "#000000",
			transparent: !0,
			opacity: .35,
			depthWrite: !1
		}));
		return i.rotation.x = -Math.PI / 2, i.position.y = .022, r.add(i), o.add(r), {
			group: r,
			root: t,
			contact: i,
			phase: 0,
			wheels: ["RearWheel", "FrontWheel"].map((e) => t.getObjectByName(e)),
			legs: ["L", "R"].map((e) => ({
				thigh: t.getObjectByName("Thigh" + e),
				shin: t.getObjectByName("Shin" + e),
				boot: t.getObjectByName("Boot" + e),
				knee: t.getObjectByName("Knee" + e),
				pedal: t.getObjectByName("Pedal" + e),
				crank: t.getObjectByName("Crank" + e)
			}))
		};
	}
	let M = Array.from({ length: 6 }, (e, t) => he(t % 3)), ge = M.map((e, t) => {
		let n = Lf(_.scene, ap[t % 3], me);
		return e.group.add(n.root), n.root.visible = !1, n;
	});
	function _e(e, t) {
		let n = t || ap[e];
		ge[0].recolor(n), M[0].root.traverse((e) => {
			e.isMesh && (e.material.name.split(".")[0] === "SuitCanvas" && e.material.color.set(n.color), e.material.name.split(".")[0] === "CoralEnamel" && e.material.color.set(n.accent));
		});
	}
	function ve(e, t, n) {
		e.position.copy(t), e.quaternion.setFromUnitVectors(Em, Tm.copy(n).sub(t).normalize()), e.scale.set(1, t.distanceTo(n), 1);
	}
	function ye(e, t, n, r, i, a = 0, o = !0, s = "main", c = 0, l = 0) {
		let u = cf(t, s);
		e.group.position.copy(u.p).addScaledVector(u.side, n).addScaledVector(u.up, .05 + sf(t, Cd(t, n, s)) + c), e.group.quaternion.copy(u.quaternion), e.group.rotateY(-l), e.group.rotateX(a), o && (e.phase -= i * Math.min(7, r * .17)), e.wheelPhase = (e.wheelPhase || 0) - i * r / .36;
		for (let t of e.wheels) t.rotation.z = e.wheelPhase;
		return e.legs.forEach((t, n) => {
			let r = e.phase + (n ? km : 0), i = n ? .15 : -.15, a = new THREE.Vector3(-.34, 1.15, i), o = new THREE.Vector3(-.12 + Math.cos(r) * .16, .34 + Math.sin(r) * .16, i), s = a.clone().add(o).multiplyScalar(.5), c = a.distanceTo(o), l = Math.sqrt(Math.max(.005, .49 * .49 - c * c / 4)), u = s.add(new THREE.Vector3(1, .15, 0).normalize().multiplyScalar(l));
			ve(t.thigh, a, u), ve(t.shin, u, o), t.knee && t.knee.position.copy(u), t.boot.position.copy(o), t.boot.position.y -= .04, t.pedal && (t.pedal.position.copy(o).addScaledVector(Em, -.055), t.crank.userData.base ??= t.crank.quaternion.clone(), t.crank.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), r).multiply(t.crank.userData.base));
		}), u;
	}
	let be = he(0), xe = Lf(_.scene, ap[0], me);
	be.group.add(xe.root), be.group.name = "Personal best ghost", be.group.traverse((e) => {
		e.isMesh && (e.material = e.material.clone(), e.material.transparent = !0, e.material.opacity = .28, e.material.depthWrite = !1, e.material.color.set("#a9eeec"), e.castShadow = !1);
	}), be.group.visible = !1;
	let Se = new THREE.InstancedMesh(x, le, 18);
	Se.name = "Distant moon fragments";
	let Ce = new THREE.Object3D();
	for (let e = 0; e < Se.count; e++) {
		let t = of(e / Se.count * ip);
		Ce.position.copy(t.p).addScaledVector(t.side, (e % 2 ? 1 : -1) * (58 + k() * 45)).addScaledVector(t.up, k() * 28 + 12), Ce.rotation.set(k() * 3, k() * 3, k() * 3), Ce.scale.setScalar(1.5 + k() * 3), Ce.updateMatrix(), Se.setMatrixAt(e, Ce.matrix);
	}
	o.add(Se);
	let we = Am(o, w, i ? 1200 : 2800), Te = 0, Ee = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), De = new THREE.Line(Ee, new THREE.LineBasicMaterial({
		color: "#b7f6e3",
		transparent: !0,
		opacity: .8,
		depthTest: !1
	}));
	De.frustumCulled = !1, o.add(De);
	let Oe = new THREE.Mesh(new THREE.TorusGeometry(1.6, .035, 8, 64), new THREE.MeshBasicMaterial({
		color: "#93ead5",
		transparent: !0,
		opacity: .6
	}));
	o.add(Oe);
	let ke;
	function Ae(e) {
		ke !== e && (ke = e, a.setPixelRatio(e === "low" ? 1 : Math.min(devicePixelRatio, i ? 1.35 : 1.65)), a.shadowMap.enabled = e !== "low", a.setSize(innerWidth, innerHeight));
	}
	function je(e, t, n, i = "chase") {
		let u = (e.s / ip % 1 + 1) % 1;
		c.intensity = r.geode && u > .205 && u < .405 ? .95 : 1.65;
		let d = e.phase === "menu", f = e.vehicle === "skate";
		fe.visible = pe.visible = f;
		for (let n = 0; n < M.length; n++) M[n].root.visible = !f, ge[n].root.visible = f, f && ge[n].pose(d ? 0 : n ? e.rivals[n - 1]?.speed || 0 : e.speed, t, n ? null : e.air, n ? 0 : e.lean, !d && (n ? !0 : e.pushing));
		let p = d ? 35 : e.s;
		M[0].contact.visible = !e.flight && !e.air, M.forEach((e) => e.group.scale.setScalar(d ? 1.3 : 1.15));
		let m = ye(M[0], p, d ? 0 : e.lane, d ? 0 : e.speed, t, d ? 0 : e.lean, !d && e.pushing, d ? "main" : e.route, 0, d ? 0 : e.heading || 0);
		M.slice(1).forEach((t) => t.group.visible = e.mode !== "trial" && !d), e.rivals.forEach((e, n) => ye(M[n + 1], d ? p + 10 + n * 5 : e.s, d ? (n % 3 - 1) * 3 : e.lane, d ? 10 : e.speed, t, e.lean || 0, !0, e.route, e.air?.height ?? (_d(e.s, e.route) || 0))), e.loop && (m = Gf(e.loop.def, e.loop.t, e.loop.lane), M[0].group.position.copy(m.p).addScaledVector(m.up, .06), M[0].group.quaternion.copy(m.quaternion));
		let h = d || e.loop ? 0 : e.air?.height ?? (Dd(e.s, e.lane, e.route, e.vehicle) || 0) + (e.route === "main" ? Pd(e.s, e.lane, e.vehicle) : 0);
		if (!e.flight && !e.loop && !d) {
			M[0].group.position.addScaledVector(m.up, h);
			let t = e.air ? Math.max(-.28, Math.min(.28, e.air.vy * .025)) : e.route === "main" ? Math.atan((Pd(e.s + .05, e.lane, e.vehicle) - Pd(e.s, e.lane, e.vehicle)) / .05) : Math.atan(((Dd(e.s + .05, e.lane, e.route, e.vehicle) ?? h) - h) / .05);
			M[0].group.rotateZ(t), e.air && M[0].group.rotateX(Math.sin(e.air.age * 3) * .22);
		}
		if (be.group.visible = !!e.ghost?.visible && !d, be.root.visible = !f, xe.root.visible = f, e.ghost?.visible) {
			let n = ye(be, e.ghost.s, e.ghost.lane, e.speed, t, 0, !0, e.ghost.route || "main");
			be.group.position.addScaledVector(n.up, e.ghost.height), be.contact.visible = !1, f && xe.pose(e.speed, t, null, 0, !0);
		}
		let g = new THREE.Vector3(), _ = new THREE.Vector3(), v = m.tangent.clone().multiplyScalar(Math.cos(e.heading || 0)).addScaledVector(m.side, Math.sin(e.heading || 0));
		if (e.flight) {
			let t = e.flight;
			M[0].group.position.copy(t.position), M[0].group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(t.forward, t.up, new THREE.Vector3().crossVectors(t.forward, t.up).normalize())), M[0].group.rotateX(t.mode === "drift" ? Math.sin(t.age * .5) * .45 : 0), M[0].group.rotateZ(t.mode === "drift" ? Math.sin(t.age * .3) * .3 : 0);
		}
		if (d) g.copy(m.p).addScaledVector(v, 4.5).addScaledVector(m.side, -7).addScaledVector(m.up, 2.7), _.copy(m.p).addScaledVector(m.side, 3.8).addScaledVector(m.up, 1.1), s.fov = 48, s.userData.ready ? (s.position.lerp(g, Math.min(1, t * 2.5)), s.userData.look.lerp(_, Math.min(1, t * 2.5))) : (s.position.copy(g), s.userData.look = _.clone(), s.userData.ready = !0), s.up.copy(m.up), s.lookAt(s.userData.look), s.userData.rigQ = null;
		else {
			let n = e.flight ? e.flight.forward : e.loop ? m.tangent : v, r = e.flight ? e.flight.up : m.up, a = new THREE.Vector3().crossVectors(n, r).normalize(), o = new THREE.Vector3().crossVectors(a, n).normalize(), c = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(n, o, a));
			!s.userData.ready || !s.userData.rigQ ? s.userData.rigQ = c : s.userData.rigQ.slerp(c, 1 - Math.exp(-t * 12));
			let l = i === "wide" ? wf : Cf, u = M[0].group.position;
			g.set(-l.back, l.height, 0).applyQuaternion(s.userData.rigQ).add(u), _.set(3, 1.4, 0).applyQuaternion(s.userData.rigQ).add(u), s.position.copy(g), s.up.set(0, 1, 0).applyQuaternion(s.userData.rigQ), s.lookAt(_), s.fov = s.aspect < .85 ? l.portraitFov : l.fov, s.userData.look = _, s.userData.ready = !0;
		}
		s.updateProjectionMatrix(), l.position.copy(m.p).add(new THREE.Vector3(90, 150, -90)), l.target.position.copy(m.p);
		for (let { o: t, data: r, base: i, up: a } of oe) {
			let o = Math.floor(e.s / ip);
			if (t.visible = !e.collected.has(o + ":" + r.id), r.kind === "dust") t.rotation.y = n * 1.4 + r.id, t.position.copy(i).addScaledVector(a, Math.sin(n * 2 + r.id) * .22);
			else {
				let n = cf(r.s, r.route);
				t.position.copy(n.p).addScaledVector(n.side, jd(r, e.time)).addScaledVector(n.up, 1 + (_d(r.s, r.route) || 0)), t.quaternion.copy(n.quaternion), t.rotateX(e.time * .3 + r.id), t.rotateZ(Math.sin(e.time * .48 + r.id * .9) * .8);
			}
		}
		if (Oe.visible = e.gravityTime > 0 || e.flight?.mode === "sling", Oe.position.copy(M[0].group.position).addScaledVector(m.up, 1), Oe.quaternion.copy(M[0].group.quaternion), Oe.rotateY(Math.PI / 2), Oe.rotateZ(n * 2), De.visible = !!e.flight, e.flight) {
			let t = cf(e.flight.startS, e.flight.route).p, n = Ee.attributes.position;
			n.setXYZ(0, e.flight.position.x, e.flight.position.y, e.flight.position.z), n.setXYZ(1, t.x, t.y, t.z), n.needsUpdate = !0, De.material.opacity = e.flight.mode === "sling" ? .9 : .22;
		}
		if (m.speed = e.speed, !e.flight && !e.air && !d && e.phase === "racing" && e.speed > 4) for (Te += t * (e.boosting ? 600 : 110 + e.speed * 3); Te >= 1;) {
			Te--;
			let t = M[0].group.position.clone().addScaledVector(m.tangent, -.75 - Math.random() * .3).addScaledVector(m.side, (Math.random() - .5) * .7).addScaledVector(m.up, .2);
			we.emit(t, m, +!!e.boosting);
		}
		!d && e.phase === "racing" && e.rivals.forEach((e, n) => {
			if (e.boosting && Math.random() < t * 35) {
				let t = cf(e.s, e.route);
				t.speed = e.speed, we.emit(M[n + 1].group.position.clone().addScaledVector(t.tangent, -1).addScaledVector(t.up, .25), t, 1);
			}
		});
		for (let t of e.events) if ([
			"dust",
			"gate",
			"hit",
			"resonance",
			"nearMiss",
			"sling",
			"land",
			"jump",
			"stunt"
		].includes(t.type)) for (let e = 0; e < (t.type === "dust" ? 25 : 65); e++) we.emit(M[0].group.position.clone().addScaledVector(m.up, 1), m, t.type === "hit" ? 2 : 1, !0);
		return we.update(t), T.update(e, t, n), ue.update(e, n, s), a.render(o, s), {
			f: m,
			particles: we.active,
			triangles: a.info.render.triangles,
			calls: a.info.render.calls
		};
	}
	function Me() {
		s.aspect = innerWidth / innerHeight, s.updateProjectionMatrix(), a.setSize(innerWidth, innerHeight);
	}
	t("Warming the starlight…", .9), Ae(n || (i ? "low" : "high")), ue.update({ s: 0 }, 0), o.updateMatrixWorld(!0);
	let N = /* @__PURE__ */ new Set(), Ne = /* @__PURE__ */ new Set();
	o.traverse((e) => {
		e.geometry && !N.has(e.geometry) && (N.add(e.geometry), e.geometry.boundingSphere || e.geometry.computeBoundingSphere()), e.isInstancedMesh && !e.boundingSphere && e.computeBoundingSphere();
		for (let t of Array.isArray(e.material) ? e.material : [e.material]) if (t) {
			for (let e of Object.values(t)) e?.isTexture && Ne.add(e);
			for (let e of Object.values(t.uniforms || {})) e.value?.isTexture && Ne.add(e.value);
		}
	}), Ne.forEach((e) => a.initTexture(e)), await a.compileAsync(o, s);
	let Pe = new THREE.WebGLRenderTarget(16, 16), Fe = [];
	o.traverse((e) => {
		Fe.push([
			e,
			e.visible,
			e.frustumCulled
		]), e.visible = !0, e.frustumCulled = !1;
	});
	let P = a.getRenderTarget();
	try {
		a.setRenderTarget(Pe), a.render(o, s);
	} finally {
		a.setRenderTarget(P), Fe.forEach(([e, t, n]) => {
			e.visible = t, e.frustumCulled = n;
		}), Pe.dispose();
	}
	s.userData.ready = !1, t("Ready for departure", 1), addEventListener("resize", Me);
	function Ie() {
		removeEventListener("resize", Me);
		let e = /* @__PURE__ */ new Set(), t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set();
		o.traverse((r) => {
			r.geometry && e.add(r.geometry);
			for (let e of Array.isArray(r.material) ? r.material : [r.material]) if (e) {
				t.add(e);
				for (let t of Object.values(e)) t?.isTexture && n.add(t);
			}
		}), e.forEach((e) => e.dispose()), t.forEach((e) => e.dispose()), n.forEach((e) => e.dispose()), l.shadow.map?.dispose(), a.dispose(), o.clear();
	}
	return {
		continuous: T,
		scene: o,
		camera: s,
		renderer: a,
		update: je,
		recolor: _e,
		dispose: Ie,
		ghostRider: be,
		setQuality: Ae,
		riders: M,
		planetRoot: D,
		pickups: oe,
		particles: we,
		landscape: ue,
		stuntRamps: de,
		skaters: ge,
		skateStunts: fe,
		skateLoopWorld: pe,
		tether: De,
		aura: Oe,
		get quality() {
			return ke;
		}
	};
}
var km = Math.PI;
function Am(e, t, n) {
	let r = new Float32Array(n * 3), i = new Float32Array(n * 3), a = new Float32Array(n), o = new Float32Array(n), s = new Float32Array(n), c = new Float32Array(n * 3);
	r.fill(1e5);
	let l = 0, u = 0, d = new THREE.BufferGeometry();
	d.setAttribute("position", new THREE.BufferAttribute(r, 3).setUsage(nt)), d.setAttribute("color", new THREE.BufferAttribute(i, 3).setUsage(nt)), d.setAttribute("size", new THREE.BufferAttribute(a, 1).setUsage(nt));
	let f = new THREE.Points(d, new THREE.ShaderMaterial({
		uniforms: { uMap: { value: t } },
		vertexColors: !0,
		transparent: !0,
		depthWrite: !1,
		blending: 2,
		vertexShader: "attribute float size; varying vec3 vColor; void main(){vColor=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*280./(-p.z),1.,65.);}",
		fragmentShader: "uniform sampler2D uMap; varying vec3 vColor;void main(){vec4 t=texture2D(uMap,gl_PointCoord);gl_FragColor=vec4(t.rgb*vColor,t.a);}"
	}));
	f.frustumCulled = !1, e.add(f);
	function p(e, t, u, d = !1) {
		let f = l++ % n, p = f * 3;
		r.set(e.toArray(), p);
		let m = t.tangent.clone().multiplyScalar((t.speed || 0) * .72 - 2 - Math.random() * 3).addScaledVector(t.side, (Math.random() - .5) * (d ? 10 : 5.5)).addScaledVector(t.up, Math.random() * (d ? 7 : 2));
		c.set(m.toArray(), p), o[f] = s[f] = u === 1 ? 1.7 + Math.random() : .65 + Math.random(), a[f] = u === 1 ? .11 + Math.random() * .3 : .07 + Math.random() * .13;
		let h = new THREE.Color(u === 2 ? "#e47b69" : Math.random() > .4 ? "#ffe1a0" : "#a7d8e1");
		i.set(h.toArray(), p);
	}
	function m(e) {
		u = 0;
		for (let t = 0; t < n; t++) {
			if (o[t] <= 0) continue;
			u++, o[t] -= e;
			let n = t * 3;
			o[t] <= 0 ? (r[n] = 1e5, a[t] = 0) : (r[n] += c[n] * e, r[n + 1] += c[n + 1] * e, r[n + 2] += c[n + 2] * e, a[t] *= Math.exp(-e * .65));
		}
		for (let e of Object.values(d.attributes)) e.needsUpdate = !0;
	}
	return {
		emit: p,
		update: m,
		get active() {
			return u;
		}
	};
}
function jm() {
	let e = document.createElement("canvas");
	e.width = e.height = 256;
	let t = e.getContext("2d"), n = t.createImageData(256, 256), r = 431;
	for (let e = 0; e < 256; e++) for (let t = 0; t < 256; t++) {
		r = r * 16807 % 2147483647;
		let i = r / 2147483647, a = 105 + (Math.sin(t * .22 + Math.sin(e * .19) * 3) * 9 + Math.sin(e * .47 + t * .18) * 6) + (i - .5) * 65;
		n.data.set([
			a * 1.05,
			a,
			a * .92,
			255
		], (e * 256 + t) * 4);
	}
	t.putImageData(n, 0, 0);
	let i = new THREE.CanvasTexture(e);
	return i.colorSpace = Xe, i.wrapS = i.wrapT = u, i.repeat.set(3, 3), i;
}
//#endregion
//#region src/controls.js
var Mm = {
	pedal: "KeyW",
	brake: "KeyS",
	left: "KeyA",
	right: "KeyD",
	boost: "ShiftLeft",
	jump: "Space",
	gravity: "KeyG",
	camera: "KeyC",
	pause: "Escape"
}, Nm = (e) => e.replace(/^Key|^Digit/, "").replace("Arrow", "").replace("ShiftLeft", "Shift").replace("ShiftRight", "Shift").replace("Escape", "Esc");
function Pm(e) {
	if (!e) return {};
	let t = Number(e.axes?.[0]) || 0, n = Math.abs(t) < .16 ? 0 : Math.sign(t) * (Math.abs(t) - .16) / .84, r = (t) => !!e.buttons?.[t]?.pressed;
	return {
		steer: n,
		pedal: r(7),
		brake: r(6),
		jump: r(0),
		boost: r(2) || r(5),
		gravity: r(1) || r(4),
		pause: r(9),
		camera: r(3)
	};
}
function Fm(e) {
	let t = { ...Mm };
	if (e && typeof e == "object") {
		let n = /* @__PURE__ */ new Set();
		for (let r of Object.keys(t)) {
			let i = e[r];
			if (typeof i == "string" && /^(Key[A-Z]|Digit[0-9]|Arrow(Up|Down|Left|Right)|Space|ShiftLeft|ShiftRight|Escape|Enter)$/.test(i) && !n.has(i)) t[r] = i, n.add(i);
			else return { ...Mm };
		}
	}
	return t;
}
//#endregion
//#region src/audio.js
function Im({ enabled: e = !0, musicVolume: t = .75 } = {}) {
	let n, r, i, a, o, s, c = e !== !1, l = 0, u = "menu", d = !1, f = Number.isFinite(+t) ? Math.max(0, Math.min(1, +t)) : .75, p = () => document.hidden, m = () => u === "paused" || p();
	function h() {
		!s || !c || m() || f === 0 || s.paused && s.play().then(() => {
			d = !1;
		}).catch(() => {
			d = !0;
		});
	}
	function g() {
		n && (r.gain.setTargetAtTime(c && !m() ? .6 : 0, n.currentTime, .06), o.gain.setTargetAtTime(f * (u === "racing" || u === "countdown" ? .5 : .27), n.currentTime, .35), !c || m() || f === 0 ? s.pause() : h());
	}
	function _() {
		if (!n) {
			let e = window.AudioContext || window.webkitAudioContext;
			if (!e) return;
			n = new e(), r = n.createGain(), r.gain.value = 0, r.connect(n.destination), i = n.createGain(), i.gain.value = .3, i.connect(r), o = n.createGain(), o.gain.value = 0, o.connect(r), s = new Audio("https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/47df78e2-1410-45d1-833c-196e1161c0b8/releases/20260912-synthwave-v1/assets/audio/afterglow-orbit.m4a"), s.loop = !0, s.preload = "none", s.crossOrigin = "anonymous", n.createMediaElementSource(s).connect(o);
			let t = n.createBuffer(1, n.sampleRate * 2, n.sampleRate), c = t.getChannelData(0);
			for (let e = 0; e < c.length; e++) c[e] = (Math.random() * 2 - 1) * .18;
			let l = n.createBufferSource(), u = n.createBiquadFilter();
			l.buffer = t, l.loop = !0, u.type = "lowpass", u.frequency.value = 450, a = n.createGain(), a.gain.value = 0, l.connect(u).connect(a).connect(i), l.start();
		}
		n.state === "suspended" && n.resume().catch(() => {}), g();
	}
	function v(e, t = .3, r = .22, a = "sine", o = 0) {
		if (!n || !c || m() || n.state !== "running") return;
		let s = n.createOscillator(), l = n.createGain(), u = n.currentTime + o;
		s.type = a, s.frequency.setValueAtTime(e, u), l.gain.setValueAtTime(0, u), l.gain.linearRampToValueAtTime(r, u + .01), l.gain.exponentialRampToValueAtTime(.001, u + t), s.connect(l).connect(i), s.start(u), s.stop(u + t + .02), s.onended = () => {
			s.disconnect(), l.disconnect();
		};
	}
	function y(e, t, n, r) {
		e.forEach((e, i) => v(e, t, n, "sine", i * r));
	}
	function b(e) {
		e.type === "jump" && v(420, .3, .1), e.type === "stunt" && y([
			660,
			880,
			1100
		], .45, .14, .09), e.type === "resonance" && y([
			523,
			784,
			1046
		], .65, .16, .085), e.type === "nearMiss" && v(880, .35, .14), e.type === "dust" && (v(660 + e.mult * 110, .24, .2), v(1320, .35, .06)), e.type === "tick" && v(330, .15), (e.type === "go" || e.type === "gate") && (v(523, .7), v(784, .8, .13)), (e.type === "hit" || e.type === "fall") && v(75, .25, .35, "triangle"), e.type === "finish" && y([
			523,
			659,
			784,
			1046
		], 1, .2, .16);
	}
	function x(e) {
		u !== e && (u = e, g());
	}
	function S(e, t) {
		x(e.phase), n && (a.gain.setTargetAtTime(e.phase === "racing" ? e.speed / 60 * (e.boosting ? 1 : .5) : 0, n.currentTime, .3), l += t, e.phase === "racing" && e.speed > 8 && l > 4 / e.speed && (l = 0, v(1e3 + Math.random() * 200, .018, .018)));
	}
	function C(e) {
		return c = !!e, g(), c;
	}
	function w(e) {
		f = Math.max(0, Math.min(1, Number(e) || 0)), g();
	}
	return document.addEventListener("visibilitychange", g), addEventListener("pagehide", () => {
		s?.pause(), n?.suspend().catch(() => {});
	}), addEventListener("pageshow", () => {
		n && !p() && _();
	}), {
		init: _,
		tone: v,
		event: b,
		update: S,
		setPhase: x,
		setEnabled: C,
		setMusicVolume: w,
		toggle: () => C(!c),
		get enabled() {
			return c;
		},
		get state() {
			return {
				enabled: c,
				musicVolume: f,
				phase: u,
				context: n?.state || "locked",
				playing: !!s && !s.paused,
				time: s?.currentTime || 0,
				duration: s?.duration || 0,
				blocked: d
			};
		}
	};
}
//#endregion
//#region src/main.js
var Z = (e) => document.getElementById(e), Lm = Z("app"), Rm = Z("world") || Z("canvas"), zm = "strange-orbit:v1", Bm = "strange-orbit:career-v2", Vm = matchMedia("(pointer: coarse)").matches, Q = {
	rider: 0,
	vehicle: "bike",
	quality: Vm ? "low" : "high",
	records: {},
	autoRide: !1,
	sensitivity: 1,
	haptics: !0,
	bindings: { ...Mm }
}, Hm = qd(null), Um = !0;
try {
	let e = JSON.parse(localStorage.getItem(zm) || "null");
	e && typeof e == "object" && (Q = {
		...Q,
		...e
	}), Hm = qd(JSON.parse(localStorage.getItem(Bm) || "null")), localStorage.setItem(Bm, JSON.stringify(Hm));
} catch {
	Um = !1;
}
Q.controlRevision !== 2 && (Q.mobileAutoRide = Q.desktopAutoRide = !1, Q.controlRevision = 2), Q.autoRide = Vm ? Q.mobileAutoRide ?? !1 : Q.desktopAutoRide ?? !1, Vm && (Q.quality = Q.mobileQuality || "low"), Q.rider = op(Number(Q.rider) || 0, 0, 2) | 0, Q.vehicle = Q.vehicle === "skate" ? "skate" : "bike", Q.bindings = Fm(Q.bindings), Q.sensitivity = op(Number(Q.sensitivity) || 1, .65, 1.4);
function Wm() {
	try {
		localStorage.setItem(zm, JSON.stringify(Q)), localStorage.setItem(Bm, JSON.stringify(Hm)), Um = !0;
	} catch {
		Um = !1;
	}
}
var Gm = "painted", $ = lp({
	rider: Q.rider,
	vehicle: Q.vehicle
}), Km, qm = "chase", Jm = 0, Ym = "", Xm = !1, Zm = !1, Qm = !1, $m = "", eh = null, th = !1, nh = !1, rh = null, ih = /* @__PURE__ */ new Set(), ah = {
	left: !1,
	right: !1,
	pedal: !1,
	brake: !1,
	boost: !1,
	jump: !1,
	gravity: !1
}, oh = Im({
	enabled: Q.soundEnabled,
	musicVolume: Q.musicVolume
}), sh = !1, ch = !1, lh = {}, uh = 0;
Lm.innerHTML = `<div class="vignette"></div><div class="grain"></div>
<header class="topbar"><div class="brand"><i class="orbit-icon"></i><span>ORBITAL CYCLING CLUB</span></div><div class="top-actions"><button id="sound" class="icon-button" title="Toggle sound" aria-label="Mute sound">♪</button><button id="pause-button" class="icon-button hidden" title="Pause · Esc" aria-label="Pause race">Ⅱ</button><button id="help-button" class="icon-button" title="How to ride" aria-label="How to ride">?</button></div></header>
<section id="menu"><div class="menu-shade"></div><div class="menu-body"><div class="menu-scroll"><p class="eyebrow caps">One impossible world</p><h1 class="title serif">Strange<br><em>Orbit.</em></h1><p class="intro">Ride the rings. Find your own way.</p><div class="vehicle-picker" role="group" aria-label="Choose your ride"><button data-vehicle="bike" class="vehicle-choice active" aria-pressed="true"><span>BIKE</span><small>Find your rhythm</small></button><button data-vehicle="skate" class="vehicle-choice" aria-pressed="false"><span>SKATE</span><small>Leave the ground</small></button></div><div class="menu-links"><button id="garage-menu">Garage</button><button id="settings-menu">Settings</button></div></div><button id="start" class="primary" disabled>RACE ↗</button><div id="best" class="best"></div></div><div class="world-caption"><span class="caps">One continuous orbit</span><p>Above. Below. Beyond.</p></div></section>
<section id="race-setup-modal" class="modal-shade hidden"><div class="panel"><div class="caps">Your orbit, your pace</div><h2>How far will you push?</h2><div class="difficulty-cards">${Object.entries(zd).map(([e, t]) => `<button data-difficulty="${e}"><strong>${t.name}</strong><span>${t.description}</span></button>`).join("")}</div><select id="difficulty" class="hidden">${Object.entries(zd).map(([e, t]) => `<option value="${e}">${t.name}</option>`).join("")}</select><div id="practice-choices" class="hidden"><label>Practice ride<select id="mode"><option value="cup">Race</option><option value="trial">Time trial + ghost</option><option value="free">Endless ride</option></select></label></div><p id="course-info" class="setup-hint">Seven orbits. One continuous world.</p><p id="difficulty-hint" class="hidden"></p><button id="launch-race" class="primary">LET’S RIDE ↗</button><button id="close-race-setup" class="secondary">Back</button></div></section>
<section id="garage" class="modal-shade hidden"><div class="panel"><div class="caps">Make it yours</div><h2>The garage.</h2><div class="rider-list">${ap.map((e, t) => `<button class="rider-choice" data-rider="${t}"><span class="swatch" style="--swatch:${e.color}"></span>${e.name}</button>`).join("")}</div><p id="rider-role" class="setup-hint"></p><div class="garage-row"><label>SUIT<select id="finish-select"></select></label><label>SETUP<select id="equipment-select"></select></label></div><p id="garage-equipped" role="status" aria-live="polite"></p><div id="career-status" class="career-status"></div><button id="practice-menu" class="secondary">Practice rides</button><button id="close-garage" class="primary">BACK TO ORBIT ↗</button></div></section>
<section id="hud" class="hidden"><div class="bottom-shade"></div><div class="hud-top"><div><span class="caps" id="place-label">Position</span><div class="position-value serif"><span id="place">06</span><small id="place-total">/ 06</small></div></div><div class="hud-laps"><div class="caps" id="route-name">Around the impossible</div><div class="lap-number serif" id="lap">Orbit 1 / 3</div><div class="lap-dots" id="lap-dots"></div></div><div class="hud-time"><span class="caps">Race time</span><div class="time-value" id="timer">0:00.00</div><div class="lap-record" id="lap-best">BEST LAP —</div></div></div><details id="race-order" class="race-order"></details><div class="objectives"><div class="caps">Leave your mark</div><div class="objective" id="goal-dust"><i></i><span>Gather 25 stardust · <b>0</b>/25</span></div><div class="objective" id="goal-draft"><i></i><span>Draft for 8 seconds · <b>0</b>/8</span></div><div class="objective" id="goal-boost"><i></i><span>Boost for 10 seconds · <b>0</b>/10</span></div></div><div class="race-message" id="notice" role="status"></div><div class="boost-banner" id="boost-banner"></div><button id="jump-button" class="jump-control" data-control="jump" aria-label="Jump">JUMP</button><div class="gravity-control"><button id="gravity-button" data-control="gravity" aria-label="Gravity power">GRAVITY <b id="gravity-charges">3</b></button><span id="gravity-status">6s grip / zero-G rescue</span></div><div class="hud-bottom"><div class="minimap-wrap"><canvas id="minimap" class="minimap" width="260" height="200"></canvas><div class="minimap-caption">THE PAINTED RINGS</div></div><div class="fuel"><div class="fuel-label"><span>✦ STARDUST</span><span id="fuel-value">55%</span></div><div class="meter"><div class="meter-fill" id="fuel-fill"></div></div><div class="fuel-hint">HOLD SHIFT TO BOOST · SPACE TO JUMP</div></div><div class="speed"><div class="dust-count" id="dust-count">✦ 0</div><div class="speed-value serif" id="speed">0</div><div class="speed-unit">KM / H</div></div></div><div class="touch-controls" id="touch-controls"><div class="touch-cluster"><button class="touch-button" data-control="left" aria-label="Steer left">←</button><button class="touch-button" data-control="right" aria-label="Steer right">→</button></div><div class="touch-cluster"><button class="touch-button" data-control="brake" aria-label="Brake">↓</button><button class="touch-button" data-control="pedal" aria-label="Pedal">↑</button><button class="touch-button boost" data-control="boost" aria-label="Stardust boost">BOOST</button></div></div></section>
<div id="race-progress" class="race-progress hidden"><i id="race-progress-fill"></i><span id="race-progress-label"></span></div><div class="countdown hidden" id="countdown"><div class="count-number" id="count-number">3</div><div class="count-caption">THE UNIVERSE IS YOUR VELODROME</div></div>
<section class="modal-shade hidden" id="pause"><div class="panel"><div class="caps">A moment between orbits</div><h2>Catch your breath.</h2><p>The stars can wait.</p><button id="settings-pause" class="secondary">Controls & settings</button><button id="resume" class="primary">Back to the rings <span>↗</span></button><button id="restart" class="secondary">Restart this race</button><button id="back-menu" class="secondary">Return to the observatory</button></div></section>
<section class="modal-shade hidden" id="help"><div class="panel"><div class="caps">A small field guide</div><h2>Find your rhythm.</h2><div id="help-controls"></div><p>Follow a rival to recharge boost. Take the marked side lane for a fast shortcut. Bike touring rewards smooth lines and slipstreams; skating rewards carving, loops and tricks.</p><p>Jump, then tap jump again in skate mode to kickflip. Clean landings earn boost and a speed surge. Enter mint loops with momentum; gravity can hold you on or rescue you after release.</p><p>Release acceleration to stop on the road. In space, steer left/right, hold Jump to rise, or Brake to descend. Touch down on the top of any lane to rejoin without spending gravity.</p><p>Watch the edge warning. If you escape into space, use gravity before your rescue window closes. A charge returns every lap. Explorer gives the most room to recover.</p><p>Finish races to unlock suits and vehicle setups. At the seafoam fork, steer left to climb or right to dive. At the opal split, take the right lane for the lower bypass, or jump across the platforms. Time trial saves your fastest run as a ghost on this device.</p><button id="close-help" class="primary">I’m ready ↗</button></div></section>
<section id="settings" class="modal-shade hidden"><div class="panel"><div class="caps">Make it yours</div><h2>Flight controls.</h2><div class="settings-row"><label for="auto-ride">Automatic acceleration</label><input type="checkbox" id="auto-ride"></div><div class="settings-row"><label for="sensitivity">Steering sensitivity</label><input id="sensitivity" type="range" min="0.65" max="1.4" step=".05"></div><div class="settings-row"><label for="quality">Visual detail</label><select id="quality"><option value="high">Painterly</option><option value="low">Lightweight</option></select></div><div class="settings-row"><label for="haptics">Touch vibration</label><input type="checkbox" id="haptics"></div><div class="settings-row"><label for="sound-enabled">Game sound</label><input type="checkbox" id="sound-enabled"></div><div class="settings-row"><label for="music-volume">Synthwave music</label><input id="music-volume" type="range" min="0" max="1" step=".05" aria-label="Synthwave music volume"></div><div id="bindings" class="bindings"></div><p id="binding-status">Select an action, then press a key.</p><p>Gamepad: left stick steer · RT accelerate · LT brake · A jump · X boost · B gravity · Y camera · Start pause.</p><button id="reset-bindings" class="secondary">Reset keyboard controls</button><button id="close-settings" class="primary">Back to orbit ↗</button></div></section>
<section class="modal-shade hidden" id="results"><div class="panel"><div class="caps result-medal" id="medal-label">Gold orbit</div><h2 id="result-title">An orbit to<br>remember.</h2><p id="result-copy"></p><div class="result-stats"><div class="result-stat"><strong id="result-place"></strong><span>POSITION</span></div><div class="result-stat"><strong id="result-time"></strong><span>RACE TIME</span></div><div class="result-stat"><strong id="result-score"></strong><span>STARDUST SCORE</span></div></div><div class="result-goals" id="result-goals"></div><div id="championship-results"></div><button id="again" class="primary">One more orbit <span>↗</span></button><button id="result-menu" class="secondary">Return to the observatory</button></div></section>
<section class="modal-shade hidden" id="lost"><div class="panel"><div class="caps">Beyond the gravity field</div><h2>Lost in orbit.</h2><p>Space won this round. Brake before the edges, or use G to sling back while you have a charge.</p><button id="lost-retry" class="primary">Race again ↗</button><button id="lost-menu" class="secondary">Return to the observatory</button></div></section><section class="modal-shade" id="loading" aria-label="Loading Strange Orbit"><img class="loading-art" src="https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/47df78e2-1410-45d1-833c-196e1161c0b8/releases/20260912-synthwave-v1/assets/loading-cover.jpg" alt="Astronaut cyclists racing around a painted planet"><div class="loading-veil"></div><div class="launch-top"><i class="orbit-icon"></i><span>ORBITAL CYCLING CLUB</span><span class="launch-edition">EXPEDITION 09</span></div><div class="loading-inner"><p class="launch-kicker">A departure from the ordinary</p><h1>Strange<br><em>Orbit.</em></h1><p class="launch-copy">A little courage.<br>An impossible world.</p><div class="launch-progress"><div class="launch-progress-track"><i id="loading-progress"></i></div><div class="launch-progress-label"><span id="loading-status">Opening the observatory…</span><span id="loading-percent">00</span></div></div><button id="reload" class="secondary hidden">Try again</button></div><div class="launch-bottom"><span>✦ &nbsp; Ride the rings. Find your way home.</span><span>BEYOND THE EVERYDAY</span></div></section>`;
function dh(e) {
	let t = Wd.find((e) => e.id === Hm.finish) || Wd[0], n = ap[e];
	return {
		...n,
		color: t.suit || n.color,
		accent: t.accent || n.accent
	};
}
var fh = Sf(Z("race-order"));
Z("race-order").open = innerHeight >= 600;
function ph() {
	Gm = "painted";
	let e = Z("mode").value, t = zd[Z("difficulty").value];
	Z("difficulty-hint").textContent = t.description, Z("course-info").textContent = e === "free" ? "No finish line. Follow your curiosity." : `${e === "trial" ? 5 : 7} orbits · one continuous world · ${e === "trial" ? "your personal-best ghost" : "five rivals"}`;
	let n = Wd.find((e) => e.wins > Hm.races);
	Z("career-status").textContent = Um ? `${Hm.races} races completed. ${n ? `${n.name} unlocks after ${n.wins - Hm.races} more ${n.wins - Hm.races === 1 ? "race" : "races"}.` : "All suits and setups unlocked."}` : "Progress cannot be saved in this browser session.", Z("garage-equipped").textContent = `Equipped · ${Wd.find((e) => e.id === Hm.finish).name} / ${Gd.find((e) => e.id === Hm.equipment).name} · applies to bike and skate`, Z("finish-select").innerHTML = Wd.map((e) => `<option value="${e.id}" ${e.wins > Hm.races ? "disabled" : ""}>${e.name}${e.wins > Hm.races ? ` · finish ${e.wins} races` : ""}</option>`).join(""), Z("finish-select").value = Hm.finish, Z("equipment-select").innerHTML = Gd.map((e) => `<option value="${e.id}" ${e.level > Hm.races ? "disabled" : ""}>${e.name}${e.level > Hm.races ? ` · finish ${e.level} races` : ""}</option>`).join(""), Z("equipment-select").value = Hm.equipment, Z("rider-role").textContent = ap[$.rider].role + " · " + (Gd.find((e) => e.id === Hm.equipment) || Gd[0]).description;
	let r = Hm.records[Jd({
		courseId: Gm,
		mode: e,
		difficulty: Z("difficulty").value,
		vehicle: $.vehicle
	})];
	Z("best").textContent = r ? `PERSONAL BEST ${hp(r.time)}` : "A little courage. An impossible world.", document.querySelectorAll("[data-rider]").forEach((e) => {
		let t = +e.dataset.rider === $.rider;
		e.classList.toggle("active", t), e.setAttribute("aria-pressed", t);
	}), document.querySelectorAll("[data-vehicle]").forEach((e) => {
		let t = e.dataset.vehicle === $.vehicle;
		e.classList.toggle("active", t), e.setAttribute("aria-pressed", t);
	}), document.querySelectorAll("[data-difficulty]").forEach((e) => {
		let t = e.dataset.difficulty === Z("difficulty").value;
		e.classList.toggle("active", t), e.setAttribute("aria-pressed", t);
	});
}
function mh() {
	sh = ch = !1, ih.clear(), uh = 0;
	for (let e in ah) ah[e] = !1;
	document.querySelectorAll(".held").forEach((e) => e.classList.remove("held"));
}
function hh(e) {
	let t = Q.bindings, n = Pm([...navigator.getGamepads?.() || []].find((e) => e?.connected));
	n.pause && !lh.pause && bh(), n.camera && !lh.camera && (qm = qm === "chase" ? "wide" : "chase"), lh = n;
	let r = (e) => ih.has(t[e]) || ah[e], i = (e, n) => ih.has(n) && (!Object.values(t).includes(n) || t[e] === n), a = r("brake") || i("brake", "ArrowDown") || n.brake, o = op((r("right") || i("right", "ArrowRight") ? 1 : 0) - (r("left") || i("left", "ArrowLeft") ? 1 : 0) + (n.steer || 0), -1, 1);
	return uh += (o - uh) * (1 - Math.exp(-e * 12)), {
		pedal: !a && (Q.autoRide || r("pedal") || i("pedal", "ArrowUp") || n.pedal),
		brake: a,
		steer: uh * Q.sensitivity,
		boost: r("boost") || n.boost,
		jump: sh || r("jump") || n.jump,
		gravity: ch || r("gravity") || n.gravity
	};
}
function gh(e, t = 0) {
	Z("loading-status").textContent = e, Z("loading-progress").style.width = Math.round(t * 100) + "%", Z("loading-percent").textContent = String(Math.round(t * 100)).padStart(2, "0");
}
async function _h(e) {
	if (Km?.courseId !== e) {
		Qm = !0, Zm = !1, Z("loading").classList.remove("hidden"), Z("start").disabled = !0, Km?.dispose(), Km = null, nf(e);
		try {
			mf(), Km = await Om(Rm, gh, Q.quality), Km.courseId = e, Km.setQuality(Q.quality), Km.recolor($.rider, dh($.rider)), Zm = !0, Z("start").disabled = !1, Z("loading").classList.add("hidden");
		} catch (e) {
			console.error(e), gh("The course could not load. Reload to try again."), Z("reload").classList.remove("hidden");
		} finally {
			Qm = !1;
		}
	}
}
async function vh() {
	if (!Zm || Qm) return;
	oh.setPhase("countdown"), oh.init(), mh();
	let e = Z("mode").value, t = Z("difficulty").value, n = $.vehicle, r = $.rider;
	Gm = "painted", $ = lp({
		rider: r,
		vehicle: n,
		mode: e,
		difficulty: t,
		courseId: Gm,
		equipment: Hm.equipment,
		round: 0
	}), Xm = !1, rh = e === "trial" && Hm.ghosts[Jd($)] || null, await _h(Gm), Zm && (Km.recolor(r, dh(r)), Km.camera.userData.ready = !1, up($), $m = "", Jm = 0, Ym = "", Z("help").classList.add("hidden"), Z("settings").classList.add("hidden"), Z("race-setup-modal").classList.add("hidden"), Z("garage").classList.add("hidden"));
}
function yh() {
	mh(), $ = lp({
		rider: $.rider,
		vehicle: $.vehicle,
		courseId: Km?.courseId || "painted"
	}), Km.camera.userData.ready = !1, Ym = "", ph();
}
function bh() {
	dp($) && (oh.setPhase($.phase), $.phase !== "paused" && oh.init(), mh(), Ym = "");
}
function xh() {
	Z("bindings").innerHTML = Object.entries(Q.bindings).map(([e, t]) => `<button data-bind="${e}" class="${eh === e ? "active" : ""}"><span>${e}</span><b>${eh === e ? "Press a key" : Nm(t)}</b></button>`).join(""), document.querySelectorAll("[data-bind]").forEach((e) => e.onclick = () => {
		eh = e.dataset.bind, xh();
	});
}
function Sh() {
	th = ["racing", "countdown"].includes($.phase), th && bh(), Z("settings").classList.remove("hidden"), xh();
}
Z("settings-menu").onclick = Z("settings-pause").onclick = Sh, Z("close-settings").onclick = () => {
	eh = null, Z("settings").classList.add("hidden"), th && $.phase === "paused" && bh(), th = !1;
}, Z("auto-ride").checked = Q.autoRide, Z("auto-ride").onchange = () => {
	Q.autoRide = Z("auto-ride").checked, Q[Vm ? "mobileAutoRide" : "desktopAutoRide"] = Q.autoRide, Wm();
}, Z("haptics").checked = Q.haptics, Z("haptics").onchange = () => {
	Q.haptics = Z("haptics").checked, Wm();
}, Z("sensitivity").value = Q.sensitivity, Z("sensitivity").oninput = () => {
	Q.sensitivity = +Z("sensitivity").value, Wm();
}, Z("quality").value = Q.quality, Z("quality").onchange = () => {
	Q.quality = Z("quality").value, Vm && (Q.mobileQuality = Q.quality), Km?.setQuality(Q.quality), Wm();
}, Z("reset-bindings").onclick = () => {
	Q.bindings = { ...Mm }, eh = null, Wm(), xh();
};
function Ch(e = !1) {
	Z("garage").classList.add("hidden"), Z("practice-choices").classList.toggle("hidden", !e), e || (Z("mode").value = "cup"), Z("race-setup-modal").classList.remove("hidden"), ph();
}
Z("start").onclick = () => Ch(), Z("launch-race").onclick = vh, Z("close-race-setup").onclick = () => Z("race-setup-modal").classList.add("hidden"), Z("garage-menu").onclick = () => {
	ph(), Z("garage").classList.remove("hidden");
}, Z("close-garage").onclick = () => Z("garage").classList.add("hidden"), Z("practice-menu").onclick = () => Ch(!0), document.querySelectorAll("[data-difficulty]").forEach((e) => e.onclick = () => {
	Z("difficulty").value = e.dataset.difficulty, ph();
}), Z("again").onclick = Z("restart").onclick = Z("lost-retry").onclick = vh, Z("resume").onclick = Z("pause-button").onclick = bh;
for (let e of [
	"back-menu",
	"result-menu",
	"lost-menu"
]) Z(e).onclick = yh;
Z("mode").onchange = ph, Z("difficulty").value = "racer", Z("difficulty").onchange = ph, Z("finish-select").onchange = () => {
	$d(Hm, "finish", Z("finish-select").value) && (Wm(), Km?.recolor($.rider, dh($.rider))), ph();
}, Z("equipment-select").onchange = () => {
	$d(Hm, "equipment", Z("equipment-select").value) && Wm(), ph();
}, document.querySelectorAll("[data-rider]").forEach((e) => e.onclick = () => {
	$.rider = +e.dataset.rider, Q.rider = $.rider, Wm(), Km?.recolor($.rider, dh($.rider)), ph();
}), document.querySelectorAll("[data-vehicle]").forEach((e) => e.onclick = () => {
	$.vehicle = e.dataset.vehicle, Q.vehicle = $.vehicle, Wm(), ph();
});
function wh() {
	let e = oh.enabled;
	Z("sound").textContent = e ? "♪" : "♫̸", Z("sound").setAttribute("aria-label", e ? "Mute sound" : "Enable sound"), Z("sound-enabled").checked = e;
}
function Th(e) {
	oh.setEnabled(e), oh.init(), Q.soundEnabled = e, Wm(), wh();
}
Z("sound").onclick = () => Th(!oh.enabled), Z("sound-enabled").onchange = () => Th(Z("sound-enabled").checked), Z("music-volume").value = oh.state.musicVolume, Z("music-volume").oninput = () => {
	oh.setMusicVolume(+Z("music-volume").value), oh.init(), Q.musicVolume = oh.state.musicVolume, Wm();
}, wh(), Z("help-button").onclick = () => {
	nh = ["racing", "countdown"].includes($.phase), nh && bh(), Z("help-controls").innerHTML = Object.entries(Q.bindings).map(([e, t]) => `<span><b>${Nm(t)}</b> ${e}</span>`).join(""), Z("help").classList.remove("hidden");
}, Z("close-help").onclick = () => {
	Z("help").classList.add("hidden"), nh && $.phase === "paused" && bh(), nh = !1;
};
for (let e of document.querySelectorAll("[data-control]")) {
	let t = e.dataset.control;
	e.onpointerdown = (n) => {
		n.preventDefault(), e.setPointerCapture(n.pointerId), ah[t] = !0, t === "gravity" && (ch = !0), t === "jump" && (sh = !0), e.classList.add("held");
	};
	let n = () => {
		ah[t] = !1, e.classList.remove("held");
	};
	e.onpointerup = n, e.onpointercancel = n, e.onlostpointercapture = n;
}
addEventListener("keydown", (e) => {
	if (eh) {
		if (e.preventDefault(), !Object.values(Mm).includes(e.code) && !/^(Key[A-Z]|Enter|Arrow(Up|Down|Left|Right))$/.test(e.code)) {
			Z("binding-status").textContent = "Use a letter, arrow, Space, Shift, Enter or Escape.";
			return;
		}
		let t = Object.keys(Q.bindings).find((t) => Q.bindings[t] === e.code);
		t && t !== eh && (Q.bindings[t] = Q.bindings[eh]), Q.bindings[eh] = e.code, eh = null, Wm(), xh();
		return;
	}
	if (!["INPUT", "SELECT"].includes(document.activeElement?.tagName) && ((Object.values(Q.bindings).includes(e.code) || e.code.startsWith("Arrow")) && e.preventDefault(), !e.repeat)) {
		if (e.code === Q.bindings.pause || e.code === "Escape") {
			Z("settings").classList.contains("hidden") ? Z("help").classList.contains("hidden") ? Z("race-setup-modal").classList.contains("hidden") ? Z("garage").classList.contains("hidden") ? bh() : Z("close-garage").click() : Z("close-race-setup").click() : Z("close-help").click() : Z("close-settings").click();
			return;
		}
		if (e.code === Q.bindings.camera) {
			qm = qm === "chase" ? "wide" : "chase";
			return;
		}
		if (e.code === "Enter" && $.phase === "menu" && Z("settings").classList.contains("hidden") && Z("help").classList.contains("hidden")) {
			Z("race-setup-modal").classList.contains("hidden") ? Ch() : vh();
			return;
		}
		e.code === Q.bindings.jump && (sh = !0), e.code === Q.bindings.gravity && (ch = !0), ih.add(e.code);
	}
}), addEventListener("keyup", (e) => ih.delete(e.code));
var Eh = () => {
	mh(), ["racing", "countdown"].includes($.phase) && bh();
};
addEventListener("blur", Eh), document.addEventListener("visibilitychange", () => {
	document.hidden && Eh();
});
function Dh() {
	if (Xm) return;
	Xm = !0;
	let e = Xd(Hm, $);
	Wm();
	let t = $.end;
	Z("medal-label").textContent = t.medal + " orbit", Z("result-title").textContent = e.complete ? "Grand Orbit complete." : t.place === 1 ? "The stars are yours." : "An orbit to remember.", Z("result-copy").textContent = (e.newBest ? "New personal best. " : "") + (e.unlocks.length ? "Unlocked: " + e.unlocks.join(", ") : Bd($.courseId).name + " complete."), Z("result-place").textContent = $.mode === "trial" ? "SOLO" : `${t.place} / 6`, Z("result-time").textContent = hp(t.time), Z("result-score").textContent = t.score.toLocaleString(), Z("result-goals").textContent = e.earned.map((e) => e.toUpperCase() + " MEDAL").join(" · ");
	let n = Hm.championship || e.complete && Hm.lastChampionship;
	Z("championship-results").innerHTML = $.mode === "championship" && n ? `<div class="standings"><h3>${e.complete ? "FINAL STANDINGS" : "CHAMPIONSHIP STANDINGS"}</h3>${Yd(n).map((e, t) => `<div class="${e.id === 0 ? "you" : ""}"><span>${t + 1}. ${e.name}</span><b>${e.points} PTS</b></div>`).join("")}</div>` : "", Z("again").textContent = $.mode === "championship" ? e.complete ? "Race another championship ↗" : `Next race · ${Rd[n.round].name} ↗` : "Race again ↗";
}
function Oh() {
	if (Ym === $.phase) return;
	Ym = $.phase;
	for (let [e, t] of [
		["menu", "menu"],
		["pause", "paused"],
		["countdown", "countdown"],
		["results", "finished"],
		["lost", "lost"]
	]) Z(e).classList.toggle("hidden", $.phase !== t);
	let e = [
		"menu",
		"finished",
		"lost"
	].includes($.phase);
	Z("hud").classList.toggle("hidden", e), Z("race-progress").classList.toggle("hidden", e), Z("pause-button").classList.toggle("hidden", e), $.phase === "finished" && Dh();
}
function kh(e) {
	Oh(), fh($, e), $.phase !== "menu" && ($.phase === "countdown" && (Z("count-number").textContent = Math.max(1, Math.ceil($.countdown))), Z("place").textContent = $.mode === "trial" ? "TT" : String($.place).padStart(2, "0"), Z("place-total").textContent = $.mode === "trial" ? "" : "/ 06", Z("lap").textContent = $.mode === "free" ? `ORBIT ${$.lap}` : `LAP ${$.lap} / ${$.laps}`, Z("timer").textContent = hp($.time), Z("speed").textContent = Math.round($.speed * 3.6), Z("fuel-value").textContent = Math.round($.energy) + "%", Z("fuel-fill").style.width = $.energy + "%", Z("race-progress-fill").style.width = ($.mode === "free" ? $.s % ip / ip : $.s / ($.laps * ip)) * 100 + "%", Z("race-progress-label").textContent = ($.mode === "championship" ? `ROUND ${$.round + 1}/4 · ` : "") + xd($.s, $.route), document.querySelector("[data-control=boost]").disabled = !!$.flight, document.querySelector("[data-control=brake]").setAttribute("aria-label", $.flight ? "Descend" : "Brake"), Z("jump-button").disabled = $.flight?.mode === "sling" || !$.flight && $.speed < 3, Z("jump-button").textContent = $.flight?.mode === "drift" ? "RISE" : $.vehicle === "skate" ? $.air && $.air.vy > 0 ? "FLIP" : "OLLIE" : "JUMP", Z("gravity-charges").textContent = $.gravityCharges, Z("gravity-button").disabled = !Vf($), Z("gravity-button").classList.toggle("ready", (!!$.flight || Bf($)) && Vf($)), Z("gravity-status").textContent = $.flight ? $.flight.mode === "sling" ? "RETURNING TO THE RING" : `${Math.max(0, $.rules.rescue - $.flight.age).toFixed(1)}s TO RESCUE` : $.gravityTime > 0 ? `GRIP ${$.gravityTime.toFixed(1)}s` : "", Z("boost-banner").textContent = $.edgeWarning && !$.flight ? "EDGE · STEER INWARDS" : $.shortcut ? $.route === "upper" ? "UPPER LINE" : "LOWER LINE" : $.loop ? "LOOP LOCK" : $.air?.trick ? "KICKFLIP" : $.surge > 0 ? "LANDING SURGE" : $.boosting ? "STARDUST BOOST" : $.drafting ? "SLIPSTREAM" : rh ? "PERSONAL BEST GHOST" : "", Lm.classList.toggle("edge-warning", $.edgeWarning && !$.flight), Jm = Math.max(0, Jm - e), Z("notice").textContent = Jm > 0 ? $m : "");
}
function Ah() {
	for (let e of $.events) Km?.continuous.trigger(e), e.text && ($m = e.text, Jm = 3), oh.event(e), Q.haptics && Vm && [
		"hit",
		"stunt",
		"sling"
	].includes(e.type) && navigator.vibrate?.(e.type === "hit" ? 35 : 18);
}
var jh = performance.now(), Mh = 0, Nh = {
	particles: 0,
	triangles: 0,
	calls: 0
}, Ph = [], Fh = 0, Ih = 0;
function Lh(e) {
	requestAnimationFrame(Lh);
	let t = Math.max(.001, (e - jh) / 1e3), n = Math.min(.08, t);
	if (jh = e, !Km || Qm) return;
	Mh += n;
	let r = hh(n);
	for (Ih = Math.min(.12, Ih + n); Ih >= 1 / 60;) pp($, r, 1 / 60), Ah(), Ih -= 1 / 60, sh = ch = !1;
	Fh += n, (Fh >= .05 || Ym !== $.phase) && (kh(Fh), Fh = 0), $.ghost = Qd(rh, $.time), Nh = Km.update($, [
		"paused",
		"finished",
		"lost"
	].includes($.phase) ? 0 : n, Mh, qm), oh.update($, n), Ph.push(t), Ph.length > 180 && Ph.shift();
}
var Rh = new FontFace("Bebas Neue", "url(https://gamebuilderapi-thumbnailbucket3bc05c46-njaxbgcn5duh.s3.ap-south-1.amazonaws.com/47df78e2-1410-45d1-833c-196e1161c0b8/releases/20260912-synthwave-v1/assets/BebasNeue-Regular.ttf)");
document.fonts.add(Rh), Rh.load().catch(() => {}), Z("reload").onclick = () => location.reload(), ph(), await _h("painted"), jh = performance.now(), requestAnimationFrame(Lh), Rm.addEventListener("webglcontextlost", (e) => {
	e.preventDefault(), Eh(), Z("loading").classList.remove("hidden"), gh("The stars lost their connection. Reload to return."), Z("reload").classList.remove("hidden");
}), window.__orbit = { get state() {
	return {
		reentries: $.reentries || 0,
		standings: bf($),
		heading: $.heading,
		route: $.route,
		phase: $.phase,
		courseId: $.courseId,
		mode: $.mode,
		difficulty: $.difficulty,
		vehicle: $.vehicle,
		s: $.s,
		lane: $.lane,
		speed: $.speed,
		time: $.time,
		lap: $.lap,
		laps: $.laps,
		place: $.place,
		gravityTime: $.gravityTime,
		gravityCharges: $.gravityCharges,
		flight: $.flight ? { mode: $.flight.mode } : null,
		air: $.air,
		loop: $.loop ? {
			id: $.loop.def.id,
			t: $.loop.t
		} : null,
		tricks: $.tricks,
		loops: $.loops,
		stunts: $.stunts,
		energy: $.energy,
		score: $.score,
		dust: $.dust,
		surge: $.surge,
		boostTime: $.boostTime,
		boosting: $.boosting,
		lean: $.lean,
		respawns: $.respawns,
		end: $.end,
		rider: $.rider,
		profile: {
			races: Hm.races,
			unlocked: Hm.unlocked,
			championship: Hm.championship
		},
		...Nh,
		fps: Ph.length / (Ph.reduce((e, t) => e + t, 0) || 1),
		ready: Zm
	};
} }, new URLSearchParams(location.search).has("qa") && (Object.defineProperties(window.__orbit, {
	audio: { get: () => oh },
	world: { get: () => Km },
	race: { get: () => $ },
	profile: { get: () => Hm }
}), Object.assign(window.__orbit, {
	begin: vh,
	menu: yh,
	input: hh,
	set(e) {
		Object.assign($, e);
	},
	pose(e, t = 0) {
		$.s = e, $.lane = t, $.lateral = 0, $.heading = 0, $.steerRate = 0, $.groundedS = null, $.groundedRoute = null, $.checkpoint = Math.floor(e / (ip / 4)), $.lap = Math.floor(e / ip) + 1, Km.camera.userData.ready = !1;
	},
	advance(e, t) {
		for (let n = 0; n < e; n += 1 / 60) pp($, t, 1 / 60);
		kh(0);
	}
})), window.__game = {
	get scene() {
		return Km?.scene;
	},
	get camera() {
		return Km?.camera;
	},
	get renderer() {
		return Km?.renderer;
	},
	get state() {
		return __orbit.state;
	}
};
var zh = !1;
addEventListener("message", (e) => {
	e.source === parent && (e.data?.kind === "pause" ? (zh = ["racing", "countdown"].includes($.phase), zh && bh()) : e.data?.kind === "resume" && zh && (zh = !1, $.phase === "paused" && bh()));
}), Zm && parent !== window && parent.postMessage({ kind: "ready" }, "*");
//#endregion