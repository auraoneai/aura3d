import * as e from "three";
import { boot as t, tickVoxels as n } from "playlabs-boot";
const a = { BALL_RADIUS: 0.55, FORWARD_SPEED_INIT: 16, MAX_SPEED: 29, SPEED_INCREMENT: 0.26, STEER_SPEED: 10, LANE_HALF_WIDTH: 3, GATE_SPACING: 15, SHRINK_FACTOR: 0.8, GROW_FACTOR: 1.1, MAX_LIVES: 3, RAINBOW_DURATION: 5, TRAIL_DURATION: 6, SCORE_PER_METER: 1, SEGMENT_LENGTH: 1, CURVE_AMPLITUDE: 3, PALETTE: ["#f0433a", "#f9c647", "#5ecaf0", "#b868e8", "#fdf0e0"], POINTS_GATE: 40, POINTS_PERFECT: 60, PERFECT_WINDOW: 0.55, MAX_MULT: 5, COMBO_PER_MULT: 3, SCOREX2_DURATION: 7, MILESTONE_SCORE: 750 }, o = { phase: "splash", score: 0, distance: 0, lives: 3, speed: a.FORWARD_SPEED_INIT, laneOffset: 0, rainbowTimer: 0, trailTimer: 0, scoreX2Timer: 0, scoreX2Active: false, shieldActive: false, milestone: 750, squashT: 0, frameCount: 0, segmentCounter: 0, lastSegmentZ: 0, lastGateZ: -30, playerColorIndex: 0, ballScale: 1, lastCollisionRole: null, shakeTimer: 0, isRainbowActive: false, _rainbowVisual: false, combo: 0, multiplier: 1 };
function i() {
  const t3 = new e.Group(), n2 = 0.55, a2 = new e.SphereGeometry(n2, 32, 32), o2 = document.createElement("canvas");
  o2.width = 256, o2.height = 256;
  const i2 = o2.getContext("2d");
  i2.fillStyle = "#f0433a", i2.fillRect(0, 0, 256, 256), i2.fillStyle = "rgba(255,255,255,0.15)";
  for (let e2 = 0; e2 < 60; e2++) i2.beginPath(), i2.ellipse(256 * Math.random(), 256 * Math.random(), 30 * Math.random() + 10, 10 * Math.random() + 5, Math.random() * Math.PI, 0, 2 * Math.PI), i2.fill();
  const s2 = new e.CanvasTexture(o2), r2 = new e.MeshToonMaterial({ color: "#f0433a", map: s2 }), l2 = new e.Mesh(a2, r2);
  return l2.position.y = 0, t3.add(l2), t3.userData.bbox = { w: 1.1, h: 1.1, d: 1.1 }, t3;
}
function s() {
  const t3 = new e.Group(), n2 = 2.2, a2 = 0.46, o2 = new e.MeshToonMaterial({ color: "#f9c647" }), i2 = new e.CapsuleGeometry(a2, 4, 6, 16), s2 = new e.Mesh(i2, o2);
  s2.position.set(-2.66, 2 + a2, 0);
  const r2 = new e.Mesh(i2, o2);
  r2.position.set(n2 + a2, 2 + a2, 0);
  const l2 = new e.CapsuleGeometry(0.52, 6.24, 6, 16), p2 = new e.Mesh(l2, o2);
  p2.rotation.z = Math.PI / 2, p2.position.set(0, 4.92, 0), t3.add(s2, r2, p2);
  const c2 = 4.92 + 0.52;
  return t3.userData.bbox = { w: 6.24, h: c2, d: 1.92 }, t3;
}
function r() {
  const t3 = new e.Group(), n2 = new e.BoxGeometry(8, 0.3, 12), a2 = document.createElement("canvas");
  a2.width = 512, a2.height = 512;
  const o2 = a2.getContext("2d");
  o2.fillStyle = "#fdf0e0", o2.fillRect(0, 0, 512, 512), o2.fillStyle = "rgba(0,0,0,0.025)";
  for (let e2 = 0; e2 < 120; e2++) o2.fillRect(512 * Math.random(), 512 * Math.random(), 1.5, 1.5);
  const i2 = ["rgba(240,67,58,0.55)", "rgba(249,198,71,0.50)", "rgba(94,202,240,0.50)", "rgba(184,104,232,0.45)"];
  for (let e2 = 0; e2 < 10; e2++) {
    const e3 = 512 * Math.random(), t4 = 512 * Math.random(), n3 = 6 + 14 * Math.random();
    o2.fillStyle = i2[Math.floor(Math.random() * i2.length)], o2.beginPath(), o2.moveTo(e3 + n3, t4);
    const a3 = 6;
    for (let i3 = 0; i3 < a3; i3++) {
      const s3 = i3 / a3 * Math.PI * 2, r3 = (i3 + 1) / a3 * Math.PI * 2, l3 = n3 * (0.7 + 0.6 * Math.random()), p2 = n3 * (0.7 + 0.6 * Math.random());
      o2.bezierCurveTo(e3 + Math.cos(s3) * l3 * 1.2, t4 + Math.sin(s3) * l3 * 1.2, e3 + Math.cos(r3) * p2 * 1.2, t4 + Math.sin(r3) * p2 * 1.2, e3 + Math.cos(r3) * p2, t4 + Math.sin(r3) * p2);
    }
    o2.closePath(), o2.fill();
  }
  const s2 = new e.CanvasTexture(a2);
  s2.wrapS = e.ClampToEdgeWrapping, s2.wrapT = e.ClampToEdgeWrapping;
  const r2 = new e.MeshToonMaterial({ color: "#fdf0e0", map: s2 }), l2 = new e.Mesh(n2, r2);
  return l2.position.y = -0.15, t3.add(l2), t3.userData.bbox = { w: 8, h: 0.3, d: 12 }, t3;
}
function l() {
  const t3 = new e.Group(), n2 = new e.CapsuleGeometry(0.32, 5, 8, 20), a2 = new e.MeshToonMaterial({ color: "#c3b1f0" }), o2 = new e.Mesh(n2, a2);
  return o2.rotation.x = Math.PI / 2, o2.position.y = 0.32, t3.add(o2), t3.userData.bbox = { w: 0.64, h: 0.64, d: 5.6 }, t3;
}
function p() {
  const t3 = new e.Group(), n2 = new e.Shape();
  n2.moveTo(0, 0.5), n2.bezierCurveTo(0.5, 0.5, 0.8, 0.2, 0.8, -0.1), n2.bezierCurveTo(0.8, -0.5, 0.4, -0.8, 0, -0.8), n2.bezierCurveTo(-0.5, -0.8, -0.9, -0.4, -0.7, 0.1), n2.bezierCurveTo(-0.5, 0.5, -0.3, 0.5, 0, 0.5);
  const a2 = new e.ExtrudeGeometry(n2, { depth: 0.05, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.03, bevelThickness: 0.03 }), o2 = new e.MeshToonMaterial({ color: "#f0433a" }), i2 = new e.Mesh(a2, o2);
  i2.rotation.x = -Math.PI / 2, i2.scale.set(1.5, 1.5, 1.5), i2.position.y = 0.02;
  const s2 = new e.CylinderGeometry(0.15, 0.15, 0.05, 16), r2 = new e.Mesh(s2, o2);
  r2.position.set(1.5, 0.02, 1.2);
  const l2 = new e.Mesh(s2, o2);
  return l2.position.set(-1.2, 0.02, -1.5), t3.add(i2, r2, l2), t3.userData.bbox = { w: 3.5, h: 0.1, d: 3.5 }, t3;
}
function c() {
  const t3 = new e.Group(), n2 = new e.SphereGeometry(0.4, 32, 32), a2 = new e.ConeGeometry(0.4, 0.8, 32);
  a2.translate(0, 0.4, 0);
  const o2 = new e.MeshToonMaterial({ color: "#b868e8" }), i2 = new e.Mesh(n2, o2), s2 = new e.Mesh(a2, o2);
  return t3.add(i2, s2), t3.userData.bbox = { w: 0.8, h: 1.2, d: 0.8 }, t3;
}
function m() {
  const t3 = new e.Group(), n2 = new e.SphereGeometry(120, 32, 32), a2 = document.createElement("canvas");
  a2.width = 2, a2.height = 512;
  const o2 = a2.getContext("2d"), i2 = o2.createLinearGradient(0, 0, 0, 512);
  i2.addColorStop(0, "#1773c0"), i2.addColorStop(0.45, "#3fb0e6"), i2.addColorStop(0.75, "#79cef0"), i2.addColorStop(1, "#a9e0f7"), o2.fillStyle = i2, o2.fillRect(0, 0, 2, 512);
  const s2 = new e.CanvasTexture(a2), r2 = new e.MeshBasicMaterial({ map: s2, side: e.BackSide, fog: false }), l2 = new e.Mesh(n2, r2);
  return t3.add(l2), t3.userData.bbox = { w: 240, h: 240, d: 240 }, t3;
}
function d() {
  const t3 = new e.Group(), n2 = new e.BoxGeometry(0.15, 0.02, 1.2), a2 = new e.MeshToonMaterial({ color: "#ffffff", transparent: true, opacity: 0.6 }), o2 = new e.Mesh(n2, a2);
  return o2.position.y = 0.01, t3.add(o2), t3.userData.bbox = { w: 0.15, h: 0.02, d: 1.2 }, t3;
}
function h(e2, t3, n2) {
  const a2 = document.createElement("div");
  return a2.id = e2, a2.className = "game-ui", a2.style.cssText = `position:fixed;inset:0;background:${t3};display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:10;text-align:center;backdrop-filter:blur(4px);`, a2.innerHTML = `<div class="overlay-card">${n2}</div>`, a2;
}
window.__game = window.__game || {}, Object.assign(window.__game, { CONFIG: a, state: o }), window.__getGameState = () => o, window.__gameEntities = { player: null, obstacles: [], collectibles: [], registerObstacle(e2) {
  this.obstacles = this.obstacles.filter((e3) => null !== e3.parent), this.obstacles.push(e2);
}, registerCollectible(e2) {
  this.collectibles = this.collectibles.filter((e3) => null !== e3.parent), this.collectibles.push(e2);
} }, window.__game = window.__game || {}, window.__game.factories = { makePaintBall: i, makeColorGate: s, makeRampSegment: r, makeGuardRail: l, makeSplatterPuddle: p, makePowerupDrop: c, makeSkyBackdrop: m, makeCloudPuff: function() {
  const t3 = new e.Group(), n2 = new e.MeshToonMaterial({ color: "#ffffff" }), a2 = new e.SphereGeometry(2.5, 16, 16), o2 = new e.Mesh(a2, n2), i2 = new e.SphereGeometry(1.8, 16, 16), s2 = new e.Mesh(i2, n2);
  s2.position.set(-2, -0.5, 0);
  const r2 = new e.SphereGeometry(1.5, 16, 16), l2 = new e.Mesh(r2, n2);
  l2.position.set(2, -0.8, 0.5);
  const p2 = new e.SphereGeometry(1.2, 16, 16), c2 = new e.Mesh(p2, n2);
  return c2.position.set(1, -1, -1), t3.add(o2, s2, l2, c2), t3.userData.bbox = { w: 7, h: 5, d: 5 }, t3;
}, makeRollingHill: function() {
  const t3 = new e.Group(), n2 = new e.SphereGeometry(15, 32, 16, 0, 2 * Math.PI, 0, Math.PI / 2), a2 = new e.MeshToonMaterial({ color: "#fdf0e0" }), o2 = new e.Mesh(n2, a2);
  return o2.scale.set(1, 0.6, 1), t3.add(o2), t3.userData.bbox = { w: 30, h: 9, d: 30 }, t3;
}, makeLaneMarkings: d, makePaintDrip: function() {
  const t3 = new e.Group(), n2 = new e.SphereGeometry(0.15, 16, 16), a2 = new e.ConeGeometry(0.15, 0.6, 16);
  a2.translate(0, 0.3, 0);
  const o2 = new e.MeshToonMaterial({ color: "#f9c647" }), i2 = new e.Mesh(n2, o2);
  i2.position.y = -0.6;
  const s2 = new e.Mesh(a2, o2);
  return s2.position.y = -0.6, t3.add(i2, s2), t3.userData.bbox = { w: 0.3, h: 0.9, d: 0.3 }, t3;
} };
const u = {};
window.__game = window.__game || {}, window.__game.ui = { initUI: function() {
  const e2 = document.createElement("style");
  if (e2.textContent = "\n        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap');\n        .game-ui { font-family: 'Nunito', system-ui, sans-serif; user-select: none; }\n        .hud-text { font-size: 28px; font-weight: 900; color: #fdf0e0; -webkit-text-stroke: 2px #333; text-shadow: 3px 3px 0 #333, 0 4px 10px rgba(0,0,0,0.3); letter-spacing: 1px; }\n        .btn { \n            padding: 15px 50px; font-size: 32px; font-weight: 900; font-family: inherit; \n            background: linear-gradient(180deg, #f0433a, #d93a32); \n            color: #fdf0e0; border: 4px solid #333; border-radius: 40px; cursor: pointer; text-transform: uppercase; \n            box-shadow: 0 8px 0 #333, 0 15px 20px rgba(0,0,0,0.3); transition: all 0.1s; \n            text-shadow: 2px 2px 0 #333; animation: pulse 2s infinite;\n        }\n        .btn:active { transform: translateY(8px); box-shadow: 0 0 0 #333, 0 5px 10px rgba(0,0,0,0.3); animation: none; }\n        @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }\n        .life-icon { \n            width: 32px; height: 32px; background: #f0433a; border-radius: 50% 50% 50% 10%; transform: rotate(-45deg);\n            display: inline-block; margin: 0 8px; border: 3px solid #333; box-shadow: 2px 2px 0 #333;\n            position: relative; overflow: hidden; transition: all 0.3s;\n        }\n        .life-icon::after { content: ''; position: absolute; top: 4px; left: 4px; width: 10px; height: 10px; background: rgba(255,255,255,0.6); border-radius: 50%; }\n        .life-lost { background: #888; filter: grayscale(100%); opacity: 0.5; transform: rotate(-45deg) scale(0.8); box-shadow: 0 0 0 #333; }\n        .popup-text {\n            position: absolute; font-size: 48px; font-weight: 900; color: #fff; -webkit-text-stroke: 2px #333;\n            text-shadow: 4px 4px 0 #333, 0 0 20px rgba(255,255,255,0.5); pointer-events: none; z-index: 20;\n            animation: floatUp 1s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;\n            transform: translate(-50%, -50%); font-family: 'Nunito', system-ui, sans-serif;\n        }\n        @keyframes floatUp {\n            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5) rotate(-8deg); }\n            25% { opacity: 1; transform: translate(-50%, -68%) scale(1.15) rotate(4deg); }\n            75% { opacity: 1; transform: translate(-50%, -92%) scale(1) rotate(0deg); }\n            100% { opacity: 0; transform: translate(-50%, -110%) scale(0.85); }\n        }\n        #hud-powerups { display: flex; }\n        .pu { display: inline-flex; align-items: center; font-family: 'Nunito', system-ui, sans-serif; font-weight: 900; font-size: 16px; color: #fff; -webkit-text-stroke: 1px #333; padding: 6px 14px; border-radius: 100px; border: 2px solid #333; box-shadow: 0 3px 0 #333; white-space: nowrap; }\n        .pu-rainbow { background: linear-gradient(90deg, #f0433a, #f9c647, #5ecaf0, #b868e8); }\n        .pu-shield { background: #5ecaf0; }\n        .pu-x2 { background: #f9c647; }\n        .overlay-card {\n            background: #fdf0e0; border: 6px solid #333; border-radius: 30px; padding: 50px 40px;\n            box-shadow: 12px 12px 0 rgba(0,0,0,0.2), inset -5px -5px 0 rgba(0,0,0,0.05);\n            display: flex; flex-direction: column; align-items: center; max-width: 500px;\n            animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);\n        }\n        @keyframes popIn {\n            0% { transform: scale(0.8); opacity: 0; }\n            100% { transform: scale(1); opacity: 1; }\n        }\n        #splash-screen h1 { animation: titleBounce 0.7s cubic-bezier(0.175,0.885,0.32,1.275) both; }\n        @keyframes titleBounce { 0% { transform: scale(0.3) rotate(-8deg); opacity: 0; } 60% { transform: scale(1.1) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }\n        #splash-screen .btn { animation: pulse 1.4s infinite; }\n        #gameover-screen h1 { animation: burstPop 0.5s cubic-bezier(0.175,0.885,0.32,1.275) both; }\n        .go-best { font-size: 0.62em; color: #f0433a; display: inline-block; margin-top: 0.35em; -webkit-text-stroke: 0; }\n        @keyframes burstPop { 0% { transform: scale(0) rotate(-14deg); } 55% { transform: scale(1.3) rotate(7deg); } 100% { transform: scale(1) rotate(0); } }\n    ", document.head.appendChild(e2), typeof AstroSDK < "u") {
    const e3 = document.createElement("style");
    e3.textContent = "\n            .hud-text { font-size: 5vw !important; -webkit-text-stroke-width: 0.45vw !important; text-shadow: 0.4vw 0.4vw 0 #333 !important; letter-spacing: 0.2vw !important; }\n            #hud-combo { font-size: 4.8vw !important; top: 9vw !important; right: 4vw !important; }\n            #hud-powerup { font-size: 4.8vw !important; bottom: 6vw !important; }\n            .btn { font-size: 5.6vw !important; padding: 2.8vw 9vw !important; border-radius: 100vw !important; border-width: 0.7vw !important; box-shadow: 0 1.3vw 0 #333, 0 2.4vw 3vw rgba(0,0,0,0.3) !important; text-shadow: 0.35vw 0.35vw 0 #333 !important; }\n            .btn:active { box-shadow: 0 0 0 #333, 0 0.8vw 1.6vw rgba(0,0,0,0.3) !important; }\n            .life-icon { width: 7vw !important; height: 7vw !important; margin: 0 1.3vw !important; border-width: 0.55vw !important; box-shadow: 0.35vw 0.35vw 0 #333 !important; }\n            .life-icon::after { top: 0.8vw !important; left: 0.8vw !important; width: 2vw !important; height: 2vw !important; }\n            .popup-text { font-size: 4.6vw !important; -webkit-text-stroke-width: 0.18vw !important; white-space: nowrap !important; text-shadow: 0.25vw 0.25vw 0 #333 !important; }\n            .overlay-card { padding: 7vw 6vw !important; border-width: 1vw !important; border-radius: 5vw !important; max-width: 84vw !important; box-shadow: 1.4vw 1.4vw 0 rgba(0,0,0,0.18) !important; }\n            #splash-screen h1 { font-size: 12.5vw !important; -webkit-text-stroke-width: 0.5vw !important; text-shadow: 0.7vw 0.7vw 0 #333 !important; margin-bottom: 3vw !important; }\n            #splash-screen p { font-size: 3.9vw !important; margin-bottom: 6vw !important; }\n            #gameover-screen h1 { font-size: 11vw !important; -webkit-text-stroke-width: 0.4vw !important; text-shadow: 0.55vw 0.55vw 0 #333 !important; }\n            #final-score { font-size: 5.2vw !important; margin-bottom: 6vw !important; }\n            #hud-powerups { gap: 2.4vw !important; bottom: 6vw !important; }\n            #hud-powerups .pu { font-size: 3.7vw !important; padding: 1.5vw 3.6vw !important; border-width: 0.5vw !important; box-shadow: 0 0.7vw 0 #333 !important; -webkit-text-stroke-width: 0.22vw !important; }\n        ", document.head.appendChild(e3);
  }
  if (typeof CrazyPort < "u") {
    const e3 = document.createElement("style");
    e3.textContent = "\n            .hud-text { font-size: clamp(16px, 3.4vw, 30px) !important; -webkit-text-stroke-width: 2px !important; }\n            #hud-combo { font-size: clamp(15px, 3.2vw, 26px) !important; }\n            .btn { font-size: min(clamp(18px, 4.4vw, 32px), 4.6vh) !important; padding: min(clamp(9px,2.2vw,15px),2.2vh) min(clamp(24px,7vw,48px),8vw) !important; }\n            .life-icon { width: clamp(20px,4.6vw,34px) !important; height: clamp(20px,4.6vw,34px) !important; margin: 0 clamp(4px,1vw,8px) !important; }\n            .life-icon::after { width: clamp(6px,1.4vw,10px) !important; height: clamp(6px,1.4vw,10px) !important; top: clamp(2px,0.9vw,4px) !important; left: clamp(2px,0.9vw,4px) !important; }\n            .popup-text { font-size: clamp(18px, 3.6vw, 34px) !important; white-space: nowrap !important; }\n            .overlay-card { max-width: min(88vw, 460px) !important; max-height: 94vh !important; overflow: hidden !important; padding: min(clamp(20px,4.6vw,42px),5vh) min(clamp(18px,4vw,38px),5vw) !important; }\n            #splash-screen h1 { font-size: min(clamp(40px, 11vw, 74px), 13vh) !important; margin-bottom: min(2vh, 14px) !important; line-height: 1.05 !important; }\n            #splash-screen p { font-size: min(clamp(14px, 3.4vw, 20px), 3.3vh) !important; margin-bottom: min(2.4vh, 18px) !important; line-height: 1.3 !important; }\n            #splash-best { font-size: min(clamp(16px, 3.8vw, 24px), 3.4vh) !important; margin-bottom: min(2.4vh, 18px) !important; }\n            #gameover-screen h1 { font-size: min(clamp(38px, 10vw, 62px), 12vh) !important; margin-bottom: min(2vh, 12px) !important; }\n            #final-score { font-size: min(clamp(20px, 5vw, 34px), 4.4vh) !important; margin-bottom: min(2.4vh, 18px) !important; }\n            #hud-powerups { gap: clamp(6px,1.6vw,12px) !important; bottom: clamp(16px,5vw,40px) !important; }\n            #hud-powerups .pu { font-size: clamp(12px,2.7vw,16px) !important; padding: clamp(4px,1vw,6px) clamp(9px,2.4vw,14px) !important; }\n        ", document.head.appendChild(e3);
  }
  const t3 = document.createElement("div");
  t3.className = "game-ui", t3.style.cssText = "position:fixed;top:0;left:0;right:0;padding:20px;display:flex;justify-content:space-between;pointer-events:none;z-index:5;";
  const n2 = document.createElement("div");
  n2.id = "hud-score", n2.className = "hud-text", n2.textContent = "SCORE: 0";
  const a2 = document.createElement("div");
  a2.id = "hud-combo", a2.className = "hud-text", a2.style.cssText = "position:absolute; top: 60px; right: 20px; color: #f9c647; font-size: 24px; text-shadow: 2px 2px 0 #333, 0 0 10px rgba(0,0,0,0.5); transition: transform 0.1s; display: none;";
  const o2 = document.createElement("div");
  o2.id = "hud-lives", o2.innerHTML = '<div class="life-icon"></div><div class="life-icon"></div><div class="life-icon"></div>';
  const i2 = document.createElement("div");
  i2.id = "hud-powerups", i2.className = "game-ui", i2.style.cssText = "position:fixed;bottom:40px;left:50%;transform:translateX(-50%);display:none;gap:12px;z-index:6;pointer-events:none;";
  const s2 = document.createElement("div");
  s2.id = "popup-container", s2.className = "game-ui", s2.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:15;overflow:hidden;", t3.appendChild(o2), t3.appendChild(n2), t3.appendChild(a2), document.body.appendChild(t3), document.body.appendChild(i2), document.body.appendChild(s2);
  const r2 = h("splash-screen", "rgba(94, 202, 240, 0.8)", '\n        <h1 style="font-size:72px;margin:0 0 15px;color:#f0433a;-webkit-text-stroke:3px #333;text-shadow:6px 6px 0 #333, 0 0 20px rgba(240,67,58,0.5);line-height:1.1;">SPLAT<br>RUSH</h1>\n        <p style="font-size:22px;margin-bottom:24px;color:#555;font-weight:900;line-height:1.4;">Drag left/right to steer.<br>Match colors for combos & big scores.<br>Grab \u{1F308} Rainbow \xB7 \u{1F6E1} Shield \xB7 \u2726 2x \xB7 \u{1F3A8} Switch!</p>\n        <p id="splash-best" style="font-size:24px;font-weight:900;color:#f0433a;margin:0 0 28px;-webkit-text-stroke:1px #333;display:none;">\u{1F3C6} Best: 0</p>\n        <button class="btn" id="btn-start">Play Now</button>\n    '), l2 = h("gameover-screen", "rgba(240, 67, 58, 0.32)", '\n        <h1 style="font-size:64px;margin:0 0 15px;color:#f0433a;-webkit-text-stroke:3px #333;text-shadow:6px 6px 0 #333;">BURST!</h1>\n        <p id="final-score" style="font-size:36px;font-weight:900;color:#333;margin-bottom:40px;">Score: 0</p>\n        <button class="btn" id="btn-restart" style="background:linear-gradient(180deg, #f9c647, #d4a322);">Play Again</button>\n    ');
  return l2.style.display = "none", document.body.appendChild(r2), document.body.appendChild(l2), { scoreDiv: n2, livesDiv: o2, powerupDiv: i2, comboDiv: a2, splash: r2, gameover: l2 };
}, updateHUD: function(e2, t3, n2, a2, i2 = 0, s2 = 1) {
  e2.scoreDiv.textContent = `SCORE: ${Math.floor(t3)}`;
  let r2 = "";
  for (let e3 = 0; e3 < 3; e3++) r2 += `<div class="life-icon ${e3 >= n2 ? "life-lost" : ""}"></div>`;
  e2.livesDiv.innerHTML = r2;
  const l2 = document.getElementById("hud-powerups");
  if (l2 && typeof o < "u") {
    let e3 = "";
    o.rainbowTimer > 0 && (e3 += `<span class="pu pu-rainbow">\u{1F308} ${Math.ceil(o.rainbowTimer)}s</span>`), o.shieldActive && (e3 += '<span class="pu pu-shield">\u{1F6E1} SHIELD</span>'), o.scoreX2Timer > 0 && (e3 += `<span class="pu pu-x2">\u2726 2x ${Math.ceil(o.scoreX2Timer)}s</span>`), l2.innerHTML = e3, l2.style.display = e3 ? "flex" : "none";
  }
  if (i2 > 0) {
    const t4 = `${i2} COMBO${s2 > 1 ? "  x" + s2 : ""}`;
    e2.comboDiv.dataset.lastCombo !== String(i2) && (e2.comboDiv.dataset.lastCombo = String(i2), e2.comboDiv.style.transform = `scale(${1.3 + 0.15 * (s2 - 1)})`, setTimeout(() => {
      e2.comboDiv && (e2.comboDiv.style.transform = `scale(${1 + 0.08 * (s2 - 1)})`);
    }, 100)), e2.comboDiv.textContent = t4, e2.comboDiv.style.display = "block", e2.comboDiv.style.color = s2 >= 4 ? "#f0433a" : 3 === s2 ? "#b868e8" : 2 === s2 ? "#5ecaf0" : "#f9c647";
  } else e2.comboDiv.style.display = "none", e2.comboDiv.dataset.lastCombo = "0";
}, showSplash: function(e2, t3) {
  e2.splash.style.display = t3 ? "flex" : "none";
}, showGameOver: function(e2, t3, n2, a2) {
  if (e2.gameover.style.display = t3 ? "flex" : "none", !t3) return;
  const o2 = document.getElementById("final-score"), i2 = Math.floor(n2), s2 = "number" == typeof a2 && a2 > 0, r2 = performance.now(), l2 = () => {
    const e3 = Math.min(1, (performance.now() - r2) / 800), t4 = Math.floor(i2 * (1 - Math.pow(1 - e3, 3)));
    o2.innerHTML = "Score: " + t4.toLocaleString() + (e3 >= 1 && s2 ? '<br><span class="go-best">\u{1F3C6} Best: ' + Math.floor(a2).toLocaleString() + "</span>" : ""), e3 < 1 && requestAnimationFrame(l2);
  };
  l2();
}, showPopup: function(e2, t3, n2, a2) {
  const o2 = document.getElementById("popup-container");
  if (!o2) return;
  const i2 = performance.now();
  if (u[e2] && i2 - u[e2] < 550) return;
  for (u[e2] = i2; o2.children.length > 2; ) o2.removeChild(o2.firstChild);
  const s2 = document.createElement("div");
  s2.className = "popup-text", s2.textContent = e2, s2.style.color = t3, s2.style.left = n2 + "px", s2.style.top = a2 + "px", o2.appendChild(s2), setTimeout(() => {
    try {
      s2.remove();
    } catch {
    }
  }, 950);
} };
const { renderer: f, scene: w, camera: x, clock: b, canvas: g } = t({ camera: "custom", lighting: false }), y = Math.PI, v = 0.55, M = 0.65, T = 0.25, E = "#bfdcee", _ = 7833770;
w.background = new e.Color(E), w.fog = null, w.add(new e.HemisphereLight(16777215, _, v * y));
const S = new e.DirectionalLight(16777215, M * y);
S.position.set(6, 12, 6), S.castShadow = true, S.shadow.mapSize.set(1024, 1024), S.shadow.camera.left = -14, S.shadow.camera.right = 14, S.shadow.camera.top = 14, S.shadow.camera.bottom = -14, S.shadow.camera.near = 1, S.shadow.camera.far = 50, w.add(S);
const D = new e.DirectionalLight(10075135, T * y);
function C() {
  if (!x.isPerspectiveCamera) return;
  const e2 = f.domElement, t3 = e2.clientWidth || window.innerWidth || 1280, n2 = e2.clientHeight || window.innerHeight || 720;
  !t3 || !n2 || (x.aspect = t3 / n2, x.fov = (function(e3) {
    return e3 >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - e3) / 0.5);
  })(x.aspect), x.updateProjectionMatrix());
}
D.position.set(-6, 8, -6), w.add(D), f.toneMapping = e.NoToneMapping, f.toneMappingExposure = 1, C(), window.addEventListener("resize", C);
const A = typeof AstroSDK < "u", I = typeof CrazyPort < "u", z = A ? AstroSDK : I ? CrazyPort : null, R = A && AstroSDK.isEdit;
I && CrazyPort.game.loadingStart(), R || (x.position.set(0, 15, 18), o.introT = 2);
let G = 0;
function P() {
  const e2 = document.getElementById("splash-best");
  e2 && (e2.textContent = "\u{1F3C6} Best: " + G, e2.style.display = G > 0 ? "block" : "none");
}
z && !R && z.load().then((e2) => {
  e2 && "number" == typeof e2.best && (G = e2.best, P());
}).catch(() => {
});
let O = null;
const k = { master: null, musicGain: null, sfxGain: null, muted: false, _timer: null, _step: 0, _next: 0, _nbuf: null };
function L() {
  !(function() {
    if (O) return O;
    try {
      O = new (window.AudioContext || window.webkitAudioContext)(), k.master = O.createGain(), k.master.gain.value = 0.9, k.master.connect(O.destination), k.musicGain = O.createGain(), k.musicGain.gain.value = 1e-4, k.musicGain.connect(k.master), k.sfxGain = O.createGain(), k.sfxGain.gain.value = 0.9, k.sfxGain.connect(k.master);
    } catch {
      return O = null, null;
    }
  })();
  try {
    O && "suspended" === O.state && O.resume();
  } catch {
  }
  !(function() {
    if (!O || k._timer) return;
    try {
      k.musicGain.gain.setTargetAtTime(k.muted ? 1e-4 : 0.09, O.currentTime, 1.5);
    } catch {
    }
    k._step = 0, k._next = O.currentTime + 0.1;
    const e2 = 60 / 132 / 2, t3 = () => {
      if (O) for (; k._next < O.currentTime + 0.2; ) {
        const t4 = k._next, n2 = k._step, a2 = Z[n2 % Z.length], o2 = O.createOscillator(), i2 = O.createGain();
        if (o2.type = "triangle", o2.frequency.value = N(a2), i2.gain.setValueAtTime(1e-4, t4), i2.gain.exponentialRampToValueAtTime(0.06, t4 + 0.02), i2.gain.exponentialRampToValueAtTime(1e-4, t4 + 0.9 * e2), o2.connect(i2), i2.connect(k.musicGain), o2.start(t4), o2.stop(t4 + e2), n2 % 2 == 0) {
          const a3 = $[n2 / 2 % $.length], o3 = O.createOscillator(), i3 = O.createGain();
          o3.type = "sine", o3.frequency.value = N(a3), i3.gain.setValueAtTime(1e-4, t4), i3.gain.exponentialRampToValueAtTime(0.09, t4 + 0.02), i3.gain.exponentialRampToValueAtTime(1e-4, t4 + 1.8 * e2), o3.connect(i3), i3.connect(k.musicGain), o3.start(t4), o3.stop(t4 + 2 * e2);
        }
        k._next += e2, k._step++;
      }
    };
    k._timer = setInterval(t3, 40);
  })();
}
function N(e2) {
  return 523.25 * Math.pow(2, e2 / 12);
}
function U({ freq: e2 = 440, type: t3 = "sine", dur: n2 = 0.15, gain: a2 = 0.2, slideTo: o2 = null, delay: i2 = 0 }) {
  if (!O) return;
  const s2 = O.currentTime + i2, r2 = O.createOscillator(), l2 = O.createGain();
  r2.type = t3, r2.frequency.setValueAtTime(e2, s2), o2 && r2.frequency.exponentialRampToValueAtTime(Math.max(20, o2), s2 + n2), l2.gain.setValueAtTime(1e-4, s2), l2.gain.exponentialRampToValueAtTime(a2, s2 + 8e-3), l2.gain.exponentialRampToValueAtTime(1e-4, s2 + n2), r2.connect(l2), l2.connect(k.sfxGain), r2.start(s2), r2.stop(s2 + n2 + 0.02);
}
function B({ dur: e2 = 0.2, gain: t3 = 0.15, freq: n2 = 1200, q: a2 = 1, type: o2 = "bandpass", slideTo: i2 = null }) {
  if (!O) return;
  const s2 = O.currentTime;
  if (!k._nbuf) {
    const e3 = Math.floor(0.4 * O.sampleRate), t4 = O.createBuffer(1, e3, O.sampleRate), n3 = t4.getChannelData(0);
    for (let t5 = 0; t5 < e3; t5++) n3[t5] = 2 * Math.random() - 1;
    k._nbuf = t4;
  }
  const r2 = O.createBufferSource();
  r2.buffer = k._nbuf;
  const l2 = O.createBiquadFilter();
  l2.type = o2, l2.frequency.setValueAtTime(n2, s2), l2.Q.value = a2, i2 && l2.frequency.exponentialRampToValueAtTime(Math.max(40, i2), s2 + e2);
  const p2 = O.createGain();
  p2.gain.setValueAtTime(t3, s2), p2.gain.exponentialRampToValueAtTime(1e-4, s2 + e2), r2.connect(l2), l2.connect(p2), p2.connect(k.sfxGain), r2.start(s2), r2.stop(s2 + e2 + 0.02);
}
const q = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
function X(e2, t3) {
  const n2 = N(q[Math.min(q.length - 1, e2)]);
  U({ freq: n2, type: "triangle", dur: 0.16, gain: 0.22, slideTo: 1.5 * n2 }), t3 && (U({ freq: 2 * n2, type: "sine", dur: 0.22, gain: 0.16, delay: 0.02, slideTo: 3 * n2 }), B({ dur: 0.18, gain: 0.07, freq: 4e3, type: "highpass", slideTo: 9e3 }));
}
function H() {
  U({ freq: 180, type: "sawtooth", dur: 0.32, gain: 0.22, slideTo: 55 }), B({ dur: 0.26, gain: 0.12, freq: 420, q: 0.7, slideTo: 110 });
}
function W() {
  U({ freq: 600, type: "sine", dur: 0.22, gain: 0.18, slideTo: 1300 }), U({ freq: 900, type: "triangle", dur: 0.25, gain: 0.12, delay: 0.05, slideTo: 1800 });
}
function F() {
  U({ freq: 400, type: "square", dur: 0.18, gain: 0.13, slideTo: 720 }), B({ dur: 0.2, gain: 0.09, freq: 2200, type: "bandpass", q: 3 });
}
function V() {
  U({ freq: 240, type: "sawtooth", dur: 0.5, gain: 0.26, slideTo: 40 }), B({ dur: 0.55, gain: 0.22, freq: 900, q: 0.6, slideTo: 80 }), U({ freq: 120, type: "sine", dur: 0.6, gain: 0.2, slideTo: 30, delay: 0.02 });
}
const Z = [0, 4, 7, 4, 9, 7, 4, 2, 0, 4, 7, 12, 9, 7, 4, 0], $ = [-12, -12, -5, -5, -8, -8, -10, -10];
const j = a.PALETTE.slice(0, 4), K = j.map((t3) => new e.MeshToonMaterial({ color: t3 })), Y = new e.MeshToonMaterial({ color: 16777215 }), Q = (new e.MeshToonMaterial({ color: 12085480 }), new e.MeshToonMaterial({ color: 6212336 })), J = new e.MeshToonMaterial({ color: 4054148 }), ee = new e.Color(), te = new e.Mesh(new e.SphereGeometry(1, 20, 16), new e.MeshBasicMaterial({ color: 6212336, transparent: true, opacity: 0.22, depthWrite: false }));
te.visible = false, w.add(te);
let ne = 0;
const ae = new e.MeshToonMaterial({ color: 16369223 });
function oe(e2, t3, n2) {
  if (!window.__game.ui || !window.__game.ui.showPopup) return;
  const a2 = f.domElement.getBoundingClientRect(), o2 = (n2 || 1.6) >= 2.5 ? 0.09 : 0.16, i2 = a2.left + a2.width * (0.42 + 0.16 * Math.random()), s2 = a2.top + a2.height * o2;
  window.__game.ui.showPopup(e2, t3, i2, s2);
}
const ie = { segments: [], gates: [], splatters: [], powerups: [] }, se = { segments: [], gates: [], splatters: [], powerups: [] }, re = window.__game.ui.initUI(), le = new e.SphereGeometry(0.13, 6, 6), pe = [];
for (let t3 = 0; t3 < 90; t3++) {
  const t4 = new e.Mesh(le, new e.MeshToonMaterial({ color: 16777215 }));
  t4.visible = false, w.add(t4), pe.push(t4);
}
function ce(e2, t3, n2, a2) {
  let o2 = 0;
  for (let i2 = 0; i2 < pe.length && o2 < n2; i2++) {
    const n3 = pe[i2];
    if (n3.visible) continue;
    o2++, n3.material.color.set(t3), n3.visible = true, n3.position.copy(e2), n3.position.y += 0.3;
    const s2 = Math.random() * Math.PI * 2;
    n3.userData.vx = Math.cos(s2) * a2 * (0.6 + Math.random()), n3.userData.vy = (2 + 3.5 * Math.random()) * (0.6 + 0.25 * a2), n3.userData.vz = Math.sin(s2) * a2 * (0.6 + Math.random()) - 1.5, n3.userData.life = n3.userData.max = 0.55 + 0.35 * Math.random(), n3.userData.s0 = 0.7 + 0.9 * Math.random();
  }
}
let me = null, de = null, he = null;
function ue() {
  me || (me = document.createElement("div"), me.className = "game-ui", me.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:8;opacity:0;mix-blend-mode:screen;transition:opacity 0.35s ease-out;", document.body.appendChild(me), de = document.createElement("div"), de.className = "game-ui", de.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;transition:opacity 0.25s;", document.body.appendChild(de), he = document.createElement("div"), he.className = "game-ui", he.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9;opacity:0;background:#f0433a;clip-path:circle(0% at 50% 62%);", document.body.appendChild(he));
}
function fe(e2) {
  ue(), he.style.transition = "none", he.style.background = e2, he.style.opacity = "1", he.style.clipPath = "circle(0% at 50% 62%)", requestAnimationFrame(() => {
    he.style.transition = "clip-path 0.65s cubic-bezier(0.45,0,0.2,1)", he.style.clipPath = "circle(150% at 50% 62%)";
  });
}
function we(e2, t3) {
  ue(), me.style.transition = "none", me.style.background = e2, me.style.opacity = t3, requestAnimationFrame(() => {
    me.style.transition = "opacity 0.35s ease-out", me.style.opacity = 0;
  });
}
function xe(e2) {
  o._fovPunch = Math.max(o._fovPunch || 0, e2);
}
const be = new e.Group();
w.add(be);
const ge = i();
ge.position.set(0, a.BALL_RADIUS, 0);
let ye = 0;
ge.userData.role = "player", w.add(ge), window.__gameEntities.player = ge;
const ve = m();
w.add(ve);
const Me = (function() {
  const t3 = [[2.6, 0, 0, 0], [1.9, -2.1, -0.5, 0.2], [1.6, 2.1, -0.8, 0.5], [1.3, 1, -1, -1], [1.5, -0.7, 0.4, 1.1]].map(([t4, n3, a3, o3]) => {
    const i3 = new e.SphereGeometry(t4, 12, 10);
    return i3.translate(n3, a3, o3), i3.index ? i3.toNonIndexed() : i3;
  });
  let n2 = 0;
  t3.forEach((e2) => n2 += e2.attributes.position.array.length);
  const a2 = new Float32Array(n2), o2 = new Float32Array(n2);
  let i2 = 0;
  t3.forEach((e2) => {
    a2.set(e2.attributes.position.array, i2), o2.set(e2.attributes.normal.array, i2), i2 += e2.attributes.position.array.length;
  });
  const s2 = new e.BufferGeometry();
  return s2.setAttribute("position", new e.BufferAttribute(a2, 3)), s2.setAttribute("normal", new e.BufferAttribute(o2, 3)), s2.computeBoundingSphere(), s2;
})(), Te = new e.MeshToonMaterial({ color: "#ffffff", fog: false }), Ee = new e.MeshToonMaterial({ color: "#eaf4ff", fog: false }), _e = new e.InstancedMesh(Me, Te, 30), Se = new e.InstancedMesh(Me, Ee, 26);
_e.instanceMatrix.setUsage(e.DynamicDrawUsage), Se.instanceMatrix.setUsage(e.DynamicDrawUsage), _e.frustumCulled = false, Se.frustumCulled = false, w.add(_e, Se);
const De = new e.Object3D(), Ce = [], Ae = [];
function Ie(e2) {
  return e2 ? { x: (Math.random() < 0.5 ? -1 : 1) * (26 + 70 * Math.random()), y: 6 + 26 * Math.random(), z: 170 * Math.random() - 140, s: 1.1 + 1.6 * Math.random(), r: Math.random() * Math.PI } : { x: 130 * (Math.random() - 0.5), y: -8 - 24 * Math.random(), z: 170 * Math.random() - 140, s: 1.4 + 2.2 * Math.random(), r: Math.random() * Math.PI };
}
for (let e2 = 0; e2 < 30; e2++) Ce.push(Ie(true));
for (let e2 = 0; e2 < 26; e2++) Ae.push(Ie(false));
function ze(e2, t3) {
  for (let n2 = 0; n2 < t3.length; n2++) {
    const a2 = t3[n2];
    De.position.set(a2.x, a2.y, a2.z), De.rotation.set(0, a2.r, 0), De.scale.setScalar(a2.s), De.updateMatrix(), e2.setMatrixAt(n2, De.matrix);
  }
  e2.instanceMatrix.needsUpdate = true;
}
ze(_e, Ce), ze(Se, Ae);
const Re = new e.CylinderGeometry(0.04, 0.04, 4, 4);
Re.rotateX(Math.PI / 2);
const Ge = new e.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.4, depthWrite: false }), Pe = new e.InstancedMesh(Re, Ge, 50);
Pe.instanceMatrix.setUsage(e.DynamicDrawUsage), w.add(Pe);
const Oe = [];
for (let e2 = 0; e2 < 50; e2++) Oe.push({ x: 40 * (Math.random() - 0.5), y: 0.5 + 15 * Math.random(), z: -20 - 80 * Math.random(), speed: 40 + 30 * Math.random() });
const ke = r(), Le = ke.children[0];
Le.geometry.scale(1, 1, 1 / 12), Le.material.needsUpdate = true;
const Ne = l().children[0];
Ne.geometry.scale(1, 1 / 12, 1);
const Ue = d().children[0], Be = new e.InstancedMesh(Le.geometry, Le.material, 250), qe = new e.InstancedMesh(Ne.geometry, Ne.material, 500), Xe = new e.InstancedMesh(Ue.geometry, Ue.material, 100);
Be.instanceMatrix.setUsage(e.DynamicDrawUsage), qe.instanceMatrix.setUsage(e.DynamicDrawUsage), Xe.instanceMatrix.setUsage(e.DynamicDrawUsage), be.add(Be, qe, Xe);
for (let t3 = 0; t3 < 220; t3++) {
  const t4 = new e.Group();
  t4.visible = false, be.add(t4), ie.segments.push(t4);
}
const He = s();
for (let e2 = 0; e2 < 30; e2++) {
  const e3 = He.clone();
  e3.scale.setScalar(0.32), e3.visible = false, e3.userData.role = "obstacle", be.add(e3), ie.gates.push(e3);
}
const We = p();
for (let e2 = 0; e2 < 20; e2++) {
  const e3 = We.clone();
  e3.visible = false, e3.userData.role = "scenery", be.add(e3), ie.splatters.push(e3);
}
const Fe = c();
for (let e2 = 0; e2 < 10; e2++) {
  const e3 = Fe.clone();
  e3.visible = false, e3.userData.role = "collectible", be.add(e3), ie.powerups.push(e3);
}
function Ve(e2) {
  return Math.sin(0.04 * e2) * a.CURVE_AMPLITUDE;
}
function Ze(e2) {
  const t3 = ie.segments.find((e3) => !e3.visible);
  t3 && (t3.position.set(0, 0, e2), t3.userData.index = o.segmentCounter++, t3.visible = true, se.segments.push(t3));
}
function $e(e2) {
  const t3 = Math.floor(3 * Math.random()), n2 = [-2.3, 0, 2.3];
  for (let a2 = 0; a2 < 3; a2++) {
    const i2 = ie.gates.find((e3) => !e3.visible);
    if (!i2) continue;
    let s2 = o.playerColorIndex;
    if (a2 !== t3) do {
      s2 = Math.floor(4 * Math.random());
    } while (s2 === o.playerColorIndex);
    i2.traverse((e3) => {
      e3.isMesh && "SphereGeometry" !== e3.geometry.type && (e3.material = K[s2]);
    }), i2.position.set(n2[a2], 0, e2), i2.userData.colorIndex = s2, i2.userData.passed = false, i2.userData.laneX = n2[a2], i2.visible = true, se.gates.push(i2), window.__gameEntities.registerObstacle(i2);
  }
}
function je(e2) {
  const t3 = ie.powerups.find((e3) => !e3.visible);
  if (!t3) return;
  const n2 = Math.random(), a2 = n2 < 0.3 ? "rainbow" : n2 < 0.54 ? "shield" : n2 < 0.77 ? "x2" : "switch", i2 = "rainbow" === a2 ? Y : "shield" === a2 ? Q : "x2" === a2 ? ae : J;
  t3.traverse((e3) => {
    e3.isMesh && (e3.material = i2);
  });
  const s2 = 4 * (Math.random() - 0.5);
  t3.userData.laneX = s2, t3.position.set(s2 + Ve(-o.distance + e2), 0.5, e2), t3.userData.type = a2, t3.userData.baseY = 0.5, t3.visible = true, se.powerups.push(t3), window.__gameEntities.registerCollectible(t3);
}
function Ke(e2, t3) {
  const n2 = ie.splatters.find((e3) => !e3.visible);
  if (!n2) return;
  const a2 = K[j.indexOf(t3)] || K[0];
  n2.traverse((e3) => {
    e3.isMesh && (e3.material = a2);
  }), n2.position.copy(e2), n2.userData.laneX = e2.x - Ve(-o.distance + n2.position.z), n2.position.y = 0.05, n2.rotation.y = Math.random() * Math.PI * 2, n2.scale.setScalar(0.1), n2.userData.targetScale = 1 + 0.5 * Math.random(), n2.visible = true, se.splatters.push(n2);
}
function Ye() {
  ge.visible = true, te.visible = false, ne = 0, he && (he.style.transition = "opacity 0.4s ease", he.style.opacity = "0"), o.score = 0, o.distance = 0, o.lives = a.MAX_LIVES, o.speed = a.FORWARD_SPEED_INIT, o.laneOffset = 0, o.rainbowTimer = 0, o.trailTimer = 0, o.scoreX2Timer = 0, o.scoreX2Active = false, o.shieldActive = false, o.milestone = a.MILESTONE_SCORE, o.squashT = 0, o.ballScale = 1, o.playerColorIndex = 0, o.shakeTimer = 0, o.combo = 0, o.multiplier = 1, o._rainbowVisual = false, o.playerColorIndex = 0, ge.traverse((e2) => {
    e2.isMesh && e2.material && (e2.material.color.set(j[o.playerColorIndex]), e2.material.emissive && e2.material.emissive.setHex(0));
  }), ge.scale.setScalar(1), [se.segments, se.gates, se.splatters, se.powerups].forEach((e2) => {
    e2.forEach((e3) => e3.visible = false), e2.length = 0;
  }), o.segmentCounter = 0, o.lastSegmentZ = 20;
  for (let e2 = 0; e2 < 200; e2++) Ze(o.lastSegmentZ), o.lastSegmentZ -= a.SEGMENT_LENGTH;
  o.lastGateZ = -40;
  for (let e2 = 0; e2 < 5; e2++) $e(o.lastGateZ), o.lastGateZ -= Math.max(13, a.GATE_SPACING - 7e-3 * o.distance);
  window.__game.ui.updateHUD(re, 0, o.lives, "", 0, 1), o.phase = "playing", I && CrazyPort.game.gameplayStart();
}
if (R) re.splash.style.display = "none";
else {
  let e2 = false, t3 = 0;
  window.addEventListener("pointerdown", (n2) => {
    if ("splash" === o.phase) return L(), window.__game.ui.showSplash(re, false), void Ye();
    "gameOver" === o.phase && "btn-restart" !== n2.target.id || (e2 = true, t3 = n2.clientX);
  }), window.addEventListener("pointermove", (n2) => {
    if (!e2 || "playing" !== o.phase) return;
    const i2 = n2.clientX - t3;
    t3 = n2.clientX, ye += 0.012 * i2 * (a.STEER_SPEED / 6), ye = Math.max(-a.LANE_HALF_WIDTH, Math.min(a.LANE_HALF_WIDTH, ye));
  }), window.addEventListener("pointerup", () => e2 = false), window.addEventListener("pointercancel", () => e2 = false), document.getElementById("btn-start")?.addEventListener("click", () => {
    L(), window.__game.ui.showSplash(re, false), Ye();
  }), document.getElementById("btn-restart")?.addEventListener("click", () => {
    window.__game.ui.showGameOver(re, false), Ye();
  });
}
const Qe = new e.Object3D();
I && CrazyPort.game.loadingStop(), (function t2() {
  requestAnimationFrame(t2);
  const i2 = Math.min(b.getDelta(), 1 / 30), s2 = b.getElapsedTime();
  if ("playing" === o.phase) {
    o.frameCount++, o.distance += o.speed * i2, o.score += o.speed * i2 * a.SCORE_PER_METER * o.multiplier * (o.scoreX2Active ? 2 : 1), o.speed = Math.min(a.MAX_SPEED, o.speed + a.SPEED_INCREMENT * i2), o.rainbowTimer > 0 && (o.rainbowTimer -= i2, o.rainbowTimer <= 0 ? o.isRainbowActive = false : o.isRainbowActive = true), o.scoreX2Timer > 0 ? (o.scoreX2Timer -= i2, o.scoreX2Active = o.scoreX2Timer > 0) : o.scoreX2Active = false, o.squashT > 0 && (o.squashT -= i2), o.score >= o.milestone && (o.milestone += a.MILESTONE_SCORE, o.score += 100, oe("MILESTONE! +100", "#f9c647", 2.5), [0, 4, 7, 12].forEach((e2, t4) => U({ freq: N(e2), type: "triangle", dur: 0.3, gain: 0.18, delay: 0.06 * t4, slideTo: 1.5 * N(e2) })), xe(7), we("#f9c647", 0.5), ce(ge.position, "#f9c647", 26, 2.6));
    const t3 = Math.max(1, Math.floor(3 / (o.speed / a.FORWARD_SPEED_INIT)));
    if (o.frameCount % t3 === 0) {
      Ke(new e.Vector3(ge.position.x, 0.05, ge.position.z - a.BALL_RADIUS * o.ballScale), j[o.playerColorIndex]);
    }
    o.trailTimer > 0 && (o.trailTimer -= i2), o.isRainbowActive ? (ee.setHSL(0.6 * s2 % 1, 0.9, 0.62), ge.traverse((e2) => {
      e2.isMesh && e2.material && (e2.material.color.copy(ee), e2.material.emissive && e2.material.emissive.setRGB(0.3 * ee.r, 0.3 * ee.g, 0.3 * ee.b));
    }), o._rainbowVisual = true) : o._rainbowVisual && (o._rainbowVisual = false, ge.traverse((e2) => {
      e2.isMesh && e2.material && (e2.material.color.set(j[o.playerColorIndex]), e2.material.emissive && e2.material.emissive.setHex(0));
    })), o.shieldActive ? (te.visible = true, te.position.copy(ge.position), te.scale.setScalar(a.BALL_RADIUS * o.ballScale * 1.7 * (1 + 0.06 * Math.sin(8 * s2))), ne -= i2, ne <= 0 && (ne = 0.22, ce(ge.position, "#8fe3ff", 4, 1.2))) : te.visible && (te.visible = false);
    const n2 = o.speed * i2;
    o.lastSegmentZ += n2, o.lastGateZ += n2;
    for (let e2 = se.segments.length - 1; e2 >= 0; e2--) {
      const t4 = se.segments[e2];
      t4.position.z += n2, t4.position.x = Ve(-o.distance + t4.position.z), t4.position.z > 20 && (t4.visible = false, se.segments.splice(e2, 1), Ze(o.lastSegmentZ), o.lastSegmentZ -= a.SEGMENT_LENGTH);
    }
    let r3 = o.rainbowTimer > 0 ? `RAINBOW: ${Math.ceil(o.rainbowTimer)}s` : o.trailTimer > 0 ? `TRAIL: ${Math.ceil(o.trailTimer)}s` : "";
    for (let e2 = se.gates.length - 1; e2 >= 0; e2--) {
      const t4 = se.gates[e2];
      if (t4.position.z += n2, t4.position.x = t4.userData.laneX + Ve(-o.distance + t4.position.z), !t4.userData.passed && t4.position.z > -0.5 && t4.position.z < 1) {
        t4.userData.passed = true;
        const e3 = Math.abs(o.laneOffset - t4.userData.laneX);
        if (e3 < 1.2) {
          const n3 = ge.position.clone();
          n3.y += 2, n3.project(x);
          n3.x, window.innerWidth, n3.y, window.innerHeight;
          if (o.isRainbowActive || t4.userData.colorIndex === o.playerColorIndex) {
            o.combo++, o.multiplier = Math.min(a.MAX_MULT, 1 + Math.floor(o.combo / a.COMBO_PER_MULT));
            const n4 = e3 < a.PERFECT_WINDOW;
            let i3 = a.POINTS_GATE + (n4 ? a.POINTS_PERFECT : 0);
            i3 = Math.round(i3 * o.multiplier * (o.scoreX2Active ? 2 : 1)), o.score += i3, o.ballScale = Math.min(1.6, o.ballScale * (n4 ? 1.15 * a.GROW_FACTOR : a.GROW_FACTOR)), o.speed = Math.min(a.MAX_SPEED, o.speed + (n4 ? 0.45 : 0.3)), o.squashT = 0.28, X(o.combo, n4);
            const s3 = j[t4.userData.colorIndex] || "#ffffff";
            ce(ge.position, s3, n4 ? 22 : 12, n4 ? 2.4 : 1.6), we(s3, n4 ? 0.45 : 0.26), n4 && (o.squashT = 0.34, xe(4)), n4 && oe("PERFECT! +" + i3, "#b868e8", 1.9), o.combo >= a.COMBO_PER_MULT && o.combo % a.COMBO_PER_MULT === 0 && (oe("COMBO x" + o.multiplier, "#f9c647", 2.7), xe(5), we("#f9c647", 0.34));
          } else if (o.shieldActive) o.shieldActive = false, o.squashT = 0.22, o.shakeTimer = 0.2, F(), we("#5ecaf0", 0.35), ce(ge.position, "#5ecaf0", 14, 1.8), oe("BLOCKED!", "#5ecaf0", 1.8);
          else if (o.combo = 0, o.multiplier = 1, o.lives--, o.ballScale = Math.max(0.4, o.ballScale * a.SHRINK_FACTOR), o.shakeTimer = 0.4, H(), we("#f0433a", 0.4), xe(2.5), oe("OUCH!", "#f0433a", 1.6), Ke(ge.position.clone(), j[o.playerColorIndex]), o.lives <= 0) {
            const e4 = j[o.playerColorIndex] || "#f0433a";
            o.phase = "bursting", o.burstT = 1.15, ce(ge.position, e4, 46, 3.8), ce(ge.position, "#ffffff", 16, 2.6), we(e4, 0.7), o.shakeTimer = 0.7, xe(10), V(), fe(e4), ge.visible = false, te.visible = false;
          }
          ge.scale.setScalar(o.ballScale);
        }
      }
      t4.position.z > 10 && (t4.visible = false, se.gates.splice(e2, 1), 0 === e2 && ($e(o.lastGateZ), o.lastGateZ -= Math.max(13, a.GATE_SPACING - 7e-3 * o.distance), Math.random() < 0.2 && je(o.lastGateZ + a.GATE_SPACING / 2)));
    }
    for (let e2 = se.powerups.length - 1; e2 >= 0; e2--) {
      const t4 = se.powerups[e2];
      if (t4.position.z += n2, t4.position.x = t4.userData.laneX + Ve(-o.distance + t4.position.z), t4.position.y = t4.userData.baseY + 0.2 * Math.sin(3 * s2), t4.position.z > -1.2 && t4.position.z < 1.2 && Math.abs(ge.position.x - t4.position.x) < 1.5) {
        if ("rainbow" === t4.userData.type) o.rainbowTimer = a.RAINBOW_DURATION, oe("RAINBOW!", "#b868e8", 2);
        else if ("shield" === t4.userData.type) o.shieldActive = true, oe("SHIELD!", "#5ecaf0", 2);
        else if ("switch" === t4.userData.type) {
          const e3 = o.playerColorIndex;
          let t5 = e3;
          for (; t5 === e3; ) t5 = Math.floor(Math.random() * j.length);
          o.playerColorIndex = t5, o.isRainbowActive || ge.traverse((e4) => {
            e4.isMesh && e4.material && e4.material.color.set(j[t5]);
          }), se.gates.forEach((n3) => {
            n3.userData.colorIndex === e3 && (n3.userData.colorIndex = t5, n3.traverse((e4) => {
              e4.isMesh && "SphereGeometry" !== e4.geometry.type && (e4.material = K[t5]);
            }));
          }), oe("COLOR SWITCH!", j[t5], 2);
        } else o.scoreX2Timer = a.SCOREX2_DURATION, oe("2x SCORE!", "#f9c647", 2);
        W();
        {
          const e3 = "rainbow" === t4.userData.type ? "#b868e8" : "shield" === t4.userData.type ? "#5ecaf0" : "switch" === t4.userData.type ? j[o.playerColorIndex] : "#f9c647";
          we(e3, 0.4), ce(t4.position, e3, 20, 2.2), xe(4);
        }
        t4.visible = false, se.powerups.splice(e2, 1);
      } else t4.position.z > 10 && (t4.visible = false, se.powerups.splice(e2, 1));
    }
    for (let e2 = se.splatters.length - 1; e2 >= 0; e2--) {
      const t4 = se.splatters[e2];
      t4.position.z += n2, t4.position.x = t4.userData.laneX + Ve(-o.distance + t4.position.z), t4.scale.x < t4.userData.targetScale && t4.scale.addScalar(5 * i2), t4.position.z > 15 && (t4.visible = false, se.splatters.splice(e2, 1));
    }
    o.laneOffset += (ye - o.laneOffset) * Math.min(1, 10 * i2), ge.position.x = o.laneOffset + Ve(-o.distance), ge.position.y = a.BALL_RADIUS * o.ballScale, ge.rotation.x -= o.speed * i2 / (a.BALL_RADIUS * o.ballScale);
    const l3 = o.squashT > 0 ? 0.22 * Math.sin((1 - o.squashT / 0.28) * Math.PI) : 0;
    ge.scale.setScalar(o.ballScale * (1 + l3)), window.__game.ui.updateHUD(re, o.score, o.lives, r3, o.combo, o.multiplier);
  }
  "splash" === o.phase && (ge.rotation.x -= 1.8 * i2, ge.position.y = a.BALL_RADIUS * o.ballScale + 0.12 * Math.sin(2 * s2)), "bursting" === o.phase && (o.burstT -= i2, o.burstT <= 0 && (o.phase = "gameOver", (function(e2) {
    if (!z) return;
    const t3 = (e2 = Math.floor(e2)) > G;
    G = Math.max(G, e2), z.save({ best: G }), z.leaderboard && z.leaderboard.submit(e2, 5).catch(() => {
    }), I && (CrazyPort.game.gameplayStop(), t3 && CrazyPort.game.happytime()), P();
    const n2 = document.getElementById("final-score");
    n2 && (n2.textContent = "Score: " + e2 + "   \u2022   Best: " + G);
  })(o.score), window.__game.ui.showGameOver(re, true, o.score, G)));
  let r2 = 0, l2 = 0;
  if (o.introT > 0) {
    o.introT -= i2;
    const e2 = Math.max(0, o.introT / 2), t3 = e2 * e2;
    r2 = 9 * t3, l2 = 8 * t3;
  }
  const p2 = 0.5 * ge.position.x, c2 = ge.position.y + 5 + r2, m2 = ge.position.z + 9 + l2;
  x.position.x += 0.1 * (p2 - x.position.x), x.position.y += 0.1 * (c2 - x.position.y), x.position.z += 0.1 * (m2 - x.position.z), x.lookAt(ge.position.x, ge.position.y, ge.position.z - 10), o.shakeTimer > 0 && (x.position.x += (Math.random() - 0.5) * o.shakeTimer, x.position.y += (Math.random() - 0.5) * o.shakeTimer, o.shakeTimer -= i2);
  const d2 = "playing" === o.phase ? o.speed : 0.5 * a.FORWARD_SPEED_INIT, h2 = Math.min(1, Math.max(0, (d2 - a.FORWARD_SPEED_INIT) / (a.MAX_SPEED - a.FORWARD_SPEED_INIT)) + 0.04 * (o.combo || 0));
  Ge.opacity = 0.22 + 0.45 * h2;
  for (let e2 = 0; e2 < 50; e2++) {
    let t3 = Oe[e2];
    t3.z += (t3.speed + d2) * i2, t3.z > 20 && (t3.z = -60 - 40 * Math.random(), t3.x = 40 * (Math.random() - 0.5), t3.y = 0.5 + 15 * Math.random()), Qe.position.set(t3.x, t3.y, t3.z), Qe.rotation.set(0, 0, 0), Qe.scale.set(1, 1, 1 + 0.05 * d2 + 0.6 * h2), Qe.updateMatrix(), Pe.setMatrixAt(e2, Qe.matrix);
  }
  Pe.instanceMatrix.needsUpdate = true, (function(e2, t3) {
    const n2 = (0.35 * t3 + 4) * e2;
    for (const e3 of Ce) e3.z += n2, e3.z > 45 && (Object.assign(e3, Ie(true)), e3.z = -150);
    for (const e3 of Ae) e3.z += n2, e3.z > 45 && (Object.assign(e3, Ie(false)), e3.z = -150);
    ze(_e, Ce), ze(Se, Ae);
  })(i2, d2), (function() {
    let e2 = 0, t3 = 0, n2 = 0;
    for (let i3 = 0; i3 < se.segments.length; i3++) {
      const s3 = se.segments[i3], r3 = -o.distance + s3.position.z, l3 = 0.04 * Math.cos(0.04 * r3) * a.CURVE_AMPLITUDE, p3 = Math.atan(l3);
      Qe.position.set(s3.position.x, s3.position.y - 0.15, s3.position.z), Qe.rotation.set(0, p3, 0), Qe.scale.set(1, 1, 1), Qe.updateMatrix(), Be.setMatrixAt(e2++, Qe.matrix);
      const c3 = 4.3 * Math.cos(p3), m3 = 4.3 * Math.sin(p3);
      Qe.position.set(s3.position.x - c3, s3.position.y + 0.3, s3.position.z + m3), Qe.rotation.set(Math.PI / 2, p3, 0, "YXZ"), Qe.updateMatrix(), qe.setMatrixAt(t3++, Qe.matrix), Qe.position.set(s3.position.x + c3, s3.position.y + 0.3, s3.position.z - m3), Qe.rotation.set(Math.PI / 2, p3, 0, "YXZ"), Qe.updateMatrix(), qe.setMatrixAt(t3++, Qe.matrix), s3.userData.index % 4 == 0 && (Qe.position.set(s3.position.x, s3.position.y + 0.01, s3.position.z), Qe.rotation.set(0, p3, 0), Qe.updateMatrix(), Xe.setMatrixAt(n2++, Qe.matrix));
    }
    Be.count = e2, qe.count = t3, Xe.count = n2, Be.instanceMatrix.needsUpdate = true, qe.instanceMatrix.needsUpdate = true, Xe.instanceMatrix.needsUpdate = true;
  })(), (function(e2) {
    for (const t3 of pe) if (t3.visible) {
      if (t3.userData.life -= e2, t3.userData.life <= 0) {
        t3.visible = false;
        continue;
      }
      t3.userData.vy -= 11 * e2, t3.position.x += t3.userData.vx * e2, t3.position.y += t3.userData.vy * e2, t3.position.z += t3.userData.vz * e2, t3.scale.setScalar(Math.max(0.02, t3.userData.life / t3.userData.max * t3.userData.s0));
    }
  })(i2), (function(e2) {
    if (ue(), e2 >= 3) {
      const t3 = e2 >= 5 ? "#f0433a" : e2 >= 4 ? "#b868e8" : "#5ecaf0";
      de.style.background = "radial-gradient(ellipse at center, transparent 52%, " + t3 + " 135%)", de.style.opacity = Math.min(0.5, 0.14 * (e2 - 2) + 0.1 + 0.05 * Math.sin(performance.now() / 140));
    } else de.style.opacity = 0;
  })("playing" === o.phase ? o.multiplier : 1);
  {
    const e2 = o._fovApplied || 0, t3 = o._fovPunch || 0;
    t3 !== e2 && (x.fov += t3 - e2, x.updateProjectionMatrix(), o._fovApplied = t3), o._fovPunch = t3 > 0.05 ? t3 * (1 - Math.min(1, 5 * i2)) : 0;
  }
  "function" == typeof n && n(w, i2, s2), f.render(w, x);
})();
