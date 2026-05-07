import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CommandBuffer,
  NameComponent,
  SystemScheduler,
  TagComponent,
  TransformComponent,
  World,
  deserializeWorld,
  profileWorld,
  serializeWorld,
  type System
} from "../src/index.js";

class VelocityComponent {
  constructor(public value: [number, number, number]) {}
}

test("entities reject stale handles after destroy and reuse", () => {
  const world = new World();
  const first = world.createEntity();
  assert.equal(world.destroyEntity(first), true);
  const second = world.createEntity();

  assert.equal(first.id, second.id);
  assert.notEqual(first.generation, second.generation);
  assert.throws(() => world.get(first, NameComponent), /not alive/);
});

test("component registration is deterministic per world", () => {
  const a = new World();
  const b = new World();
  a.registerComponent(TransformComponent);
  a.registerComponent(NameComponent);
  b.registerComponent(TransformComponent);
  b.registerComponent(NameComponent);

  assert.equal(a.registry.require(TransformComponent).id, 0);
  assert.equal(a.registry.require(NameComponent).id, 1);
  assert.equal(b.registry.require(TransformComponent).id, 0);
  assert.equal(b.registry.require(NameComponent).id, 1);
});

test("query include and exclude masks update after component transitions", () => {
  const world = new World();
  const moving = world.createEntity();
  const named = world.createEntity();
  world.add(moving, TransformComponent, new TransformComponent());
  world.add(moving, VelocityComponent, new VelocityComponent([1, 0, 0]));
  world.add(named, TransformComponent, new TransformComponent());
  world.add(named, NameComponent, new NameComponent("stationary"));

  assert.deepEqual(world.query({ include: [TransformComponent], exclude: [NameComponent] }).toArray(), [moving]);

  world.remove(moving, VelocityComponent);
  world.add(moving, NameComponent, new NameComponent("moving"));

  assert.deepEqual(world.query({ include: [TransformComponent], exclude: [NameComponent] }).toArray(), []);
});

test("command buffer supports create/add/destroy during query iteration", () => {
  const world = new World();
  const original = world.createEntity();
  world.add(original, TransformComponent, new TransformComponent());
  const commands = new CommandBuffer();

  world.query({ include: [TransformComponent] }).forEach((entity) => {
    const temp = commands.createEntity();
    commands.add(temp, TransformComponent, new TransformComponent([1, 2, 3]));
    commands.destroyEntity(entity);
  });
  const created = commands.flush(world);

  assert.equal(created.length, 1);
  assert.deepEqual(world.query({ include: [TransformComponent] }).toArray(), created);
  assert.deepEqual(world.get(created[0], TransformComponent)?.position, [1, 2, 3]);
});

test("system scheduler orders dependencies and rejects cycles", () => {
  const order: string[] = [];
  const make = (name: string, after: string[] = []): System => ({
    name,
    after,
    update: () => order.push(name)
  });
  const scheduler = new SystemScheduler();
  scheduler.add(make("input"));
  scheduler.add(make("movement", ["input"]));
  scheduler.add(make("commit", ["movement"]));

  assert.deepEqual(scheduler.order().map((system) => system.name), ["input", "movement", "commit"]);

  const cycle = new SystemScheduler();
  cycle.add(make("a", ["b"]));
  cycle.add(make("b", ["a"]));
  assert.throws(() => cycle.order(), /cycle rejected/);
});

test("world update runs fixed, update, and late phases in explicit order", () => {
  const world = new World();
  const order: string[] = [];
  world.systems.add({ name: "late", phase: "late", update: () => order.push("late") });
  world.systems.add({ name: "fixed", phase: "fixed", update: () => order.push("fixed") });
  world.systems.add({ name: "update", phase: "update", update: () => order.push("update") });

  world.update({ deltaTime: 1 / 60, elapsedTime: 1, frame: 1 });

  assert.deepEqual(order, ["fixed", "update", "late"]);
});

test("ECS serialization roundtrips registered component data and remaps entities", () => {
  const world = new World();
  world.registerComponent(TransformComponent);
  world.registerComponent(NameComponent);
  const entity = world.createEntity();
  world.add(entity, TransformComponent, new TransformComponent([1, 2, 3]));
  world.add(entity, NameComponent, new NameComponent("hero"));

  const { world: restored, remap } = deserializeWorld(serializeWorld(world), [TransformComponent, NameComponent]);
  const restoredEntity = remap.get(`${entity.id}:${entity.generation}`);

  assert.ok(restoredEntity);
  assert.deepEqual(restored.get(restoredEntity, TransformComponent), { position: [1, 2, 3], rotation: [0, 0, 0, 1], scale: [1, 1, 1] });
  assert.deepEqual(restored.get(restoredEntity, NameComponent), { name: "hero" });
});

test("profiler reports entity and component counts", () => {
  const world = new World();
  const entity = world.createEntity();
  world.add(entity, TagComponent, new TagComponent("player"));

  assert.deepEqual(profileWorld(world).components.map((entry) => [entry.name, entry.count]), [["TagComponent", 1]]);
});
