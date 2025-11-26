import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Panic, PanicError } from '../Panic';
import { Logger } from '../Logger';

describe('PanicError', () => {
  it('should create a PanicError with correct properties', () => {
    const message = 'Test error message';
    const context = 'TestContext';

    const error = new PanicError(message, context);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PanicError);
    expect(error.message).toBe(message);
    expect(error.context).toBe(context);
    expect(error.name).toBe('PanicError');
    expect(error.timestamp).toBeGreaterThan(0);
    expect(error.stack).toBeDefined();
  });

  it('should capture stack trace', () => {
    const error = new PanicError('Test', 'Context');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('PanicError');
  });

  it('should have unique timestamps for different errors', () => {
    const error1 = new PanicError('Test 1', 'Context');
    const error2 = new PanicError('Test 2', 'Context');

    expect(error2.timestamp).toBeGreaterThanOrEqual(error1.timestamp);
  });
});

describe('Panic', () => {
  beforeEach(() => {
    Panic.resetHandler();
    Panic.clearLastPanic();
    Logger.reset();
  });

  afterEach(() => {
    Panic.resetHandler();
    Panic.clearLastPanic();
    Logger.reset();
  });

  describe('panic', () => {
    it('should throw PanicError', () => {
      expect(() => {
        Panic.panic('Test panic');
      }).toThrow(PanicError);
    });

    it('should throw error with correct message', () => {
      expect(() => {
        Panic.panic('Test panic message');
      }).toThrow('Test panic message');
    });

    it('should use provided context', () => {
      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
        if (error instanceof PanicError) {
          expect(error.context).toBe('TestContext');
        }
      }
    });

    it('should default to "Unknown" context if not provided', () => {
      try {
        Panic.panic('Test panic');
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
        if (error instanceof PanicError) {
          expect(error.context).toBe('Unknown');
        }
      }
    });

    it('should store last panic info', () => {
      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        const lastPanic = Panic.getLastPanic();
        expect(lastPanic).not.toBeNull();
        expect(lastPanic?.error.message).toBe('Test panic');
        expect(lastPanic?.context).toBe('TestContext');
        expect(lastPanic?.timestamp).toBeGreaterThan(0);
      }
    });

    it('should log fatal error', () => {
      const fatalSpy = vi.spyOn(Logger, 'fatal');

      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        // Expected to throw
      }

      expect(fatalSpy).toHaveBeenCalledWith(
        'Panic',
        '[TestContext] Test panic',
        expect.objectContaining({
          context: 'TestContext',
          error: 'Test panic',
        })
      );

      fatalSpy.mockRestore();
    });

    it('should never return normally', () => {
      let returned = false;
      try {
        Panic.panic('Test panic');
        returned = true;
      } catch (error) {
        // Expected
      }

      expect(returned).toBe(false);
    });
  });

  describe('panicIf', () => {
    it('should panic when condition is true', () => {
      expect(() => {
        Panic.panicIf(true, 'Condition was true');
      }).toThrow(PanicError);
    });

    it('should not panic when condition is false', () => {
      expect(() => {
        Panic.panicIf(false, 'Condition was false');
      }).not.toThrow();
    });

    it('should pass message and context to panic', () => {
      try {
        Panic.panicIf(true, 'Test message', 'TestContext');
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
        if (error instanceof PanicError) {
          expect(error.message).toBe('Test message');
          expect(error.context).toBe('TestContext');
        }
      }
    });

    it('should use default context if not provided', () => {
      try {
        Panic.panicIf(true, 'Test message');
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
        if (error instanceof PanicError) {
          expect(error.context).toBe('Unknown');
        }
      }
    });

    it('should work with complex conditions', () => {
      const value = null;
      expect(() => {
        Panic.panicIf(value === null, 'Value is null', 'Validation');
      }).toThrow(PanicError);

      const array: number[] = [];
      expect(() => {
        Panic.panicIf(array.length === 0, 'Array is empty', 'Validation');
      }).toThrow(PanicError);
    });

    it('should not execute when condition is false', () => {
      const fatalSpy = vi.spyOn(Logger, 'fatal');

      Panic.panicIf(false, 'Should not panic');

      expect(fatalSpy).not.toHaveBeenCalled();
      expect(Panic.getLastPanic()).toBeNull();

      fatalSpy.mockRestore();
    });
  });

  describe('setCustomHandler', () => {
    it('should replace default handler', () => {
      const customHandler = vi.fn((error: Error, context: string) => {
        throw error;
      });

      Panic.setCustomHandler(customHandler);

      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        // Expected
      }

      expect(customHandler).toHaveBeenCalledWith(
        expect.any(PanicError),
        'TestContext'
      );
    });

    it('should pass correct error to custom handler', () => {
      let capturedError: Error | null = null;
      let capturedContext: string | null = null;

      Panic.setCustomHandler((error: Error, context: string) => {
        capturedError = error;
        capturedContext = context;
        throw error;
      });

      try {
        Panic.panic('Custom test', 'CustomContext');
      } catch (error) {
        // Expected
      }

      expect(capturedError).toBeInstanceOf(PanicError);
      expect((capturedError as PanicError).message).toBe('Custom test');
      expect(capturedContext).toBe('CustomContext');
    });

    it('should not call default handler after custom handler is set', () => {
      const fatalSpy = vi.spyOn(Logger, 'fatal');

      Panic.setCustomHandler((error: Error) => {
        throw error;
      });

      try {
        Panic.panic('Test panic');
      } catch (error) {
        // Expected
      }

      expect(fatalSpy).not.toHaveBeenCalled();

      fatalSpy.mockRestore();
    });

    it('should allow multiple handler replacements', () => {
      const handler1 = vi.fn((error: Error) => { throw error; });
      const handler2 = vi.fn((error: Error) => { throw error; });

      Panic.setCustomHandler(handler1);
      try {
        Panic.panic('Test 1');
      } catch (error) {
        // Expected
      }

      Panic.setCustomHandler(handler2);
      try {
        Panic.panic('Test 2');
      } catch (error) {
        // Expected
      }

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetHandler', () => {
    it('should restore default handler', () => {
      const fatalSpy = vi.spyOn(Logger, 'fatal');

      const customHandler = vi.fn((error: Error) => { throw error; });
      Panic.setCustomHandler(customHandler);

      Panic.resetHandler();

      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        // Expected
      }

      expect(customHandler).not.toHaveBeenCalled();
      expect(fatalSpy).toHaveBeenCalled();

      fatalSpy.mockRestore();
    });

    it('should work multiple times', () => {
      const fatalSpy = vi.spyOn(Logger, 'fatal');

      Panic.setCustomHandler(vi.fn((error: Error) => { throw error; }));
      Panic.resetHandler();
      Panic.resetHandler();

      try {
        Panic.panic('Test panic');
      } catch (error) {
        // Expected
      }

      expect(fatalSpy).toHaveBeenCalled();

      fatalSpy.mockRestore();
    });
  });

  describe('getLastPanic', () => {
    it('should return null initially', () => {
      expect(Panic.getLastPanic()).toBeNull();
    });

    it('should return last panic info after panic', () => {
      try {
        Panic.panic('Test panic', 'TestContext');
      } catch (error) {
        // Expected
      }

      const lastPanic = Panic.getLastPanic();
      expect(lastPanic).not.toBeNull();
      expect(lastPanic?.error.message).toBe('Test panic');
      expect(lastPanic?.context).toBe('TestContext');
    });

    it('should update with each panic', () => {
      try {
        Panic.panic('First panic', 'Context1');
      } catch (error) {
        // Expected
      }

      try {
        Panic.panic('Second panic', 'Context2');
      } catch (error) {
        // Expected
      }

      const lastPanic = Panic.getLastPanic();
      expect(lastPanic?.error.message).toBe('Second panic');
      expect(lastPanic?.context).toBe('Context2');
    });

    it('should include timestamp', () => {
      const beforeTime = Date.now();

      try {
        Panic.panic('Test panic');
      } catch (error) {
        // Expected
      }

      const afterTime = Date.now();
      const lastPanic = Panic.getLastPanic();

      expect(lastPanic?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(lastPanic?.timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('clearLastPanic', () => {
    it('should clear stored panic info', () => {
      try {
        Panic.panic('Test panic');
      } catch (error) {
        // Expected
      }

      expect(Panic.getLastPanic()).not.toBeNull();

      Panic.clearLastPanic();

      expect(Panic.getLastPanic()).toBeNull();
    });

    it('should work when no panic has occurred', () => {
      expect(() => {
        Panic.clearLastPanic();
      }).not.toThrow();

      expect(Panic.getLastPanic()).toBeNull();
    });

    it('should work multiple times', () => {
      try {
        Panic.panic('Test panic');
      } catch (error) {
        // Expected
      }

      Panic.clearLastPanic();
      Panic.clearLastPanic();

      expect(Panic.getLastPanic()).toBeNull();
    });
  });

  describe('integration tests', () => {
    it('should handle panic in custom handler that logs and rethrows', () => {
      const loggedErrors: string[] = [];

      Panic.setCustomHandler((error: Error, context: string) => {
        loggedErrors.push(`[${context}] ${error.message}`);
        throw error;
      });

      try {
        Panic.panic('Integration test', 'IntegrationContext');
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
      }

      expect(loggedErrors).toContain('[IntegrationContext] Integration test');
      expect(Panic.getLastPanic()?.error.message).toBe('Integration test');
    });

    it('should support crash reporting workflow', () => {
      interface CrashReport {
        message: string;
        context: string;
        stack?: string;
        timestamp: number;
      }

      const crashReports: CrashReport[] = [];

      Panic.setCustomHandler((error: Error, context: string) => {
        crashReports.push({
          message: error.message,
          context,
          stack: error.stack,
          timestamp: Date.now(),
        });
        throw error;
      });

      try {
        Panic.panic('Critical failure', 'Renderer');
      } catch (error) {
        // Expected
      }

      expect(crashReports).toHaveLength(1);
      expect(crashReports[0].message).toBe('Critical failure');
      expect(crashReports[0].context).toBe('Renderer');
      expect(crashReports[0].stack).toBeDefined();
    });

    it('should support guard clause patterns', () => {
      function initializeDevice(device: unknown): void {
        Panic.panicIf(device === null || device === undefined, 'Device must not be null', 'Graphics');
      }

      expect(() => {
        initializeDevice(null);
      }).toThrow(PanicError);

      expect(() => {
        initializeDevice(undefined);
      }).toThrow(PanicError);

      expect(() => {
        initializeDevice({ valid: true });
      }).not.toThrow();
    });

    it('should preserve stack traces through handler', () => {
      let capturedStack: string | undefined;

      Panic.setCustomHandler((error: Error) => {
        capturedStack = error.stack;
        throw error;
      });

      try {
        Panic.panic('Stack test');
      } catch (error) {
        // Expected
      }

      expect(capturedStack).toBeDefined();
      expect(capturedStack).toContain('PanicError');
    });
  });

  describe('edge cases', () => {
    it('should handle empty message', () => {
      expect(() => {
        Panic.panic('');
      }).toThrow(PanicError);

      const lastPanic = Panic.getLastPanic();
      expect(lastPanic?.error.message).toBe('');
    });

    it('should handle very long messages', () => {
      const longMessage = 'x'.repeat(10000);

      expect(() => {
        Panic.panic(longMessage);
      }).toThrow(PanicError);

      const lastPanic = Panic.getLastPanic();
      expect(lastPanic?.error.message).toBe(longMessage);
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Error: \n\t"Special" <characters> & symbols';

      expect(() => {
        Panic.panic(specialMessage);
      }).toThrow(PanicError);

      const lastPanic = Panic.getLastPanic();
      expect(lastPanic?.error.message).toBe(specialMessage);
    });

    it('should handle special characters in context', () => {
      const specialContext = 'Context/With\\Special:Characters';

      try {
        Panic.panic('Test', specialContext);
      } catch (error) {
        expect(error).toBeInstanceOf(PanicError);
        if (error instanceof PanicError) {
          expect(error.context).toBe(specialContext);
        }
      }
    });

    it('should handle handler that does not throw', () => {
      Panic.setCustomHandler(() => {
        // Handler that returns normally (anti-pattern but should be handled)
      });

      expect(() => {
        Panic.panic('Test panic');
      }).toThrow(PanicError);
    });
  });
});
