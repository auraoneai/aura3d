import {
  collectGPUParticleEffects,
  CollisionModule,
  ColorModule,
  HeightfieldModule,
  LightingModule,
  ParticleEmitter,
  ParticleRenderer,
  ParticleSystem,
  SizeModule,
  SubEmitterModule,
  TrailModule,
  TurbulenceModule,
  WebGPUParticleBackend,
  VertexBuffer,
  VertexFormat,
  type ParticleRenderBatch,
  WindModule,
  createLayeredParticleBudgetPlan,
  createSineHeightfield,
  queryGPUParticleBackendCapabilities,
  Geometry,
  Renderer,
  UnlitMaterial,
} from "@aura3d/rendering";

import { startWebGPUShowcase } from "/apps/wow-common/src/webgpu-showcase.ts";

/**
 * PART A4 demo: 10k GPU particles with sub-emitters, curl-noise turbulence,
 * heightfield ground + analytic walls, GPU ribbon trails, size/color-over-life
 * curves, velocity-normal lighting, and planar soft-particle depth fade.
 * WebGPU compute when available, same module stack on the CPU fallback.
 */
// The frozen P01 workload is exactly 10,000 live particles. Recycled and
// sub-emitted particles reuse resident slots, so extra capacity only adds work.
const particleCount = 10_000;
const trailLifetime = 0.45;
const fadeDistance = 0.45;
const cameraAnchor = { x: 0, y: 1.5, z: 3.2 };

const particleMaterial = new UnlitMaterial({ name: "a4-live-attributes", color: [1, 1, 1, 1],
  renderState: { blend: true, depthWrite: false, cullMode: "none" } });
const particleFormat = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "color", components: 4, offset: 12 },
], 28);

/** Instrument the completed native compute result, not ceil(configured capacity). */
class ObservedParticleBackend extends WebGPUParticleBackend {
  observed = { count: 0, workgroups: 0, readbackBytes: 0, computeAndReadbackMs: 0,
    collision: 0, trails: 0, subemitters: 0, turbulence: 0, curves: 0, lighting: 0, childRequests: 0, collisionContacts: 0 };
  override async update(input: Parameters<WebGPUParticleBackend["update"]>[0]) {
    const start = performance.now();
    const result = await super.update(input);
    const executed = { collision: 0, trails: 0, subemitters: 0, turbulence: 0, curves: 0, lighting: 0, collisionContacts: 0 };
    for (let i = 0; i < result.count; i++) {
      const mask = result.attributes?.[i * 8 + 5] ?? 0;
      if (mask & 12) executed.collision++;
      if (mask & 128) executed.trails++;
      if (mask & 16) executed.subemitters++;
      if (mask & 2) executed.turbulence++;
      if ((mask & 288) === 288) executed.curves++;
      if (mask & 64) executed.lighting++;
      executed.collisionContacts += result.attributes?.[i * 8 + 7] ?? 0;
    }
    this.observed = { count: result.count, workgroups: result.workgroups,
      readbackBytes: result.positions.byteLength + result.velocities.byteLength + (result.attributes?.byteLength ?? 0)
        + (result.trailPositions?.byteLength ?? 0) + (result.spawnRequests?.byteLength ?? 0),
      computeAndReadbackMs: performance.now() - start,
      ...executed,
      childRequests: result.spawnRequests?.reduce((n, v) => n + (v & 65535) + (v >>> 16), 0) ?? 0 };
    return result;
  }
}

function quad(buffer: VertexBuffer, index: number, points: readonly (readonly number[])[], color: readonly number[]): void {
  for (const corner of [0, 1, 2, 0, 2, 3]) {
    buffer.setAttribute(index, "position", points[corner]!);
    buffer.setAttribute(index++, "color", color);
  }
}

/** Submit actual GPU-computed colors/sizes and soft fade; no static color tiers. */
function writeSprites(buffer: VertexBuffer, batch: ParticleRenderBatch): void {
  let vertex = 0;
  for (const sprite of batch.sprites) {
    const { x, y, z } = sprite.position, r = sprite.size / 2;
    quad(buffer, vertex, [[x-r,y-r,z],[x+r,y-r,z],[x+r,y+r,z],[x-r,y+r,z]],
      [sprite.color.r,sprite.color.g,sprite.color.b,sprite.color.a]);
    vertex += 6;
  }
  for (; vertex < buffer.vertexCount; vertex++) {
    buffer.setAttribute(vertex, "position", [0,0,0]); buffer.setAttribute(vertex, "color", [0,0,0,0]);
  }
}

