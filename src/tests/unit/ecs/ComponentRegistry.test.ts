import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ComponentRegistry,
  IComponent,
  ComponentType,
  ComponentSchema,
  ComponentFieldType
} from '../../../ecs/ComponentRegistry';

// Test components
class Position implements IComponent {
  x: number = 0;
  y: number = 0;
  z: number = 0;
}

class Velocity implements IComponent {
  vx: number = 0;
  vy: number = 0;
  vz: number = 0;
}

class Health implements IComponent {
  current: number = 100;
  max: number = 100;
}

class Tag implements IComponent {
  name: string = '';
}

class WithLifecycle implements IComponent {
  attachedTo: number | null = null;
  detachedFrom: number | null = null;

  onAttach(entity: number): void {
    this.attachedTo = entity;
  }

  onDetach(entity: number): void {
    this.detachedFrom = entity;
  }
}

class WithReset implements IComponent {
  value: number = 10;
  resetCalled: boolean = false;

  reset(): void {
    this.value = 10;
    this.resetCalled = true;
  }
}

class WithSerialization implements IComponent {
  data: string = 'test';

  serialize(): object {
    return { data: this.data };
  }

  deserialize(data: any): void {
    this.data = data.data;
  }
}

describe('ComponentRegistry', () => {
  beforeEach(() => {
    ComponentRegistry.reset();
  });

  afterEach(() => {
    ComponentRegistry.reset();
  });

  describe('register()', () => {
    it('registers component and returns ID', () => {
      const id = ComponentRegistry.register(Position);
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThan(1024);
    });

    it('assigns sequential IDs', () => {
      const id1 = ComponentRegistry.register(Position);
      const id2 = ComponentRegistry.register(Velocity);
      const id3 = ComponentRegistry.register(Health);

      expect(id2).toBe(id1 + 1);
      expect(id3).toBe(id2 + 1);
    });

    it('stores component metadata', () => {
      const id = ComponentRegistry.register(Position);
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata).toBeDefined();
      expect(metadata!.id).toBe(id);
      expect(metadata!.name).toBe('Position');
      expect(metadata!.type).toBe(Position);
    });

    it('accepts custom name', () => {
      const id = ComponentRegistry.register(Position, { name: 'CustomPosition' });
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata!.name).toBe('CustomPosition');
    });

    it('accepts schema', () => {
      const schema: ComponentSchema = {
        fields: [
          { name: 'x', type: 'f32' },
          { name: 'y', type: 'f32' },
          { name: 'z', type: 'f32' }
        ]
      };

      const id = ComponentRegistry.register(Position, { schema });
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata!.schema).toBeDefined();
      expect(metadata!.schema!.fields.length).toBe(3);
    });

    it('accepts poolSize option', () => {
      const id = ComponentRegistry.register(Position, { poolSize: 1000 });
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata!.poolSize).toBe(1000);
    });

    it('throws if component already registered', () => {
      ComponentRegistry.register(Position);
      expect(() => ComponentRegistry.register(Position)).toThrow(/already registered/i);
    });

    it('throws if name collision occurs', () => {
      ComponentRegistry.register(Position, { name: 'MyComponent' });
      expect(() => ComponentRegistry.register(Velocity, { name: 'MyComponent' })).toThrow(/name .* already registered/i);
    });

    it('throws when max components exceeded', () => {
      for (let i = 0; i < 1023; i++) {
        class DynamicComponent implements IComponent {}
        Object.defineProperty(DynamicComponent, 'name', { value: `Component${i}` });
        ComponentRegistry.register(DynamicComponent);
      }

      class OneMore implements IComponent {}
      expect(() => ComponentRegistry.register(OneMore)).toThrow(/maximum number.*exceeded/i);
    });
  });

  describe('component decorator', () => {
    it('registers component at definition time', () => {
      @ComponentRegistry.component({ name: 'DecoratedComponent' })
      class DecoratedComponent implements IComponent {
        value: number = 0;
      }

      expect(ComponentRegistry.isRegistered(DecoratedComponent)).toBe(true);
    });

    it('applies registration options', () => {
      const schema: ComponentSchema = {
        fields: [{ name: 'value', type: 'f32' }]
      };

      @ComponentRegistry.component({ name: 'MyComponent', schema, poolSize: 500 })
      class MyComponent implements IComponent {
        value: number = 0;
      }

      const id = ComponentRegistry.getId(MyComponent);
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata!.name).toBe('MyComponent');
      expect(metadata!.schema).toBeDefined();
      expect(metadata!.poolSize).toBe(500);
    });
  });

  describe('getId()', () => {
    it('returns component ID', () => {
      const id = ComponentRegistry.register(Position);
      expect(ComponentRegistry.getId(Position)).toBe(id);
    });

    it('throws for unregistered component', () => {
      expect(() => ComponentRegistry.getId(Position)).toThrow(/not registered/i);
    });
  });

  describe('getType()', () => {
    it('returns component type for valid ID', () => {
      const id = ComponentRegistry.register(Position);
      expect(ComponentRegistry.getType(id)).toBe(Position);
    });

    it('returns undefined for invalid ID', () => {
      expect(ComponentRegistry.getType(999)).toBeUndefined();
    });
  });

  describe('getMetadata()', () => {
    it('returns metadata for valid ID', () => {
      const id = ComponentRegistry.register(Position, { poolSize: 100 });
      const metadata = ComponentRegistry.getMetadata(id);

      expect(metadata).toBeDefined();
      expect(metadata!.id).toBe(id);
      expect(metadata!.name).toBe('Position');
      expect(metadata!.type).toBe(Position);
      expect(metadata!.poolSize).toBe(100);
    });

    it('returns undefined for invalid ID', () => {
      expect(ComponentRegistry.getMetadata(999)).toBeUndefined();
    });
  });

  describe('getMetadataByName()', () => {
    it('returns metadata for registered name', () => {
      ComponentRegistry.register(Position);
      const metadata = ComponentRegistry.getMetadataByName('Position');

      expect(metadata).toBeDefined();
      expect(metadata!.name).toBe('Position');
    });

    it('returns metadata for custom name', () => {
      ComponentRegistry.register(Position, { name: 'CustomName' });
      const metadata = ComponentRegistry.getMetadataByName('CustomName');

      expect(metadata).toBeDefined();
      expect(metadata!.type).toBe(Position);
    });

    it('returns undefined for unknown name', () => {
      expect(ComponentRegistry.getMetadataByName('Unknown')).toBeUndefined();
    });
  });

  describe('isRegistered()', () => {
    it('returns true for registered component', () => {
      ComponentRegistry.register(Position);
      expect(ComponentRegistry.isRegistered(Position)).toBe(true);
    });

    it('returns false for unregistered component', () => {
      expect(ComponentRegistry.isRegistered(Position)).toBe(false);
    });

    it('returns false after reset', () => {
      ComponentRegistry.register(Position);
      ComponentRegistry.reset();
      expect(ComponentRegistry.isRegistered(Position)).toBe(false);
    });
  });

  describe('getRegisteredCount()', () => {
    it('returns zero initially', () => {
      expect(ComponentRegistry.getRegisteredCount()).toBe(0);
    });

    it('increments with each registration', () => {
      ComponentRegistry.register(Position);
      expect(ComponentRegistry.getRegisteredCount()).toBe(1);

      ComponentRegistry.register(Velocity);
      expect(ComponentRegistry.getRegisteredCount()).toBe(2);

      ComponentRegistry.register(Health);
      expect(ComponentRegistry.getRegisteredCount()).toBe(3);
    });

    it('resets to zero after reset()', () => {
      ComponentRegistry.register(Position);
      ComponentRegistry.register(Velocity);

      ComponentRegistry.reset();
      expect(ComponentRegistry.getRegisteredCount()).toBe(0);
    });
  });

  describe('getAllMetadata()', () => {
    it('returns empty array initially', () => {
      const all = ComponentRegistry.getAllMetadata();
      expect(all).toHaveLength(0);
    });

    it('returns all registered components', () => {
      ComponentRegistry.register(Position);
      ComponentRegistry.register(Velocity);
      ComponentRegistry.register(Health);

      const all = ComponentRegistry.getAllMetadata();
      expect(all).toHaveLength(3);

      const names = all.map(m => m.name);
      expect(names).toContain('Position');
      expect(names).toContain('Velocity');
      expect(names).toContain('Health');
    });
  });

  describe('create()', () => {
    it('creates instance of registered component', () => {
      ComponentRegistry.register(Position);
      const instance = ComponentRegistry.create(Position);

      expect(instance).toBeInstanceOf(Position);
      expect(instance.x).toBe(0);
      expect(instance.y).toBe(0);
      expect(instance.z).toBe(0);
    });

    it('throws for unregistered component', () => {
      expect(() => ComponentRegistry.create(Position)).toThrow(/not registered/i);
    });

    it('creates new instance each time', () => {
      ComponentRegistry.register(Position);
      const instance1 = ComponentRegistry.create(Position);
      const instance2 = ComponentRegistry.create(Position);

      expect(instance1).not.toBe(instance2);
      instance1.x = 10;
      expect(instance2.x).toBe(0);
    });
  });

  describe('createById()', () => {
    it('creates instance from component ID', () => {
      const id = ComponentRegistry.register(Position);
      const instance = ComponentRegistry.createById(id);

      expect(instance).toBeInstanceOf(Position);
    });

    it('returns undefined for invalid ID', () => {
      expect(ComponentRegistry.createById(999)).toBeUndefined();
    });
  });

  describe('getSchema()', () => {
    it('returns schema if defined', () => {
      const schema: ComponentSchema = {
        fields: [
          { name: 'x', type: 'f32' },
          { name: 'y', type: 'f32' }
        ]
      };

      const id = ComponentRegistry.register(Position, { schema });
      const retrieved = ComponentRegistry.getSchema(id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.fields.length).toBe(2);
    });

    it('returns undefined if no schema', () => {
      const id = ComponentRegistry.register(Position);
      expect(ComponentRegistry.getSchema(id)).toBeUndefined();
    });

    it('returns undefined for invalid ID', () => {
      expect(ComponentRegistry.getSchema(999)).toBeUndefined();
    });
  });

  describe('getFieldSize()', () => {
    it('returns correct size for 1-byte types', () => {
      expect(ComponentRegistry.getFieldSize('i8')).toBe(1);
      expect(ComponentRegistry.getFieldSize('u8')).toBe(1);
      expect(ComponentRegistry.getFieldSize('bool')).toBe(1);
    });

    it('returns correct size for 2-byte types', () => {
      expect(ComponentRegistry.getFieldSize('i16')).toBe(2);
      expect(ComponentRegistry.getFieldSize('u16')).toBe(2);
    });

    it('returns correct size for 4-byte types', () => {
      expect(ComponentRegistry.getFieldSize('f32')).toBe(4);
      expect(ComponentRegistry.getFieldSize('i32')).toBe(4);
      expect(ComponentRegistry.getFieldSize('u32')).toBe(4);
      expect(ComponentRegistry.getFieldSize('entity')).toBe(4);
    });

    it('returns correct size for 8-byte types', () => {
      expect(ComponentRegistry.getFieldSize('f64')).toBe(8);
      expect(ComponentRegistry.getFieldSize('vec2')).toBe(8);
    });

    it('returns correct size for vector types', () => {
      expect(ComponentRegistry.getFieldSize('vec3')).toBe(12);
      expect(ComponentRegistry.getFieldSize('vec4')).toBe(16);
      expect(ComponentRegistry.getFieldSize('quat')).toBe(16);
    });

    it('returns correct size for matrix types', () => {
      expect(ComponentRegistry.getFieldSize('mat3')).toBe(36);
      expect(ComponentRegistry.getFieldSize('mat4')).toBe(64);
    });

    it('returns pointer size for reference types', () => {
      const stringSize = ComponentRegistry.getFieldSize('string');
      const refSize = ComponentRegistry.getFieldSize('ref');

      expect(stringSize).toBeGreaterThan(0);
      expect(refSize).toBeGreaterThan(0);
      expect(stringSize).toBe(refSize);
    });

    it('throws for unknown field type', () => {
      expect(() => ComponentRegistry.getFieldSize('unknown' as ComponentFieldType)).toThrow(/unknown field type/i);
    });
  });

  describe('schema processing', () => {
    it('computes field offsets', () => {
      const schema: ComponentSchema = {
        fields: [
          { name: 'a', type: 'f32' },
          { name: 'b', type: 'f32' },
          { name: 'c', type: 'f32' }
        ]
      };

      const id = ComponentRegistry.register(Position, { schema });
      const processed = ComponentRegistry.getSchema(id);

      expect(processed!.fields[0].offset).toBe(0);
      expect(processed!.fields[1].offset).toBe(4);
      expect(processed!.fields[2].offset).toBe(8);
    });

    it('computes total size with alignment', () => {
      const schema: ComponentSchema = {
        fields: [
          { name: 'x', type: 'f32' },
          { name: 'y', type: 'f32' },
          { name: 'z', type: 'f32' }
        ]
      };

      const id = ComponentRegistry.register(Position, { schema });
      const processed = ComponentRegistry.getSchema(id);

      expect(processed!.totalSize).toBeGreaterThanOrEqual(12);
      expect(processed!.totalSize! % 8).toBe(0);
    });

    it('aligns fields correctly', () => {
      const schema: ComponentSchema = {
        fields: [
          { name: 'byte', type: 'u8' },
          { name: 'float', type: 'f32' }
        ]
      };

      const id = ComponentRegistry.register(Health, { schema });
      const processed = ComponentRegistry.getSchema(id);

      expect(processed!.fields[1].offset! % 4).toBe(0);
    });
  });

  describe('reset()', () => {
    it('clears all registered components', () => {
      ComponentRegistry.register(Position);
      ComponentRegistry.register(Velocity);
      ComponentRegistry.register(Health);

      ComponentRegistry.reset();

      expect(ComponentRegistry.getRegisteredCount()).toBe(0);
      expect(ComponentRegistry.isRegistered(Position)).toBe(false);
      expect(ComponentRegistry.isRegistered(Velocity)).toBe(false);
    });

    it('allows re-registration after reset', () => {
      const id1 = ComponentRegistry.register(Position);
      ComponentRegistry.reset();
      const id2 = ComponentRegistry.register(Position);

      expect(id2).toBe(id1);
    });

    it('clears metadata mappings', () => {
      const id = ComponentRegistry.register(Position, { name: 'MyPos' });
      ComponentRegistry.reset();

      expect(ComponentRegistry.getMetadata(id)).toBeUndefined();
      expect(ComponentRegistry.getMetadataByName('MyPos')).toBeUndefined();
    });
  });

  describe('lifecycle hooks', () => {
    it('component supports onAttach', () => {
      const component = new WithLifecycle();
      component.onAttach!(42);

      expect(component.attachedTo).toBe(42);
    });

    it('component supports onDetach', () => {
      const component = new WithLifecycle();
      component.onDetach!(42);

      expect(component.detachedFrom).toBe(42);
    });

    it('component supports reset', () => {
      const component = new WithReset();
      component.value = 999;
      component.reset!();

      expect(component.value).toBe(10);
      expect(component.resetCalled).toBe(true);
    });

    it('component supports serialization', () => {
      const component = new WithSerialization();
      component.data = 'custom';

      const serialized = component.serialize!();
      expect(serialized).toEqual({ data: 'custom' });
    });

    it('component supports deserialization', () => {
      const component = new WithSerialization();
      component.deserialize!({ data: 'restored' });

      expect(component.data).toBe('restored');
    });
  });

  describe('edge cases', () => {
    it('handles components with no default constructor', () => {
      class NoDefault implements IComponent {
        constructor(public value: number) {}
      }

      const id = ComponentRegistry.register(NoDefault);
      expect(() => ComponentRegistry.createById(id)).toThrow();
    });

    it('preserves component type identity', () => {
      ComponentRegistry.register(Position);
      const id = ComponentRegistry.getId(Position);
      const type = ComponentRegistry.getType(id);

      expect(type).toBe(Position);
      expect(new type!()).toBeInstanceOf(Position);
    });

    it('handles empty schema', () => {
      const schema: ComponentSchema = { fields: [] };
      const id = ComponentRegistry.register(Tag, { schema });
      const retrieved = ComponentRegistry.getSchema(id);

      expect(retrieved!.fields).toHaveLength(0);
      expect(retrieved!.totalSize).toBe(0);
    });
  });
});
