import { createAnimationController, createFixedStepLoop, type AuraVec3 } from "@aura3d/engine";
import { createGame } from "@aura3d/engine/game";
import marketing from "../../../marketing/package.json";
import { assets } from "./aura-assets";
import { buildStage, portraitAim, portraitEye, relays } from "./stage";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("viewport");
const launch = element<HTMLButtonElement>("launch");
const status = element("status");
const params = new URLSearchParams(location.search);
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const version = marketing.dependencies["@aura3d/engine"];
if (params.get("chrome") === "hidden") document.documentElement.dataset.chrome = "hidden";

type Phase = "portrait" | "running" | "complete";
const state = {
  appId: "ember-courier", enginePackage: "@aura3d/engine", engineVersion: version, version,
  status: "loading", error: "", renderer: "", frames: 0, frameCount: 0, drawCalls: 0, triangles: 0,
  renderWidth: 0, renderHeight: 0, fps: 0, assetUrl: assets.courier.url, assetHash: assets.courier.hash,
  gameState: "portrait" as Phase, player: { x: 0, y: 0, z: 0 }, animation: "idle", relays: 0, elapsed: 0,
  dashRemaining: 0, dashCooldown: 0, reducedMotion: reduced.matches
};
Object.assign(window, { __auraShowcase: state, __a3dWowRuntime: state });

