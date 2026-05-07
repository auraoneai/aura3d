import {
  CollisionModule,
  ColorModule,
  ForceModule,
  ParticleEmitter,
  ParticleRenderer,
  ParticleSystem,
  SizeModule,
} from "@galileo3d/rendering";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "10-particles",
  title: "10 Particles",
  purpose: "Run a deterministic CPU particle fountain through public effects APIs.",
  acceptance: "A seeded fountain is visible and particle stats expose live/spawn/upload counts.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const system = new ParticleSystem({
      maxParticles: 700,
      emitters: [
        new ParticleEmitter({
          seed: 2026,
          emissionRate: 180,
          lifetime: { min: 1.2, max: 2.4 },
          speed: { min: 0.3, max: 1.2 },
          shape: { type: "box", center: { y: 0.05 }, size: { x: 0.5, y: 0.1, z: 0.2 } },
          initial: { size: 0.12 },
        }),
      ],
      modules: [
        new ForceModule({ x: 0, y: -0.35, z: 0 }),
        new CollisionModule({ normal: { x: 0, y: 1, z: 0 }, constant: 0, restitution: 0.28 }),
        new ColorModule([
          { time: 0, color: { r: 1, g: 0.72, b: 0.25, a: 1 } },
          { time: 1, color: { r: 0.18, g: 0.36, b: 1, a: 0.18 } },
        ]),
        new SizeModule([
          { time: 0, size: 0.08 },
          { time: 0.4, size: 0.18 },
          { time: 1, size: 0.02 },
        ]),
      ],
    });
    const renderer = new ParticleRenderer();

    return {
      metrics: () => system.getStats(),
      draw(context, canvas) {
        system.update(1 / 60);
        const batch = renderer.buildBatch(system.particles);
        for (const sprite of batch.sprites) {
          const x = canvas.width * 0.5 + sprite.position.x * 220;
          const y = canvas.height * 0.76 - sprite.position.y * 190;
          context.fillStyle = `rgba(${sprite.color.r * 255}, ${sprite.color.g * 255}, ${sprite.color.b * 255}, ${sprite.color.a})`;
          context.beginPath();
          context.arc(x, y, Math.max(1, sprite.size * 60), 0, Math.PI * 2);
          context.fill();
        }
        system.recordBufferUpload(batch.uploadedBytes);
      },
    };
  });
}
