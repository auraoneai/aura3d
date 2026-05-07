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
} from "@galileo3d/ecs";
import { Quaternion, Vector3 } from "@galileo3d/math";
import { describe, expect, it } from "vitest";

class VelocityComponent {
  constructor(public value: [number, number, number]) {}
}

describe("ECS runtime", () => {
  it("provides minimal transform, name, and tag components with edge-case validation", () => {
    const defaults = new TransformComponent();
    const moved = new TransformComponent([1, 2, 3], [0, 0, 0, 2], [2, 3, 4]);

    expect(defaults.position).toEqual([0, 0, 0]);
    expect(defaults.rotation).toEqual([0, 0, 0, 1]);
    expect(defaults.scale).toEqual([1, 1, 1]);
    expect(moved.rotation).toEqual([0, 0, 0, 1]);
    expect(moved.toJSON()).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
      scale: [2, 3, 4]
    });
    expect(moved.toMath().position.toArray()).toEqual([1, 2, 3]);
    expect(new NameComponent("hero").name).toBe("hero");
    expect(new TagComponent("player").tag).toBe("player");
    expect(() => new NameComponent("")).toThrow(/non-empty name/i);
    expect(() => new TagComponent("")).toThrow(/non-empty tag/i);
  });

  it("rejects stale entity handles after reuse", () => {
    const world = new World();
    const first = world.createEntity();
    world.destroyEntity(first);
    const second = world.createEntity();

    expect(first.id).toBe(second.id);
    expect(first.generation).not.toBe(second.generation);
    expect(() => world.get(first, NameComponent)).toThrow(/not alive/i);
  });

  it("keeps component registration deterministic per world", () => {
    const a = new World();
    const b = new World();
    a.registerComponent(TransformComponent);
    a.registerComponent(NameComponent);
    b.registerComponent(TransformComponent);
    b.registerComponent(NameComponent);

    expect(a.registry.require(TransformComponent).id).toBe(0);
    expect(a.registry.require(NameComponent).id).toBe(1);
    expect(b.registry.require(TransformComponent).id).toBe(0);
    expect(b.registry.require(NameComponent).id).toBe(1);
  });

  it("updates queries after component transitions", () => {
    const world = new World();
    const moving = world.createEntity();
    const named = world.createEntity();
    world.add(moving, TransformComponent, new TransformComponent());
    world.add(moving, VelocityComponent, new VelocityComponent([1, 0, 0]));
    world.add(named, TransformComponent, new TransformComponent());
    world.add(named, NameComponent, new NameComponent("stationary"));

    expect(world.query({ include: [TransformComponent], exclude: [NameComponent] }).toArray()).toEqual([moving]);

    world.add(moving, NameComponent, new NameComponent("moving"));

    expect(world.query({ include: [TransformComponent], exclude: [NameComponent] }).toArray()).toEqual([]);
  });

  it("supports command-buffer mutation during query iteration", () => {
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

    expect(world.query({ include: [TransformComponent] }).toArray()).toEqual(created);
    expect(world.get(created[0]!, TransformComponent)?.position).toEqual([1, 2, 3]);
  });

  it("rejects invalid command buffers before mutating the world", () => {
    const world = new World();
    world.registerComponent(NameComponent);
    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent([4, 5, 6]));
    const commands = new CommandBuffer();
    commands.destroyEntity(entity);
    commands.add(entity, NameComponent, new NameComponent("invalid-after-destroy"));

    expect(() => commands.flush(world)).toThrow(/already destroyed|not alive/i);
    expect(world.entities.isAlive(entity)).toBe(true);
    expect(world.get(entity, TransformComponent)?.position).toEqual([4, 5, 6]);
    expect(world.get(entity, NameComponent)).toBeUndefined();
  });

  it("does not create temp entities when temp command validation fails", () => {
    const world = new World();
    const commands = new CommandBuffer();
    const temp = commands.createEntity();
    commands.destroyEntity(temp);
    commands.add(temp, NameComponent, new NameComponent("invalid-temp"));

    expect(() => commands.flush(world)).toThrow(/Temporary entity is not alive/i);
    expect(world.entities.size).toBe(0);
  });

  it("orders systems by dependency and rejects cycles", () => {
    const make = (name: string, after: string[] = []): System => ({ name, after, update: () => undefined });
    const scheduler = new SystemScheduler();
    scheduler.add(make("input"));
    scheduler.add(make("movement", ["input"]));
    scheduler.add(make("commit", ["movement"]));

    expect(scheduler.order().map((system) => system.name)).toEqual(["input", "movement", "commit"]);

    const cycle = new SystemScheduler();
    cycle.add(make("a", ["b"]));
    cycle.add(make("b", ["a"]));
    expect(() => cycle.order()).toThrow(/cycle/i);
  });

  it("serializes components and exposes profile data", () => {
    const world = new World();
    world.registerComponent(TransformComponent);
    world.registerComponent(NameComponent);
    const entity = world.createEntity();
    world.add(entity, TransformComponent, new TransformComponent(new Vector3(1, 2, 3), Quaternion.identity));
    world.add(entity, NameComponent, new NameComponent("hero"));
    world.add(entity, TagComponent, new TagComponent("player"));

    const snapshot = profileWorld(world);
    const { world: restored, remap } = deserializeWorld(serializeWorld(world), [TransformComponent, NameComponent, TagComponent]);
    const restoredEntity = remap.get(`${entity.id}:${entity.generation}`)!;

    expect(snapshot.entities).toBe(1);
    expect(restored.get(restoredEntity, TransformComponent)?.position).toEqual([1, 2, 3]);
    expect(restored.get(restoredEntity, TagComponent)?.tag).toBe("player");
  });
});