const budgetPlan = createLayeredParticleBudgetPlan({
  requestedParticles: particleCount,
  minParticles: particleCount,
  maxParticles: particleCount,
  layers: [
    { name: "fountain", weight: 0.82 },
    { name: "sparks", weight: 0.18 },
  ],
  densityTiers: [
    { threshold: 10_000, label: "10k showcase", mode: "showcase" },
    { threshold: 4_000, label: "4k interactive", mode: "interactive" },
  ],
});

function createParticleSystem(): ParticleSystem {
  return new ParticleSystem({
    maxParticles: particleCount,
    emitters: [
      new ParticleEmitter({
        seed: 20260904,
        emissionRate: particleCount,
        lifetime: { min: 1.4, max: 2.2 },
        speed: { min: 1.6, max: 2.6 },
        shape: { type: "cone", origin: { x: 0, y: 0.4, z: 0 }, radius: 0.3, length: 0.3, angle: Math.PI / 7, emitFromVolume: true },
        initial: {
          size: 0.05,
          acceleration: { x: 0, y: -3.2, z: 0 },
          color: { r: 1, g: 0.75, b: 0.3, a: 1 },
        },
      }),
    ],
    modules: [
      new WindModule({
        direction: { x: 0.9, y: 0, z: 0.3 },
        strength: 0.5,
        gustAmplitude: 0.6,
        gustDirection: { x: 1, y: 0, z: 0.2 },
        gustFrequency: 0.5,
        gustSpeed: 0.8,
      }),
      new TurbulenceModule({ strength: 0.9, scale: 0.7, flowSpeed: 0.15 }),
      new HeightfieldModule({
        sampler: createSineHeightfield(24, 24, 0.25, 0.22, 1.2, -3, -3),
        restitution: 0.35,
      }),
      // Safe side is dot(normal, p) + constant >= 0: walls keep |x| <= 2.6,
      // and the kill floor only fires below y = -3.
      new CollisionModule({ normal: { x: -1, y: 0, z: 0 }, constant: 2.6, restitution: 0.4 }),
      new CollisionModule({ normal: { x: 1, y: 0, z: 0 }, constant: 2.6, restitution: 0.4 }),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 3, restitution: 0, mode: "kill" }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.75, b: 0.3, a: 1 } },
        { time: 0.5, color: { r: 1, g: 0.35, b: 0.1, a: 0.85 } },
        { time: 1, color: { r: 0.25, g: 0.22, b: 0.28, a: 0 } },
      ]),
      new SizeModule([
        { time: 0, size: 0.03 },
        { time: 0.35, size: 0.07 },
        { time: 1, size: 0.015 },
      ]),
      new LightingModule({
        ambient: [0.45, 0.45, 0.5],
        keyDirection: { x: 0.3, y: 1, z: 0.2 },
        diffuseStrength: 0.9,
      }),
      new SubEmitterModule({
        trigger: "death",
        chance: 0.2,
        childrenPerEvent: 2,
        velocityInherit: 0.4,
        childEmitter: new ParticleEmitter({
          seed: 77,
          emissionRate: 0,
          lifetime: { min: 0.4, max: 0.9 },
          speed: { min: 0.8, max: 1.8 },
          shape: { type: "sphere", center: { x: 0, y: 0, z: 0 }, radius: 0.05 },
          initial: { size: 0.03, color: { r: 1, g: 0.6, b: 0.2, a: 1 } },
        }),
      }),
      new TrailModule({ maxPoints: 6, minDistance: 0.02, lifetime: trailLifetime }),
    ],
  });
}

/** Planar soft-particle fade against the y=0 ground along the view ray. */
function groundSceneDepth(x: number, y: number, z: number): number {
  const dx = x - cameraAnchor.x;
  const dy = y - cameraAnchor.y;
  const dz = z - cameraAnchor.z;
  const distance = Math.hypot(dx, dy, dz);
  if (dy >= -1e-4) {
    return Number.POSITIVE_INFINITY;
  }
  const t = cameraAnchor.y / -dy;
  return t * distance;
}