async function openDeck() {
  const game = createGame({
    id: "ember-courier", target: canvas, scene: buildStage, renderer: { backend: "webgl2" },
    pixelRatio: { max: 1.5 }, output: { toneMapping: "aces", exposure: 1, dither: true },
    input: { actions: { forward:["KeyW","ArrowUp"], back:["KeyS","ArrowDown"], left:["KeyA","ArrowLeft"],
      right:["KeyD","ArrowRight"], dash:["Space","ShiftLeft"], restart:["KeyR"] }, bufferMs: 150 },
    touch: { preset: "dpad-2btn", bindings: { "stick.up":"forward", "stick.down":"back", "stick.left":"left", "stick.right":"right", jump:"dash" } }
  });
  const app = game.app;
  const courier = app.nodes.require("courier");
  const contact = app.nodes.require("contact");
  const signals = relays.map((_,i) => app.nodes.require("confirmed-"+i));
  const controller = createAnimationController({
    id:"courier-locomotion", clipRegistry: assets.courier, requiredClips:["idle","walk","run"], suppressRootMotion:true
  });
  controller.bindRuntimeNode(courier,{ id:"courier-body", defaultClipId:"idle", applyPose:false });
  controller.play("idle",{loop:true});
  let facing = 0, burstX = 0, burstZ = -1;
  let cameraMix = 0;
  let nextRead = 0;
  let firstPresented = false;

  function phase(value: Phase) {
    state.gameState = value;
    document.body.dataset.phase = value;
    element("brief").hidden = value !== "portrait";
    element("hud").hidden = value !== "running";
    element("result").hidden = value !== "complete";
  }
  function pulseClip(name: "idle"|"walk"|"run") {
    if (name === state.animation) return;
    state.animation = name;
    controller.crossFade(name, reduced.matches ? 0.06 : 0.14, {loop:true});
  }
  function updateProgress() {
    element("score").textContent = state.relays+" / 3";
    signals.forEach((signal,index)=>signal.setVisible(index<state.relays));
    if (state.relays === relays.length) {
      phase("complete");
      element("time").textContent = "All three gates linked in "+state.elapsed.toFixed(1)+" seconds.";
    }
  }
  function reset() {
    Object.assign(state.player, {x:0,y:0,z:0});
    state.elapsed = state.relays = state.dashCooldown = state.dashRemaining = 0;
    facing = cameraMix = 0;
    pulseClip("idle");
    phase("portrait");
    updateProgress();
  }
  function start() {
    if (state.status !== "running" || state.gameState !== "portrait") return;
    phase("running");
    facing = Math.PI;
    launch.blur();
  }
  launch.addEventListener("click", start);
  element("restart").addEventListener("click", () => { reset(); start(); });
  function step(dt: number) {
    const input = game.input;
    if (!input) return;
    if (input.consume("restart")) { reset(); return; }
    let x = Number(input.held("right"))-Number(input.held("left"));
    let z = Number(input.held("back"))-Number(input.held("forward"));
    const dash = input.consume("dash");
    if (state.gameState === "portrait" && (x || z || dash)) start();
    if (state.gameState !== "running") { pulseClip("idle"); controller.update(dt); return; }
    state.elapsed += dt;
    state.dashCooldown = Math.max(0,state.dashCooldown-dt);
    const length = Math.hypot(x,z);
    if (length) { x/=length; z/=length; }
    if (dash && !state.dashCooldown) {
      burstX = length ? x : Math.sin(facing);
      burstZ = length ? z : Math.cos(facing);
      state.dashRemaining = 0.36;
      state.dashCooldown = 0.75;
    }
    const bursting = state.dashRemaining>0;
    if(bursting) { x=burstX; z=burstZ; }
    if(x||z) facing = Math.atan2(x,z);
    const speed = bursting ? 10 : 3.3;
    state.player.x=Math.max(-3.6,Math.min(3.6,state.player.x+x*speed*dt));
    state.player.z=Math.max(-30,Math.min(5,state.player.z+z*speed*dt));
    pulseClip(bursting ? "run" : length ? "walk" : "idle");
    controller.update(dt);
    const goalZ=relays[state.relays];
    if(bursting && goalZ!==undefined && Math.abs(state.player.z-goalZ)<=1.5 && Math.abs(state.player.x)<1.65) {
      state.relays++;
      updateProgress();
    }
    state.dashRemaining=Math.max(0,state.dashRemaining-dt);
  }

  function pose(dt: number) {
    const {x,y,z}=state.player;
    courier.setPosition(x,y,z).setRotation(0,facing,0);
    contact.setPosition(x,0.015,z).setRotation(0,facing,0);
    const targetMix = state.gameState === "portrait" ? 0 : 1;
    cameraMix += (targetMix-cameraMix)*(reduced.matches ? 1 : 1-Math.exp(-dt*4.8));
    const narrow = canvas.clientWidth<canvas.clientHeight*0.95;
    const rear = params.get("shot")==="rear" && !targetMix;
    if(rear) courier.setRotation(0,Math.PI,0);
    const introEye: AuraVec3 = narrow ? [1.30,1.50,3.55] : portraitEye;
    const introAim: AuraVec3 = narrow ? [0,0.91,0] : portraitAim;
    const mix = (a:number,b:number)=>a+(b-a)*cameraMix;
    app.camera?.setPose({position:[x+mix(introEye[0],0.64),mix(introEye[1],2.28),z+mix(introEye[2],4.18)],
      target:[x+mix(introAim[0],0),mix(introAim[1],1.08),z-mix(0,1.75)], fov:mix(40,51) });
    const goal=relays[state.relays];
    if(state.gameState==="running" && goal!==undefined) {
      const delta=state.player.z-goal;
      const message=Math.abs(delta)<1.55 && Math.abs(x)<1.65 ? "Dash now." : delta < -1.5 ? "Turn back to the amber gate." : "Dash through the amber gate.";
      const distance=Math.ceil(Math.hypot(x,delta))+" m";
      if(element("distance").textContent!==distance) element("distance").textContent=distance;
      if(element("prompt").textContent!==message) element("prompt").textContent=message;
    }
  }
  const loop=createFixedStepLoop({ stepSeconds:1/60, isActive:()=>state.status==="running"&&!game.session.paused,step });
  app.onFrame(({frame,dt,time})=>{
    state.frames=state.frameCount=frame;
    pose(Math.min(dt,0.12));
    if(!firstPresented || time<nextRead) return;
    nextRead=time+0.16;
    const d=app.diagnostics();
    if(d.errors.length) { fail(d.errors.join(" · ")); return; }
    if(!d.drawCalls || !d.assets.some(asset=>asset.url===assets.courier.url&&asset.status==="ready")) return;
    state.drawCalls=d.drawCalls; state.triangles=d.triangles??0; state.fps=d.fps;
    [state.renderWidth,state.renderHeight]=d.renderSize;
    state.renderer="a3d-"+d.backend;
    if(state.status==="loading"){
      state.status="running"; document.body.dataset.sceneReady="true";
      launch.disabled=false; status.textContent=""; loop.start();
    }
  });
  reduced.addEventListener("change",()=>{state.reducedMotion=reduced.matches;});
  app.onDeviceLost(()=>fail("Graphics device lost."));
  app.onDeviceRestored(()=>{state.status="loading";state.error="";});
  window.addEventListener("pagehide",e=>{if(!e.persisted){loop.stop();game.dispose();}});
  reset();
  game.start();
  await game.ready();
  firstPresented=true;
}
function fail(error:unknown) {
  state.status="error";state.error=error instanceof Error?error.message:String(error);
  delete document.body.dataset.sceneReady;
  status.textContent="The relay deck could not start. Reload to reconnect.";
  launch.disabled=true;
}
void openDeck().catch(fail);
