import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus, type EventMap } from '../../../core/EventBus';

/**
 * Comprehensive test suite for the EventBus class.
 * Tests cover event subscription, emission, unsubscription, once handlers,
 * event data passing, handler ordering, error handling, and memory leak prevention.
 *
 * Coverage target: 95%
 */
describe('EventBus', () => {
  beforeEach(() => {
    EventBus.clear();
  });

  afterEach(() => {
    EventBus.clear();
    vi.restoreAllMocks();
  });

  describe('on() subscribes to events', () => {
    it('registers event handler', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalled();
    });

    it('returns unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = EventBus.on('engine:start', handler);

      expect(typeof unsubscribe).toBe('function');

      unsubscribe();

      EventBus.emit('engine:start', undefined);
      expect(handler).not.toHaveBeenCalled();
    });

    it('allows multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);
      EventBus.on('engine:start', handler3);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('allows different events to have handlers', () => {
      const startHandler = vi.fn();
      const stopHandler = vi.fn();

      EventBus.on('engine:start', startHandler);
      EventBus.on('engine:stop', stopHandler);

      EventBus.emit('engine:start', undefined);

      expect(startHandler).toHaveBeenCalled();
      expect(stopHandler).not.toHaveBeenCalled();
    });

    it('supports priority ordering', () => {
      const order: number[] = [];

      EventBus.on('engine:start', () => order.push(1), { priority: 1 });
      EventBus.on('engine:start', () => order.push(3), { priority: 3 });
      EventBus.on('engine:start', () => order.push(2), { priority: 2 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([3, 2, 1]); // Higher priority first
    });

    it('defaults to priority 0', () => {
      const order: number[] = [];

      EventBus.on('engine:start', () => order.push(1), { priority: 0 });
      EventBus.on('engine:start', () => order.push(2)); // Default priority

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2]);
    });

    it('maintains insertion order for same priority', () => {
      const order: number[] = [];

      EventBus.on('engine:start', () => order.push(1));
      EventBus.on('engine:start', () => order.push(2));
      EventBus.on('engine:start', () => order.push(3));

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('off() unsubscribes', () => {
    it('removes specific handler', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.off('engine:start', handler);

      EventBus.emit('engine:start', undefined);

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not affect other handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);

      EventBus.off('engine:start', handler1);

      EventBus.emit('engine:start', undefined);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('handles removing non-existent handler', () => {
      const handler = vi.fn();

      expect(() => {
        EventBus.off('engine:start', handler);
      }).not.toThrow();
    });

    it('handles removing from non-existent event', () => {
      const handler = vi.fn();

      expect(() => {
        EventBus.off('engine:start' as any, handler);
      }).not.toThrow();
    });

    it('cleans up empty handler arrays', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.off('engine:start', handler);

      expect(EventBus.hasHandlers('engine:start')).toBe(false);
    });
  });

  describe('once() for single-fire handlers', () => {
    it('executes handler only once', () => {
      const handler = vi.fn();

      EventBus.once('engine:start', handler);

      EventBus.emit('engine:start', undefined);
      EventBus.emit('engine:start', undefined);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('automatically unsubscribes after firing', () => {
      const handler = vi.fn();

      EventBus.once('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(EventBus.hasHandlers('engine:start')).toBe(false);
    });

    it('can be manually unsubscribed before firing', () => {
      const handler = vi.fn();

      const unsubscribe = EventBus.once('engine:start', handler);
      unsubscribe();

      EventBus.emit('engine:start', undefined);

      expect(handler).not.toHaveBeenCalled();
    });

    it('supports priority ordering with regular handlers', () => {
      const order: number[] = [];

      EventBus.once('engine:start', () => order.push(1), { priority: 10 });
      EventBus.on('engine:start', () => order.push(2), { priority: 5 });
      EventBus.once('engine:start', () => order.push(3), { priority: 1 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2, 3]);
    });

    it('works with multiple once handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      EventBus.once('engine:start', handler1);
      EventBus.once('engine:start', handler2);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit() dispatches events', () => {
    it('calls subscribed handlers', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no handlers exist', () => {
      expect(() => {
        EventBus.emit('engine:start', undefined);
      }).not.toThrow();
    });

    it('calls handlers in priority order', () => {
      const order: number[] = [];

      EventBus.on('engine:start', () => order.push(3), { priority: -10 });
      EventBus.on('engine:start', () => order.push(1), { priority: 100 });
      EventBus.on('engine:start', () => order.push(2), { priority: 0 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2, 3]);
    });

    it('is synchronous', () => {
      let executed = false;

      EventBus.on('engine:start', () => {
        executed = true;
      });

      EventBus.emit('engine:start', undefined);

      expect(executed).toBe(true);
    });

    it('handles modifications during emit', () => {
      const handler1 = vi.fn(() => {
        EventBus.on('engine:start', handler3);
      });

      const handler2 = vi.fn();
      const handler3 = vi.fn();

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).not.toHaveBeenCalled(); // Not called in same emit

      EventBus.emit('engine:start', undefined);
      expect(handler3).toHaveBeenCalledTimes(1); // Called in next emit
    });
  });

  describe('event data passing', () => {
    it('passes data to handlers', () => {
      const handler = vi.fn();

      EventBus.on('scene:load', handler);
      EventBus.emit('scene:load', { sceneName: 'MainMenu' });

      expect(handler).toHaveBeenCalledWith({ sceneName: 'MainMenu' });
    });

    it('preserves data types', () => {
      const handler = vi.fn();

      EventBus.on('scene:load', handler);

      const data = {
        sceneName: 'Test',
        nested: {
          value: 123,
        },
      };

      EventBus.emit('scene:load', data);

      expect(handler).toHaveBeenCalledWith(data);
      expect(handler.mock.calls[0][0]).toBe(data); // Same reference
    });

    it('handles void data type', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it('passes different data to each emit', () => {
      const handler = vi.fn();

      EventBus.on('scene:load', handler);

      EventBus.emit('scene:load', { sceneName: 'Scene1' });
      EventBus.emit('scene:load', { sceneName: 'Scene2' });

      expect(handler).toHaveBeenNthCalledWith(1, { sceneName: 'Scene1' });
      expect(handler).toHaveBeenNthCalledWith(2, { sceneName: 'Scene2' });
    });

    it('handles complex data structures', () => {
      interface ComplexEvent {
        id: string;
        data: {
          values: number[];
          map: Map<string, string>;
        };
      }

      // Extend EventMap for this test
      interface TestEventMap extends EventMap {
        'test:complex': ComplexEvent;
      }

      const handler = vi.fn();

      EventBus.on('test:complex' as any, handler);

      const complexData: ComplexEvent = {
        id: 'test-id',
        data: {
          values: [1, 2, 3],
          map: new Map([['key', 'value']]),
        },
      };

      EventBus.emit('test:complex' as any, complexData);

      expect(handler).toHaveBeenCalledWith(complexData);
    });
  });

  describe('handler ordering', () => {
    it('executes high priority handlers first', () => {
      const order: string[] = [];

      EventBus.on('engine:start', () => order.push('low'), { priority: 1 });
      EventBus.on('engine:start', () => order.push('high'), { priority: 100 });
      EventBus.on('engine:start', () => order.push('medium'), { priority: 50 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual(['high', 'medium', 'low']);
    });

    it('handles negative priorities', () => {
      const order: string[] = [];

      EventBus.on('engine:start', () => order.push('zero'), { priority: 0 });
      EventBus.on('engine:start', () => order.push('negative'), { priority: -10 });
      EventBus.on('engine:start', () => order.push('positive'), { priority: 10 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual(['positive', 'zero', 'negative']);
    });

    it('preserves insertion order for equal priorities', () => {
      const order: number[] = [];

      EventBus.on('engine:start', () => order.push(1), { priority: 5 });
      EventBus.on('engine:start', () => order.push(2), { priority: 5 });
      EventBus.on('engine:start', () => order.push(3), { priority: 5 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('error handling in handlers', () => {
    it('isolates handler errors', () => {
      const handler1 = vi.fn(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);
      EventBus.on('engine:start', handler3);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('logs handler errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      EventBus.on('engine:start', () => {
        throw new Error('Test error');
      });

      EventBus.emit('engine:start', undefined);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EventBus]'),
        expect.any(Error)
      );
    });

    it('continues execution after error', () => {
      const handler2 = vi.fn();

      vi.spyOn(console, 'error').mockImplementation(() => {});

      EventBus.on('engine:start', () => {
        throw new Error('Error');
      });
      EventBus.on('engine:start', handler2);

      EventBus.emit('engine:start', undefined);

      expect(handler2).toHaveBeenCalled();
    });

    it('handles errors in once handlers', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      EventBus.once('engine:start', () => {
        throw new Error('Once handler error');
      });

      EventBus.emit('engine:start', undefined);

      expect(consoleSpy).toHaveBeenCalled();
      expect(EventBus.hasHandlers('engine:start')).toBe(false);
    });
  });

  describe('memory leak prevention', () => {
    it('warns when too many handlers registered', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 101; i++) {
        EventBus.on('engine:start', () => {});
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('memory leak')
      );
    });

    it('only warns once per threshold crossing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      for (let i = 0; i < 150; i++) {
        EventBus.on('engine:start', () => {});
      }

      expect(consoleSpy).toHaveBeenCalledTimes(1);
    });

    it('removes handlers properly to prevent leaks', () => {
      const handlers: Array<() => void> = [];

      for (let i = 0; i < 100; i++) {
        const handler = () => {};
        handlers.push(handler);
        EventBus.on('engine:start', handler);
      }

      expect(EventBus.getHandlerCount('engine:start')).toBe(100);

      for (const handler of handlers) {
        EventBus.off('engine:start', handler);
      }

      expect(EventBus.getHandlerCount('engine:start')).toBe(0);
    });

    it('cleans up once handlers automatically', () => {
      for (let i = 0; i < 100; i++) {
        EventBus.once('engine:start', () => {});
      }

      expect(EventBus.getHandlerCount('engine:start')).toBe(100);

      EventBus.emit('engine:start', undefined);

      expect(EventBus.getHandlerCount('engine:start')).toBe(0);
    });
  });

  describe('wildcard subscriptions', () => {
    it('receives all events', () => {
      const wildcardHandler = vi.fn();

      EventBus.on('*' as any, wildcardHandler);

      EventBus.emit('engine:start', undefined);
      EventBus.emit('engine:stop', undefined);
      EventBus.emit('scene:load', { sceneName: 'Test' });

      expect(wildcardHandler).toHaveBeenCalledTimes(3);
    });

    it('receives event name and data', () => {
      const wildcardHandler = vi.fn();

      EventBus.on('*' as any, wildcardHandler);

      EventBus.emit('scene:load', { sceneName: 'Test' });

      expect(wildcardHandler).toHaveBeenCalledWith('scene:load', { sceneName: 'Test' });
    });

    it('can be unsubscribed', () => {
      const wildcardHandler = vi.fn();

      const unsubscribe = EventBus.on('*' as any, wildcardHandler);
      unsubscribe();

      EventBus.emit('engine:start', undefined);

      expect(wildcardHandler).not.toHaveBeenCalled();
    });

    it('respects priority ordering', () => {
      const order: number[] = [];

      EventBus.on('*' as any, () => order.push(1), { priority: 10 });
      EventBus.on('*' as any, () => order.push(2), { priority: 5 });

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual([1, 2]);
    });

    it('executes before specific handlers', () => {
      const order: string[] = [];

      EventBus.on('*' as any, () => order.push('wildcard'));
      EventBus.on('engine:start', () => order.push('specific'));

      EventBus.emit('engine:start', undefined);

      expect(order).toEqual(['wildcard', 'specific']);
    });

    it('handles errors in wildcard handlers', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const specificHandler = vi.fn();

      EventBus.on('*' as any, () => {
        throw new Error('Wildcard error');
      });
      EventBus.on('engine:start', specificHandler);

      EventBus.emit('engine:start', undefined);

      expect(consoleSpy).toHaveBeenCalled();
      expect(specificHandler).toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('getHandlerCount returns correct count', () => {
      expect(EventBus.getHandlerCount('engine:start')).toBe(0);

      EventBus.on('engine:start', () => {});
      expect(EventBus.getHandlerCount('engine:start')).toBe(1);

      EventBus.on('engine:start', () => {});
      expect(EventBus.getHandlerCount('engine:start')).toBe(2);
    });

    it('hasHandlers checks for handlers', () => {
      expect(EventBus.hasHandlers('engine:start')).toBe(false);

      EventBus.on('engine:start', () => {});

      expect(EventBus.hasHandlers('engine:start')).toBe(true);
    });

    it('getEventNames returns registered events', () => {
      expect(EventBus.getEventNames()).toEqual([]);

      EventBus.on('engine:start', () => {});
      EventBus.on('engine:stop', () => {});

      const names = EventBus.getEventNames();
      expect(names).toContain('engine:start');
      expect(names).toContain('engine:stop');
    });

    it('getWildcardHandlerCount returns count', () => {
      expect(EventBus.getWildcardHandlerCount()).toBe(0);

      EventBus.on('*' as any, () => {});
      expect(EventBus.getWildcardHandlerCount()).toBe(1);

      EventBus.on('*' as any, () => {});
      expect(EventBus.getWildcardHandlerCount()).toBe(2);
    });

    it('clear() removes all handlers', () => {
      EventBus.on('engine:start', () => {});
      EventBus.on('engine:stop', () => {});
      EventBus.on('*' as any, () => {});

      EventBus.clear();

      expect(EventBus.getHandlerCount('engine:start')).toBe(0);
      expect(EventBus.getHandlerCount('engine:stop')).toBe(0);
      expect(EventBus.getWildcardHandlerCount()).toBe(0);
      expect(EventBus.getEventNames()).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles same handler registered multiple times', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.on('engine:start', handler);

      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('handles removing handler registered multiple times', () => {
      const handler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.on('engine:start', handler);

      EventBus.off('engine:start', handler);

      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('handles rapid subscribe/unsubscribe', () => {
      const handler = vi.fn();

      for (let i = 0; i < 100; i++) {
        const unsub = EventBus.on('engine:start', handler);
        unsub();
      }

      EventBus.emit('engine:start', undefined);

      expect(handler).not.toHaveBeenCalled();
    });

    it('handles emitting during subscription', () => {
      const handler = vi.fn(() => {
        EventBus.emit('engine:stop', undefined);
      });

      const stopHandler = vi.fn();

      EventBus.on('engine:start', handler);
      EventBus.on('engine:stop', stopHandler);

      EventBus.emit('engine:start', undefined);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(stopHandler).toHaveBeenCalledTimes(1);
    });

    it('handles unsubscribing during emit', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn(() => {
        EventBus.off('engine:start', handler1);
      });

      EventBus.on('engine:start', handler1);
      EventBus.on('engine:start', handler2);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      EventBus.emit('engine:start', undefined);

      expect(handler1).toHaveBeenCalledTimes(1); // Not called second time
    });
  });
});
