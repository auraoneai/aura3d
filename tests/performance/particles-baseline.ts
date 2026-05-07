import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  CollisionModule,
  ColorModule,
  ForceModule,
  ParticleEmitter,
  ParticleRenderer,
  ParticleSystem,
  SizeModule,
  VelocityModule,
  type Particle,
  type ParticleModule,
  type ParticleUpdateContext,
} from "@galileo3d/rendering";

interface AssertionContext {
  name: string;
}

function assert(condition: unknown, message: string, context?: AssertionContext): asserts condition {
  if (!condition) {
    const prefix = context ? `${context.name}: ` : "";
    throw new Error(`${prefix}${message}`);
  }
}

function nearlyEqual(left: number, right: number, epsilon = 1e-9): boolean {
  return Math.abs(left - right) <= epsilon;
}

function createDeterministicSystem(): ParticleSystem {
  return new ParticleSystem({
    maxParticles: 128,
    emitters: [
      new ParticleEmitter({
        seed: 12345,
        emissionRate: 20,
        lifetime: { min: 0.6, max: 1.2 },
        speed: { min: 0.5, max: 1.25 },
        shape: { type: "box", center: { y: 1 }, size: { x: 0.5, y: 0.25, z: 0.5 } },
        bursts: [{ time: 0, count: 4 }],
        initial: {
          color: { r: 1, g: 0.45, b: 0.08, a: 1 },
          size: 0.2,
        },
      }),
    ],
    modules: [
      new VelocityModule(
        [
          { time: 0, value: { x: 0, y: 2.5, z: 0 } },
          { time: 1, value: { x: 0.2, y: 0.25, z: 0 } },
        ],
        "add",
      ),
      new ForceModule({ x: 0.05, y: -2.8, z: 0 }),
      new ColorModule([
        { time: 0, color: { r: 1, g: 0.65, b: 0.2, a: 1 } },
        { time: 1, color: { r: 0.2, g: 0.08, b: 0.02, a: 0 } },
      ]),
      new SizeModule([
        { time: 0, size: 0.12 },
        { time: 0.5, size: 0.32 },
        { time: 1, size: 0.02 },
      ]),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.25 }),
    ],
  });
}

function runSystem(system: ParticleSystem, frames: number, deltaTime: number): string {
  for (let index = 0; index < frames; index += 1) {
    system.update(deltaTime);
  }

  return JSON.stringify(
    system.particles.map((particle) => ({
      id: particle.id,
      age: Number(particle.age.toFixed(6)),
      lifetime: Number(particle.lifetime.toFixed(6)),
      position: {
        x: Number(particle.position.x.toFixed(6)),
        y: Number(particle.position.y.toFixed(6)),
        z: Number(particle.position.z.toFixed(6)),
      },
      velocity: {
        x: Number(particle.velocity.x.toFixed(6)),
        y: Number(particle.velocity.y.toFixed(6)),
        z: Number(particle.velocity.z.toFixed(6)),
      },
      size: Number(particle.size.toFixed(6)),
      color: {
        r: Number(particle.color.r.toFixed(6)),
        g: Number(particle.color.g.toFixed(6)),
        b: Number(particle.color.b.toFixed(6)),
        a: Number(particle.color.a.toFixed(6)),
      },
    })),
  );
}

function verifyDeterminism(): void {
  const first = createDeterministicSystem();
  const second = createDeterministicSystem();
  const firstSnapshot = runSystem(first, 48, 1 / 60);
  const secondSnapshot = runSystem(second, 48, 1 / 60);

  assert(firstSnapshot === secondSnapshot, "seeded particle simulation diverged", { name: "determinism" });
  assert(first.getStats().spawnedCount === second.getStats().spawnedCount, "spawn counts diverged", { name: "determinism" });
  assert(first.particles.length > 0, "deterministic fixture should leave visible live particles", { name: "determinism" });
}

function verifyModuleOrder(): void {
  const order: string[] = [];
  const makeModule = (name: string): ParticleModule => ({
    name,
    onSpawn(_particle: Particle, _context: ParticleUpdateContext) {
      order.push(`${name}:spawn`);
    },
    update(_particle: Particle, _context: ParticleUpdateContext) {
      order.push(`${name}:update`);
    },
    afterIntegrate(_particle: Particle, _context: ParticleUpdateContext) {
      order.push(`${name}:after`);
    },
  });

  const system = new ParticleSystem({
    maxParticles: 4,
    emitters: [
      new ParticleEmitter({
        seed: 7,
        emissionRate: 0,
        bursts: [{ time: 0, count: 1 }],
      }),
    ],
    modules: [makeModule("a"), makeModule("b")],
  });

  system.update(1 / 60);

  assert(
    order.join(",") === "a:spawn,b:spawn,a:update,b:update,a:after,b:after",
    `unexpected module order ${order.join(",")}`,
    { name: "module-order" },
  );
}

function verifyCollisionAndRendererStats(): void {
  const system = new ParticleSystem({
    maxParticles: 2,
    emitters: [
      new ParticleEmitter({
        seed: 1,
        emissionRate: 0,
        bursts: [{ time: 0, count: 1 }],
        lifetime: 2,
        speed: 0,
        shape: { type: "point", position: { y: 0.1 } },
        initial: { size: 0.5 },
      }),
    ],
    modules: [
      new ForceModule({ x: 0, y: -10, z: 0 }),
      new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0 }),
    ],
  });

  system.update(0.2);
  assert(system.particles[0].position.y >= 0, "collision module allowed particle below plane", { name: "collision" });
  assert(nearlyEqual(system.particles[0].velocity.y, 0), "inelastic collision should remove normal velocity", { name: "collision" });

  const renderer = new ParticleRenderer();
  const batch = renderer.render(system, { drawParticles() {} });
  assert(batch.liveCount === system.particles.length, "renderer batch live count mismatch", { name: "renderer" });
  assert(system.getStats().bufferUploads === 1, "renderer did not report a buffer upload", { name: "renderer" });
  assert(system.getStats().uploadedBytes === batch.uploadedBytes, "uploaded byte stats mismatch", { name: "renderer" });
}

function measureParticleBaseline(): Record<string, unknown> {
  const system = new ParticleSystem({
    maxParticles: 10_000,
    emitters: [
      new ParticleEmitter({
        seed: 99,
        emissionRate: 10_000,
        lifetime: 5,
        speed: { min: 0.2, max: 2 },
        shape: { type: "sphere", radius: 1 },
      }),
    ],
    modules: [
      new ForceModule({ x: 0, y: -0.25, z: 0 }),
      new SizeModule([
        { time: 0, size: 0.05 },
        { time: 1, size: 0.01 },
      ]),
    ],
  });

  system.update(1);
  const before = performance.now();

  for (let frame = 0; frame < 120; frame += 1) {
    system.update(1 / 60);
  }

  const elapsedMs = performance.now() - before;

  return {
    name: "particles-cpu-10000",
    liveCount: system.particles.length,
    spawnedCount: system.getStats().spawnedCount,
    killedCount: system.getStats().killedCount,
    frames: 120,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    averageFrameMs: Number((elapsedMs / 120).toFixed(4)),
  };
}

function main(): void {
  verifyDeterminism();
  verifyModuleOrder();
  verifyCollisionAndRendererStats();

  const baseline = measureParticleBaseline();
  const report = {
    generatedAt: new Date().toISOString(),
    suite: "workstream-6-particles",
    status: "pass",
    baselines: [baseline],
  };

  if (process.argv.includes("--write-report")) {
    const reportPath = resolve("tests/reports/performance.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