function particleViewDepth(x: number, y: number, z: number): number {
  return Math.hypot(x - cameraAnchor.x, y - cameraAnchor.y, z - cameraAnchor.z);
}

void startWebGPUShowcase({
  appId: "wow-webgpu-compute-particles",
  title: "Aura3D Accelerated Particle Field",
  subtitle: "10k GPU particles: sub-emitters, curl turbulence, heightfield collision, ribbon trails, life curves, lighting, soft depth fade.",
  labels: {
    concept: "gpu particle behavior",
    workload: `${particleCount} accelerated particles`,
    api: "WebGPUParticleBackend + ParticleSystem A4 effects",
  },
  async setup({ canvas, renderSize }) {
    const capabilities = await queryGPUParticleBackendCapabilities();
    const useNativeCompute = capabilities.supported;
    if (useNativeCompute) return setupResidentParticles(canvas, renderSize.width, renderSize.height);
    const selectedBackend = useNativeCompute ? "webgpu" : "webgl2";
    const renderer = await Renderer.create({
      backend: selectedBackend,
      canvas,
      width: renderSize.width,
      height: renderSize.height,
      clearColor: [0.01, 0.014, 0.022, 1],
      antialias: true,
    });
    const computeBackend = useNativeCompute ? new ObservedParticleBackend() : undefined;
    await computeBackend?.initialize();

    const system = createParticleSystem();
    const batchRenderer = new ParticleRenderer();
    const sprites = new VertexBuffer(particleFormat, particleCount * 6);
    // GPU ring history is computed for every particle. A fixed 1-in-4 ribbon
    // rendering density matches the original fixture and never adapts mid-run.
    const ribbons = new VertexBuffer(particleFormat, Math.ceil(particleCount / 4) * 5 * 6);
    const bounds = { min: [-4,-4,-4] as const, max: [4,5,4] as const };
    const spriteGeometry = new Geometry(sprites, null, "triangles", bounds);
    const ribbonGeometry = new Geometry(ribbons, null, "triangles", bounds);
    const receipt = { capturing: false, frames: [] as Record<string, unknown>[],
      start() { this.frames.length = 0; this.capturing = true; }, stop() { this.capturing = false; return this.frames; } };
    (window as unknown as Record<string, unknown>).__a3dParticle301 = receipt;
    let previousCompletedAt: number | undefined;
    let steps = 0;
    let workgroups = 0;
    let lastBackend: string = useNativeCompute ? "webgpu" : "cpu-fallback";

    return {
      requestedBackend: "auto",
      selectedBackend,
      adapterName: capabilities.adapterName ?? renderer.device.info.renderer,
      capabilities: [
        useNativeCompute ? "webgpu-compute" : "webgl2-particle-compatibility",
        "a4-sub-emitters",
        "a4-curl-turbulence",
        "a4-heightfield-collision",
        "a4-ribbon-trails",
        "a4-life-curves",
        "a4-particle-lighting",
        "a4-soft-particles",
        ...(renderer.device.info.capabilities ?? []),
      ],
      resize: (width, height) => renderer.resize(width, height),
      dispose: () => {
        system.dispose();
        sprites.dispose(); ribbons.dispose();
        computeBackend?.dispose();
        renderer.dispose();
      },
      async render(_timeSeconds) {
        const frameStartedAt = performance.now();
        if (computeBackend) {
          lastBackend = "webgpu";
          await system.updateOnGPU(1 / 60, computeBackend);
          workgroups = computeBackend.observed.workgroups;
        } else {
          lastBackend = "cpu-fallback";
          system.update(1 / 60);
          workgroups = Math.ceil(Math.max(1, system.getStats().liveCount) / 64);
        }
        steps += 1;

        const batch = batchRenderer.buildBatch(system.particles, {
          softParticles: {
            enabled: true,
            fadeDistance,
            sceneDepthAt: (position) => groundSceneDepth(position.x, position.y, position.z),
            particleDepthAt: (position) => particleViewDepth(position.x, position.y, position.z),
          },
        });
        system.recordBufferUpload(batch.uploadedBytes);

        writeSprites(sprites, batch);
        let ribbonVertices = 0, trailCount = 0;
        for (let index = 0; index < system.particles.length; index += 4) {
          const particle = system.particles[index]!;
          const trail = particle.userData.trail as { position: { x: number; y: number; z: number }; age: number }[] | undefined;
          if (!Array.isArray(trail)) continue;
          for (let segment = 1; segment < Math.min(trail.length, 6); segment++) {
            const a = trail[segment-1]!, b = trail[segment]!;
            const dx = b.position.x-a.position.x, dy = b.position.y-a.position.y;
            const length = Math.hypot(dx,dy), width = 0.012 * (1-segment/7);
            const ox = length > 1e-8 ? -dy/length*width : width, oy = length > 1e-8 ? dx/length*width : 0;
            const alpha = particle.color.a * Math.max(0, 1-b.age/trailLifetime);
            quad(ribbons,ribbonVertices,[[a.position.x-ox,a.position.y-oy,a.position.z],
              [a.position.x+ox,a.position.y+oy,a.position.z],[b.position.x+ox,b.position.y+oy,b.position.z],
              [b.position.x-ox,b.position.y-oy,b.position.z]], [particle.color.r,particle.color.g,particle.color.b,alpha]);
            ribbonVertices += 6;
          }
          trailCount++;
        }
        for (let vertex=ribbonVertices;vertex<ribbons.vertexCount;vertex++) {
          ribbons.setAttribute(vertex,"position",[0,0,0]); ribbons.setAttribute(vertex,"color",[0,0,0,0]);
        }
        const renderItems = [
          { label: "a4-live-sprites", geometry: spriteGeometry, material: particleMaterial },
          { label: "a4-live-ribbon-triangles", geometry: ribbonGeometry, material: particleMaterial },
        ];

        const diagnostics = await renderer.renderAsync({
          renderItems,
          camera: { position: [cameraAnchor.x,cameraAnchor.y,cameraAnchor.z], target: [0,1,0], fovDegrees: 65, near: 0.05, far: 30 },
          environmentLighting: false,
          shadow: false,
          postprocess: false,
        });
        // renderAsync submits commands; fence the native queue so receipt timestamps
        // represent completed GPU work. This fence introduces no texture readback.
        if (computeBackend) {
          if (!renderer.device.waitForSubmittedWork) throw new Error("Native render completion unavailable");
          await renderer.device.waitForSubmittedWork();
        }
        const completedAt = performance.now();
        const frameMs = previousCompletedAt === undefined ? completedAt - frameStartedAt : completedAt - previousCompletedAt;
        previousCompletedAt = completedAt;
        const stats = system.getStats();
        const observed = computeBackend?.observed;
        if (receipt.capturing) receipt.frames.push({ frameId: steps, completedAt, frameMs, renderFenceReadbackBytes: 0,
          cpuSubmitAndReadbackMs: performance.now()-frameStartedAt, live: stats.liveCount,
          renderedLive: batch.liveCount, trailCount, ribbonVertices, faded: batch.sprites.filter(s => s.fade < 1).length,
          drawCalls: diagnostics.drawCalls, nativeSubmissions: diagnostics.nativeSubmissions,
          width: canvas.width, height: canvas.height, visible: document.visibilityState === "visible",
          backend: lastBackend, capacity: particleCount, ...observed });

        return {
          diagnostics,
          readbackMode: useNativeCompute ? "compute storage readback" : "direct compatibility buffer",
          fields: {
            "Simulation steps": steps,
            Workgroups: workgroups,
            Particles: particleCount,
            Live: stats.liveCount,
            "Rendered live": batch.liveCount,
            "Ribbon vertices": ribbonVertices,
            "Compute count": observed?.count ?? 0,
            "Compute readback bytes": observed?.readbackBytes ?? 0,
            "Compute + readback ms": observed?.computeAndReadbackMs ?? 0,
            Spawned: stats.spawnedCount,
            "Particle backend": lastBackend,
            "Sub-emitters": "death sparks (chance 0.2)",
            Turbulence: "curl-noise LUT 8^3",
            Collision: "heightfield + 2 walls + kill floor",
            Trails: `ring depth 6, lifetime ${trailLifetime}`,
            "Life curves": "size + color/alpha LUT 16",
            Lighting: "velocity normal + ambient",
            "Soft fade": `planar ground, distance ${fadeDistance}`,
            overBudget: stats.overBudget,
            Dropped: stats.droppedCount,
            "Budget plan over": budgetPlan.overBudget,
          },
        };
      },
    };
  },
});

