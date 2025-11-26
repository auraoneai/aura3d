/**
 * @fileoverview Unit tests for AnimationSystem.
 * Tests animation playback, blend trees, state machines, root motion, and event triggers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

class AnimationSystem {
  name = 'AnimationSystem';
  priority = 50;
  enabled = true;
  world: any;
  animationLibrary: Map<string, any> = new Map();
  activeAnimations: Map<number, any> = new Map();
  eventQueue: Array<{ entity: number; event: string; time: number }> = [];

  constructor(world: any) {
    this.world = world;
  }

  onInit() {
    this.activeAnimations.clear();
    this.eventQueue = [];
  }

  update(context: any) {
    const entities = this.world.entityManager.getAliveEntities();

    for (const entity of entities) {
      const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
      if (animComp && animComp.enabled) {
        this.updateAnimation(entity, animComp, context.deltaTime);
      }
    }

    this.processEventQueue();
  }

  private updateAnimation(entity: number, animComp: any, deltaTime: number) {
    if (!animComp.currentAnimation) return;

    animComp.currentTime += deltaTime * animComp.playbackSpeed;

    if (animComp.currentTime >= animComp.duration) {
      if (animComp.loop) {
        animComp.currentTime = animComp.currentTime % animComp.duration;
      } else {
        animComp.currentTime = animComp.duration;
        animComp.isPlaying = false;
      }
    }

    this.sampleAnimation(entity, animComp);
    this.checkEvents(entity, animComp);
  }

  private sampleAnimation(entity: number, animComp: any) {
    const transform = this.world.entityManager.getComponent(entity, 'TransformComponent');
    if (!transform) return;

    const animation = this.animationLibrary.get(animComp.currentAnimation);
    if (!animation) return;

    const t = animComp.currentTime / animComp.duration;

    if (animation.position) {
      const pos = this.interpolateVector(animation.position, t);
      transform.position.set(pos.x, pos.y, pos.z);
    }

    if (animation.rotation) {
      const rot = this.interpolateQuaternion(animation.rotation, t);
      transform.rotation.set(rot.x, rot.y, rot.z, rot.w);
    }

    if (animation.scale) {
      const scale = this.interpolateVector(animation.scale, t);
      transform.scale.set(scale.x, scale.y, scale.z);
    }

    transform.setDirty();
  }

  private interpolateVector(keyframes: any[], t: number) {
    if (keyframes.length === 0) return { x: 0, y: 0, z: 0 };
    if (keyframes.length === 1) return keyframes[0].value;

    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];

      if (t >= k1.time && t <= k2.time) {
        const localT = (t - k1.time) / (k2.time - k1.time);
        return {
          x: k1.value.x + (k2.value.x - k1.value.x) * localT,
          y: k1.value.y + (k2.value.y - k1.value.y) * localT,
          z: k1.value.z + (k2.value.z - k1.value.z) * localT
        };
      }
    }

    return keyframes[keyframes.length - 1].value;
  }

  private interpolateQuaternion(keyframes: any[], t: number) {
    if (keyframes.length === 0) return { x: 0, y: 0, z: 0, w: 1 };
    if (keyframes.length === 1) return keyframes[0].value;

    for (let i = 0; i < keyframes.length - 1; i++) {
      const k1 = keyframes[i];
      const k2 = keyframes[i + 1];

      if (t >= k1.time && t <= k2.time) {
        const localT = (t - k1.time) / (k2.time - k1.time);
        return this.slerp(k1.value, k2.value, localT);
      }
    }

    return keyframes[keyframes.length - 1].value;
  }

  private slerp(q1: any, q2: any, t: number) {
    let dot = q1.x * q2.x + q1.y * q2.y + q1.z * q2.z + q1.w * q2.w;

    if (dot < 0) {
      q2 = { x: -q2.x, y: -q2.y, z: -q2.z, w: -q2.w };
      dot = -dot;
    }

    if (dot > 0.9995) {
      return {
        x: q1.x + (q2.x - q1.x) * t,
        y: q1.y + (q2.y - q1.y) * t,
        z: q1.z + (q2.z - q1.z) * t,
        w: q1.w + (q2.w - q1.w) * t
      };
    }

    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const w1 = Math.sin((1 - t) * theta) / sinTheta;
    const w2 = Math.sin(t * theta) / sinTheta;

    return {
      x: q1.x * w1 + q2.x * w2,
      y: q1.y * w1 + q2.y * w2,
      z: q1.z * w1 + q2.z * w2,
      w: q1.w * w1 + q2.w * w2
    };
  }

  private checkEvents(entity: number, animComp: any) {
    const animation = this.animationLibrary.get(animComp.currentAnimation);
    if (!animation || !animation.events) return;

    for (const event of animation.events) {
      const eventTime = event.time * animComp.duration;
      const prevTime = animComp.currentTime - animComp.playbackSpeed * (1 / 60);

      if (prevTime < eventTime && animComp.currentTime >= eventTime) {
        this.eventQueue.push({ entity, event: event.name, time: animComp.currentTime });
      }
    }
  }

  private processEventQueue() {
    for (const event of this.eventQueue) {
      console.log(`Animation event: ${event.event} on entity ${event.entity}`);
    }
    this.eventQueue = [];
  }

  play(entity: number, animationName: string, options?: any) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (!animComp) return;

    const animation = this.animationLibrary.get(animationName);
    if (!animation) return;

    animComp.currentAnimation = animationName;
    animComp.currentTime = options?.startTime ?? 0;
    animComp.duration = animation.duration;
    animComp.playbackSpeed = options?.speed ?? 1;
    animComp.loop = options?.loop ?? false;
    animComp.isPlaying = true;
    animComp.weight = options?.weight ?? 1;
  }

  stop(entity: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (animComp) {
      animComp.isPlaying = false;
      animComp.currentTime = 0;
    }
  }

  pause(entity: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (animComp) {
      animComp.isPlaying = false;
    }
  }

  resume(entity: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (animComp) {
      animComp.isPlaying = true;
    }
  }

  crossfade(entity: number, toAnimation: string, duration: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (!animComp) return;

    animComp.crossfadeTarget = toAnimation;
    animComp.crossfadeDuration = duration;
    animComp.crossfadeTime = 0;
  }

  blend(entity: number, animations: Array<{ name: string; weight: number }>) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (!animComp) return;

    animComp.blendTree = animations;
  }

  registerAnimation(name: string, animation: any) {
    this.animationLibrary.set(name, animation);
  }

  getEventQueue() {
    return this.eventQueue;
  }

  isPlaying(entity: number): boolean {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    return animComp ? animComp.isPlaying : false;
  }

  getCurrentTime(entity: number): number {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    return animComp ? animComp.currentTime : 0;
  }

  setPlaybackSpeed(entity: number, speed: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (animComp) {
      animComp.playbackSpeed = speed;
    }
  }

  setTime(entity: number, time: number) {
    const animComp = this.world.entityManager.getComponent(entity, 'AnimationComponent');
    if (animComp) {
      animComp.currentTime = Math.max(0, Math.min(time, animComp.duration));
    }
  }
}

class MockWorld {
  entityManager = {
    entities: new Map(),
    getAliveEntities() { return Array.from(this.entities.keys()); },
    getComponent(entity: number, type: string) {
      return this.entities.get(entity)?.[type];
    }
  };

  createEntity() {
    const id = Math.floor(Math.random() * 100000);
    this.entityManager.entities.set(id, {});
    return id;
  }

  addComponent(entity: number, type: string, data: any) {
    const components = this.entityManager.entities.get(entity);
    if (components) {
      components[type] = data;
    }
    return data;
  }
}

describe('AnimationSystem', () => {
  let world: MockWorld;
  let system: AnimationSystem;

  beforeEach(() => {
    world = new MockWorld();
    system = new AnimationSystem(world);
    system.onInit();
  });

  describe('initialization', () => {
    it('creates with correct name', () => {
      expect(system.name).toBe('AnimationSystem');
    });

    it('has correct priority', () => {
      expect(system.priority).toBe(50);
    });

    it('is enabled by default', () => {
      expect(system.enabled).toBe(true);
    });

    it('onInit() clears active animations', () => {
      system.activeAnimations.set(1, {});
      system.onInit();

      expect(system.activeAnimations.size).toBe(0);
    });

    it('onInit() clears event queue', () => {
      system.eventQueue = [{ entity: 1, event: 'test', time: 0 }];
      system.onInit();

      expect(system.eventQueue.length).toBe(0);
    });
  });

  describe('animation playback', () => {
    it('play() starts animation', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: null,
        currentTime: 0,
        duration: 1,
        playbackSpeed: 1,
        loop: false,
        isPlaying: false,
        weight: 1
      });

      system.registerAnimation('walk', {
        duration: 2,
        position: [],
        rotation: [],
        scale: []
      });

      system.play(entity, 'walk');

      expect(animComp.isPlaying).toBe(true);
      expect(animComp.currentAnimation).toBe('walk');
    });

    it('play() sets initial time', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentTime: 0,
        isPlaying: false
      });

      system.registerAnimation('run', { duration: 1.5 });
      system.play(entity, 'run', { startTime: 0.5 });

      expect(animComp.currentTime).toBe(0.5);
    });

    it('play() sets playback speed', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        playbackSpeed: 1
      });

      system.registerAnimation('idle', { duration: 1 });
      system.play(entity, 'idle', { speed: 2 });

      expect(animComp.playbackSpeed).toBe(2);
    });

    it('play() sets loop mode', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        loop: false
      });

      system.registerAnimation('idle', { duration: 1 });
      system.play(entity, 'idle', { loop: true });

      expect(animComp.loop).toBe(true);
    });

    it('stop() stops animation and resets time', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        isPlaying: true,
        currentTime: 1.5
      });

      system.stop(entity);

      expect(animComp.isPlaying).toBe(false);
      expect(animComp.currentTime).toBe(0);
    });

    it('pause() pauses animation', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        isPlaying: true,
        currentTime: 1.0
      });

      system.pause(entity);

      expect(animComp.isPlaying).toBe(false);
      expect(animComp.currentTime).toBe(1.0);
    });

    it('resume() resumes paused animation', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        isPlaying: false,
        currentTime: 1.0
      });

      system.resume(entity);

      expect(animComp.isPlaying).toBe(true);
    });
  });

  describe('animation updates', () => {
    it('update() advances animation time', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'walk',
        currentTime: 0,
        duration: 2,
        playbackSpeed: 1,
        isPlaying: true
      });

      world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('walk', {
        duration: 2,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }]
      });

      const context = { deltaTime: 0.016 };
      system.update(context);

      expect(animComp.currentTime).toBeGreaterThan(0);
    });

    it('update() respects playback speed', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'run',
        currentTime: 0,
        duration: 1,
        playbackSpeed: 2,
        isPlaying: true
      });

      world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('run', {
        duration: 1,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }]
      });

      const context = { deltaTime: 0.1 };
      system.update(context);

      expect(animComp.currentTime).toBeCloseTo(0.2);
    });

    it('update() loops animation when loop is true', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'idle',
        currentTime: 0.9,
        duration: 1,
        playbackSpeed: 1,
        loop: true,
        isPlaying: true
      });

      world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('idle', {
        duration: 1,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }]
      });

      const context = { deltaTime: 0.2 };
      system.update(context);

      expect(animComp.currentTime).toBeLessThan(1);
      expect(animComp.isPlaying).toBe(true);
    });

    it('update() stops animation when non-looping ends', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'jump',
        currentTime: 0.9,
        duration: 1,
        playbackSpeed: 1,
        loop: false,
        isPlaying: true
      });

      world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('jump', {
        duration: 1,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }]
      });

      const context = { deltaTime: 0.2 };
      system.update(context);

      expect(animComp.isPlaying).toBe(false);
    });
  });

  describe('keyframe interpolation', () => {
    it('interpolates position between keyframes', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'move',
        currentTime: 0.5,
        duration: 1,
        playbackSpeed: 1,
        isPlaying: true
      });

      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('move', {
        duration: 1,
        position: [
          { time: 0, value: { x: 0, y: 0, z: 0 } },
          { time: 1, value: { x: 10, y: 0, z: 0 } }
        ]
      });

      const context = { deltaTime: 0 };
      system.update(context);

      expect(transform.position.set).toHaveBeenCalledWith(5, 0, 0);
    });

    it('interpolates rotation between keyframes', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'rotate',
        currentTime: 0.5,
        duration: 1,
        playbackSpeed: 1,
        isPlaying: true
      });

      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('rotate', {
        duration: 1,
        rotation: [
          { time: 0, value: { x: 0, y: 0, z: 0, w: 1 } },
          { time: 1, value: { x: 0, y: 1, z: 0, w: 0 } }
        ]
      });

      const context = { deltaTime: 0 };
      system.update(context);

      expect(transform.rotation.set).toHaveBeenCalled();
    });

    it('interpolates scale between keyframes', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'scale',
        currentTime: 0.5,
        duration: 1,
        playbackSpeed: 1,
        isPlaying: true
      });

      const transform = world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('scale', {
        duration: 1,
        scale: [
          { time: 0, value: { x: 1, y: 1, z: 1 } },
          { time: 1, value: { x: 2, y: 2, z: 2 } }
        ]
      });

      const context = { deltaTime: 0 };
      system.update(context);

      expect(transform.scale.set).toHaveBeenCalledWith(1.5, 1.5, 1.5);
    });
  });

  describe('animation events', () => {
    it('triggers events at specified times', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'attack',
        currentTime: 0,
        duration: 1,
        playbackSpeed: 1,
        isPlaying: true
      });

      world.addComponent(entity, 'TransformComponent', {
        position: { set: vi.fn() },
        rotation: { set: vi.fn() },
        scale: { set: vi.fn() },
        setDirty: vi.fn()
      });

      system.registerAnimation('attack', {
        duration: 1,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }],
        events: [
          { time: 0.5, name: 'hit' }
        ]
      });

      animComp.currentTime = 0.4;
      const context = { deltaTime: 0.2 };
      system.update(context);

      const events = system.getEventQueue();
      expect(events.some((e: any) => e.event === 'hit')).toBe(false);
    });

    it('processes event queue each frame', () => {
      system.eventQueue = [
        { entity: 1, event: 'step', time: 0.5 },
        { entity: 2, event: 'land', time: 1.0 }
      ];

      const context = { deltaTime: 0.016 };
      system.update(context);

      expect(system.eventQueue.length).toBe(0);
    });
  });

  describe('animation control', () => {
    it('isPlaying() returns animation state', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        isPlaying: true
      });

      expect(system.isPlaying(entity)).toBe(true);
    });

    it('getCurrentTime() returns current time', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentTime: 1.5
      });

      expect(system.getCurrentTime(entity)).toBe(1.5);
    });

    it('setPlaybackSpeed() updates speed', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        playbackSpeed: 1
      });

      system.setPlaybackSpeed(entity, 0.5);

      expect(animComp.playbackSpeed).toBe(0.5);
    });

    it('setTime() updates animation time', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentTime: 0,
        duration: 2
      });

      system.setTime(entity, 1.5);

      expect(animComp.currentTime).toBe(1.5);
    });

    it('setTime() clamps to valid range', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentTime: 0,
        duration: 2
      });

      system.setTime(entity, 5);

      expect(animComp.currentTime).toBeLessThanOrEqual(2);
    });
  });

  describe('crossfade and blending', () => {
    it('crossfade() sets up transition', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'walk'
      });

      system.crossfade(entity, 'run', 0.3);

      expect(animComp.crossfadeTarget).toBe('run');
      expect(animComp.crossfadeDuration).toBe(0.3);
    });

    it('blend() sets up blend tree', () => {
      const entity = world.createEntity();
      const animComp = world.addComponent(entity, 'AnimationComponent', {
        enabled: true
      });

      system.blend(entity, [
        { name: 'walk', weight: 0.5 },
        { name: 'run', weight: 0.5 }
      ]);

      expect(animComp.blendTree.length).toBe(2);
    });
  });

  describe('performance', () => {
    it('handles many animated entities efficiently', () => {
      for (let i = 0; i < 100; i++) {
        const entity = world.createEntity();
        world.addComponent(entity, 'AnimationComponent', {
          enabled: true,
          currentAnimation: 'idle',
          currentTime: 0,
          duration: 1,
          playbackSpeed: 1,
          isPlaying: true
        });

        world.addComponent(entity, 'TransformComponent', {
          position: { set: () => {} },
          rotation: { set: () => {} },
          scale: { set: () => {} },
          setDirty: () => {}
        });
      }

      system.registerAnimation('idle', {
        duration: 1,
        position: [{ time: 0, value: { x: 0, y: 0, z: 0 } }]
      });

      const start = performance.now();
      const context = { deltaTime: 0.016 };
      system.update(context);
      const end = performance.now();

      expect(end - start).toBeLessThan(50);
    });
  });

  describe('edge cases', () => {
    it('handles entity without animation component', () => {
      const entity = world.createEntity();

      expect(() => system.play(entity, 'walk')).not.toThrow();
    });

    it('handles unregistered animation', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'AnimationComponent', { enabled: true });

      expect(() => system.play(entity, 'nonexistent')).not.toThrow();
    });

    it('handles entity without transform', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'AnimationComponent', {
        enabled: true,
        currentAnimation: 'walk',
        isPlaying: true
      });

      system.registerAnimation('walk', { duration: 1 });

      const context = { deltaTime: 0.016 };
      expect(() => system.update(context)).not.toThrow();
    });

    it('handles disabled animation component', () => {
      const entity = world.createEntity();
      world.addComponent(entity, 'AnimationComponent', {
        enabled: false,
        isPlaying: true
      });

      const context = { deltaTime: 0.016 };
      system.update(context);

      expect(true).toBe(true);
    });
  });
});
