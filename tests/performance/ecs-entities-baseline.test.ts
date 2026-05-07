import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";
import { TransformComponent, World } from "@galileo3d/ecs";
import { describe, expect, it } from "vitest";

export interface ECSEntityBaselineReport {
  readonly name: "ecs-entities-100000";
  readonly entityCount: number;
  readonly createdEntities: number;
  readonly queryMatches: number;
  readonly createMs: number;
  readonly addComponentMs: number;
  readonly iterateMs: number;
  readonly totalMs: number;
  readonly timestamp: string;
}

export function runECSEntityBaseline(entityCount = 100_000): ECSEntityBaselineReport {
  const world = new World();
  world.registerComponent(TransformComponent);
  const entities = new Array<ReturnType<World["createEntity"]>>(entityCount);

  const start = performance.now();
  for (let index = 0; index < entityCount; index += 1) {
    entities[index] = world.createEntity();
  }
  const afterCreate = performance.now();
  for (let index = 0; index < entityCount; index += 1) {
    world.add(entities[index]!, TransformComponent, new TransformComponent([index, index % 7, index % 13]));
  }
  const afterAdd = performance.now();

  let queryMatches = 0;
  let sum = 0;
  world.query({ include: [TransformComponent] }).forEach((entity) => {
    const transform = world.get(entity, TransformComponent);
    if (!transform) throw new Error("Missing TransformComponent during ECS baseline iteration.");
    queryMatches += 1;
    sum += transform.position[0];
  });
  const afterIterate = performance.now();
  if (sum !== ((entityCount - 1) * entityCount) / 2) throw new Error("ECS baseline iteration checksum failed.");

  return {
    name: "ecs-entities-100000",
    entityCount,
    createdEntities: world.entities.size,
    queryMatches,
    createMs: afterCreate - start,
    addComponentMs: afterAdd - afterCreate,
    iterateMs: afterIterate - afterAdd,
    totalMs: afterIterate - start,
    timestamp: new Date().toISOString()
  };
}

export function writeECSEntityBaselineReport(root = process.cwd(), entityCount = 100_000): ECSEntityBaselineReport {
  const report = runECSEntityBaseline(entityCount);
  const path = join(root, "tests", "reports", "ecs-entities.json");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

describe("ECS 100,000 entity performance baseline", () => {
  it("records a query iteration baseline report", () => {
    const report = writeECSEntityBaselineReport();

    expect(report.entityCount).toBe(100_000);
    expect(report.createdEntities).toBe(100_000);
    expect(report.queryMatches).toBe(100_000);
    expect(report.totalMs).toBeGreaterThan(0);
  }, 30_000);
});