/** One-time authoring upload, then native storage simulation and vertex-pulled
 * quads/ribbons. Only compact GPU reduction counters return to JavaScript. */
async function setupResidentParticles(canvas: HTMLCanvasElement, width: number, height: number) {
  const { ResidentGPUParticleRenderer } = await import('@aura3d/rendering');
  // This route is fill-heavy (10k sprites plus resident ribbons). Cap its native
  // backbuffer at 1280 on the long edge while preserving the CSS aspect ratio.
  // The frozen P01 gate drives the reference viewport at its required 1280x720;
  // simulation occupancy and every visual feature remain unchanged.
  const residentSize = (nextWidth: number, nextHeight: number) => {
    const scale = Math.min(1, 1280 / Math.max(nextWidth, nextHeight));
    return { width: Math.max(1, Math.round(nextWidth * scale)), height: Math.max(1, Math.round(nextHeight * scale)) };
  };
  const initialSize = residentSize(width, height);
  const system=createParticleSystem();
  const collected=collectGPUParticleEffects(system.modules);
  if(!collected)throw new Error('Native resident particle effects are missing');
  const initial=system.emitters[0]!.emit(1,particleCount).particles;
  if(initial.length!==particleCount)throw new Error('Native resident particle initial occupancy mismatch');
  const positions=new Float32Array(particleCount*4),velocities=new Float32Array(particleCount*4),accelerations=new Float32Array(particleCount*4),baseAttributes=new Float32Array(particleCount*8);
  for(let i=0;i<particleCount;i++){
    const p=initial[i]!,o=i*4,b=i*8;
    positions.set([p.position.x,p.position.y,p.position.z,p.lifetime*(i+.5)/particleCount],o);
    velocities.set([p.velocity.x,p.velocity.y,p.velocity.z,p.lifetime],o);
    accelerations.set([p.acceleration.x,p.acceleration.y,p.acceleration.z,0],o);
    baseAttributes.set([p.color.r,p.color.g,p.color.b,p.color.a,p.size,0,0,0],b);
  }
  const owner=await ResidentGPUParticleRenderer.create(canvas,initialSize.width,initialSize.height,{effects:collected.effects,positions,velocities,accelerations,baseAttributes,count:particleCount});
  system.dispose();
  const capture={capturing:false,frames:[] as Record<string,unknown>[],
    start(){this.frames.length=0;this.capturing=true;window.__a3dShowcaseTelemetryPaused=true;},
    stop(){this.capturing=false;window.__a3dShowcaseTelemetryPaused=false;return this.frames;}};
  (window as unknown as Record<string,unknown>).__a3dParticle301=capture;
  let frozen=false;
  let pendingControl: { options: Parameters<typeof owner.setVisualControl>[0]; resolve: () => void } | null=null;
  (window as unknown as Record<string,unknown>).__a3dParticle301Visual={
    control(options: Parameters<typeof owner.setVisualControl>[0]):Promise<void>{
      if(capture.capturing)throw new Error('Visual controls forbidden during timed measurement');
      if(pendingControl)throw new Error('Visual control already pending');
      frozen=true;return new Promise(resolve=>{pendingControl={options,resolve};});
    },
    resume(){if(capture.capturing||pendingControl)throw new Error('Cannot resume during measurement/control');owner.setVisualControl({trails:true,softFade:true,lighting:true});frozen=false;}
  };
  // Collision visual proof uses an independent native replay after timed capture.
  // The same immutable emitter samples, camera, resolution and 180 fixed steps
  // are used in both runs; only the collision effects are removed in the control.
  let collisionOwner: InstanceType<typeof ResidentGPUParticleRenderer> | null = null;
  let collisionCanvas: HTMLCanvasElement | null = null;
  let collisionRunning = false;
  const timedStart = capture.start.bind(capture);
  capture.start = () => {
    if (collisionRunning || collisionOwner) throw new Error('Timed measurement forbidden during collision replay');
    timedStart();
  };
  const collisionCleanup = () => {
    if (collisionRunning) throw new Error('Await collision replay before cleanup');
    collisionOwner?.dispose(); collisionOwner = null;
    collisionCanvas?.remove(); collisionCanvas = null;
  };
  (window as unknown as Record<string,unknown>).__a3dParticle301Collision = {
    async run(disabled: boolean) {
      if (capture.capturing || collisionRunning || collisionOwner) throw new Error('Collision replay requires stopped measurement and no active replay');
      // Stop the primary simulation at its next owned frame boundary.
      const visual = (window as unknown as { __a3dParticle301Visual: { control(options: { trails: boolean; softFade: boolean; lighting: boolean }): Promise<void> } }).__a3dParticle301Visual;
      collisionRunning = true;
      try { await visual.control({ trails: true, softFade: true, lighting: true }); }
      catch (error) { collisionRunning = false; throw error; }
      const replayCanvas = document.createElement('canvas');
      replayCanvas.id = 'a3d-particle-301-collision-replay';
      replayCanvas.setAttribute('aria-label', disabled ? 'Native collision-disabled replay' : 'Native full-collision replay');
      const replayBounds = canvas.getBoundingClientRect();
      Object.assign(replayCanvas.style, { position: 'fixed', top: '0', left: '0', width: `${replayBounds.width}px`, height: `${replayBounds.height}px`, zIndex: '2147483647' });
      document.body.append(replayCanvas); collisionCanvas = replayCanvas;
      try {
        const effects = disabled ? { ...collected.effects, planes: undefined, heightfield: undefined } : collected.effects;
        collisionOwner = await ResidentGPUParticleRenderer.create(replayCanvas, width, height, {
          effects, positions: positions.slice(), velocities: velocities.slice(), accelerations: accelerations.slice(),
          baseAttributes: baseAttributes.slice(), count: particleCount,
        });
        const frames = [];
        let contacts = 0;
        for (let index = 0; index < 180; index++) {
          const frame = await collisionOwner.render(1 / 60);
          contacts += frame.collisionContacts;
          frames.push({ step: index + 1, contacts: frame.collisionContacts, collision: frame.collision, live: frame.live,
            renderedLive: frame.renderedLive, childSpawns: frame.childSpawns, drawCalls: frame.diagnostics.drawCalls,
            nativeSubmissions: frame.diagnostics.nativeSubmissions });
        }
        return { schema: 'muse301-resident-collision-replay/v1', disabled, steps: 180, deltaTime: 1 / 60,
          width, height, capacity: particleCount, camera: collisionOwner.camera,
          adapterName: collisionOwner.adapterName, backend: 'webgpu', executionPath: 'gpu-resident-storage',
          seedSource: 'same immutable packed emitter samples', collisionContacts: contacts, frames,
          canvasId: replayCanvas.id };
      } catch (error) {
        collisionRunning = false; collisionCleanup(); throw error;
      } finally { collisionRunning = false; }
    },
    cleanup: collisionCleanup,
  };
  let lastFields:Record<string,string|number|boolean>={};
  let gpuTimingActive=false;
  let gpuTimingFrames:Record<string,unknown>[]=[];
  (window as unknown as Record<string,unknown>).__a3dParticle301GPUTiming={
    supported:owner.supportsGPUTimestamps,
    start(){
      if(capture.capturing||collisionRunning||collisionOwner||pendingControl||pacingActive)throw new Error('GPU timing requires stopped acceptance and controls');
      gpuTimingFrames=[];gpuTimingActive=true;
    },
    stop(){gpuTimingActive=false;return gpuTimingFrames;},
    get frames(){return gpuTimingFrames;},
  };
  let pacingActive=false;
  let pacingFrames:Record<string,unknown>[]=[];
  let pacingPrevious=0;
  (window as unknown as Record<string,unknown>).__a3dParticle301Pacing={
    start(){
      if(capture.capturing||collisionRunning||collisionOwner||pendingControl)throw new Error('Pacing control requires stopped full workload measurement');
      pacingFrames=[];pacingPrevious=performance.now();pacingActive=true;
    },
    stop(){pacingActive=false;return pacingFrames;},
    get frames(){return pacingFrames;},
  };
  const guardedCaptureStart=capture.start.bind(capture);
  capture.start=()=>{if(pacingActive||gpuTimingActive)throw new Error('Full measurement forbidden during pacing control');guardedCaptureStart();};
  let steps=0,lastCompletedAt=performance.now();
  return {
    // Acceptance uses one completed submission per display interval. Allowing a
    // second frame when a prior map callback is late creates short/long completion
    // pairs that inflate the measured p95 without adding rendered work.
    get maxFramesInFlight():1|3{return capture.capturing||frozen||pendingControl||pacingActive||gpuTimingActive||collisionRunning?1:3;},
    requestedBackend:'auto' as const,selectedBackend:'webgpu' as const,adapterName:owner.adapterName,
    capabilities:['webgpu-compute','gpu-resident-particles','a4-sub-emitters','a4-curl-turbulence','a4-heightfield-collision','a4-ribbon-trails','a4-life-curves','a4-particle-lighting','a4-soft-particles'],
    resize:(w:number,h:number)=>{const size=residentSize(w,h);owner.resize(size.width,size.height);},dispose:()=>owner.dispose(),
    async render(_timeSeconds:number){
      if(pacingActive){
        const result=await owner.renderPacingControl();const completedAt=performance.now();
        pacingFrames.push({...result,completedAt,frameMs:completedAt-pacingPrevious,foreground:document.visibilityState==='visible'});pacingPrevious=completedAt;
        return {diagnostics:{drawCalls:0,nativeSubmissions:result.nativeSubmissions},readbackMode:'GPU-resident state; per-submission completion plus compact periodic counters',fields:lastFields};
      }
      const startedAt=performance.now();const control=pendingControl;pendingControl=null;if(control)owner.setVisualControl(control.options);const result=await owner.render(gpuTimingActive?1/60:frozen?0:1/60,gpuTimingActive,!frozen&&!gpuTimingActive&&!control);control?.resolve();const returnedAt=performance.now();steps=result.diagnostics.nativeSubmissions;const completedAt=result.queueCompletedAt;
      const frame={...result,frameId:steps,completedAt,frameMs:completedAt-lastCompletedAt,renderFenceReadbackBytes:0,cpuSubmitAndReadbackMs:returnedAt-startedAt,width:canvas.width,height:canvas.height,visible:document.visibilityState==='visible',backend:'webgpu',executionPath:'gpu-resident-storage',capacity:particleCount,drawCalls:result.diagnostics.drawCalls,nativeSubmissions:result.diagnostics.nativeSubmissions,submissionQueue:(window as unknown as {__a3dShowcaseSubmissionQueue?:unknown}).__a3dShowcaseSubmissionQueue};
      if(gpuTimingActive)gpuTimingFrames.push(frame);
      lastCompletedAt=completedAt;if(capture.capturing)capture.frames.push(frame);
      return {diagnostics:result.diagnostics,readbackMode:'GPU-resident state; per-submission completion plus compact periodic counters',fields:lastFields={
        'Simulation steps':steps,Workgroups:result.workgroups,Particles:particleCount,Live:result.live,'Rendered live':result.renderedLive,'Ribbon vertices':result.ribbonVertices,'Compute count':result.count,'Compute readback bytes':result.readbackBytes,'Compute + readback ms':result.computeAndReadbackMs,'Particle backend':'webgpu','Sub-emitters':'native child lifecycle','Turbulence':'curl-noise LUT 8^3','Collision':'heightfield + 2 walls + kill floor','Trails':`ring depth 6, lifetime ${trailLifetime}`,'Life curves':'size + color/alpha LUT 16','Lighting':'velocity normal + ambient','Soft fade':`planar ground, distance ${fadeDistance}`,'GPU residency':'simulation and draw share storage; no CPU particle arrays per frame','Budget plan over':budgetPlan.overBudget}};
    }
  };
}
