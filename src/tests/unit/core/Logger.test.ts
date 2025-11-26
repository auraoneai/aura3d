import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Logger,
  LogLevel,
  ConsoleSink,
  ArraySink,
  type LogEntry,
  type LogSink,
} from '../../../core/Logger';

/**
 * Comprehensive test suite for the Logger system.
 * Tests cover log levels, filtering, custom formatters, log targets,
 * scoped loggers, and performance logging.
 *
 * Coverage target: 95%
 */
describe('Logger', () => {
  beforeEach(() => {
    Logger.reset();
  });

  afterEach(() => {
    Logger.reset();
    vi.restoreAllMocks();
  });

  describe('log levels', () => {
    it('logs trace messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.TRACE);

      Logger.trace('Test', 'Trace message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.TRACE);
      expect(sink.entries[0].message).toBe('Trace message');
    });

    it('logs debug messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.DEBUG);

      Logger.debug('Test', 'Debug message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.DEBUG);
    });

    it('logs info messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Info message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.INFO);
    });

    it('logs warn messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.warn('Test', 'Warning message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.WARN);
    });

    it('logs error messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.error('Test', 'Error message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.ERROR);
    });

    it('logs fatal messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.fatal('Test', 'Fatal message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].level).toBe(LogLevel.FATAL);
    });

    it('captures stack trace for error level', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.error('Test', 'Error message');

      expect(sink.entries[0].stack).toBeDefined();
      expect(sink.entries[0].stack).toContain('Error');
    });

    it('captures stack trace for fatal level', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.fatal('Test', 'Fatal message');

      expect(sink.entries[0].stack).toBeDefined();
    });

    it('does not capture stack for lower levels', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Info message');
      Logger.warn('Test', 'Warning message');

      expect(sink.entries[0].stack).toBeUndefined();
      expect(sink.entries[1].stack).toBeUndefined();
    });
  });

  describe('filtering by level', () => {
    it('filters messages below global level', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.WARN);

      Logger.trace('Test', 'Should not appear');
      Logger.debug('Test', 'Should not appear');
      Logger.info('Test', 'Should not appear');
      Logger.warn('Test', 'Should appear');
      Logger.error('Test', 'Should appear');

      expect(sink.entries).toHaveLength(2);
      expect(sink.entries[0].level).toBe(LogLevel.WARN);
      expect(sink.entries[1].level).toBe(LogLevel.ERROR);
    });

    it('filters by category level', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.setLevel('CategoryA', LogLevel.ERROR);
      Logger.setLevel('CategoryB', LogLevel.DEBUG);

      Logger.info('CategoryA', 'Should not appear');
      Logger.info('CategoryB', 'Should appear');
      Logger.error('CategoryA', 'Should appear');

      expect(sink.entries).toHaveLength(2);
    });

    it('category level overrides global level', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.setGlobalLevel(LogLevel.ERROR);
      Logger.setLevel('Special', LogLevel.DEBUG);

      Logger.debug('Normal', 'Should not appear');
      Logger.debug('Special', 'Should appear');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].category).toBe('Special');
    });

    it('allows all levels when set to TRACE', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.TRACE);

      Logger.trace('Test', 'Message 1');
      Logger.debug('Test', 'Message 2');
      Logger.info('Test', 'Message 3');
      Logger.warn('Test', 'Message 4');
      Logger.error('Test', 'Message 5');
      Logger.fatal('Test', 'Message 6');

      expect(sink.entries).toHaveLength(6);
    });

    it('blocks all but fatal when set to FATAL', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.FATAL);

      Logger.trace('Test', 'Should not appear');
      Logger.debug('Test', 'Should not appear');
      Logger.info('Test', 'Should not appear');
      Logger.warn('Test', 'Should not appear');
      Logger.error('Test', 'Should not appear');
      Logger.fatal('Test', 'Should appear');

      expect(sink.entries).toHaveLength(1);
    });
  });

  describe('log sinks', () => {
    it('sends logs to multiple sinks', () => {
      const sink1 = new ArraySink();
      const sink2 = new ArraySink();

      Logger.addSink(sink1);
      Logger.addSink(sink2);

      Logger.info('Test', 'Message');

      expect(sink1.entries).toHaveLength(1);
      expect(sink2.entries).toHaveLength(1);
    });

    it('can remove sinks', () => {
      const sink = new ArraySink();

      Logger.addSink(sink);
      Logger.info('Test', 'Message 1');

      Logger.removeSink(sink);
      Logger.info('Test', 'Message 2');

      expect(sink.entries).toHaveLength(1);
    });

    it('handles sink errors gracefully', () => {
      const errorSink: LogSink = {
        write: () => {
          throw new Error('Sink error');
        },
      };

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      Logger.addSink(errorSink);

      expect(() => {
        Logger.info('Test', 'Message');
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('initializes with default sinks', () => {
      Logger.info('Test', 'Message');

      const history = Logger.getHistory();
      expect(history.entries.length).toBeGreaterThan(0);
    });
  });

  describe('ConsoleSink', () => {
    it('writes to console', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const sink = new ConsoleSink();

      const entry: LogEntry = {
        level: LogLevel.INFO,
        category: 'Test',
        message: 'Test message',
        timestamp: Date.now(),
      };

      sink.write(entry);

      expect(consoleSpy).toHaveBeenCalled();
    });

    it('uses correct console method for each level', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const sink = new ConsoleSink();

      sink.write({
        level: LogLevel.DEBUG,
        category: 'Test',
        message: 'Debug',
        timestamp: Date.now(),
      });

      sink.write({
        level: LogLevel.INFO,
        category: 'Test',
        message: 'Info',
        timestamp: Date.now(),
      });

      sink.write({
        level: LogLevel.WARN,
        category: 'Test',
        message: 'Warn',
        timestamp: Date.now(),
      });

      sink.write({
        level: LogLevel.ERROR,
        category: 'Test',
        message: 'Error',
        timestamp: Date.now(),
      });

      expect(debugSpy).toHaveBeenCalled();
      expect(infoSpy).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('includes structured data', () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const sink = new ConsoleSink();

      const entry: LogEntry = {
        level: LogLevel.INFO,
        category: 'Test',
        message: 'Test message',
        timestamp: Date.now(),
        data: { key: 'value' },
      };

      sink.write(entry);

      expect(infoSpy).toHaveBeenCalledWith(expect.any(String), { key: 'value' });
    });

    it('includes stack trace when present', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const sink = new ConsoleSink();

      const entry: LogEntry = {
        level: LogLevel.ERROR,
        category: 'Test',
        message: 'Error message',
        timestamp: Date.now(),
        stack: 'Stack trace here',
      };

      sink.write(entry);

      expect(errorSpy).toHaveBeenCalledTimes(2); // Once for message, once for stack
    });
  });

  describe('ArraySink', () => {
    it('stores log entries', () => {
      const sink = new ArraySink();

      Logger.addSink(sink);
      Logger.info('Test', 'Message 1');
      Logger.info('Test', 'Message 2');

      expect(sink.entries).toHaveLength(2);
    });

    it('respects max entries limit', () => {
      const sink = new ArraySink(5);

      Logger.addSink(sink);

      for (let i = 0; i < 10; i++) {
        Logger.info('Test', `Message ${i}`);
      }

      expect(sink.entries).toHaveLength(5);
    });

    it('removes oldest entries when full', () => {
      const sink = new ArraySink(3);

      Logger.addSink(sink);

      Logger.info('Test', 'Message 0');
      Logger.info('Test', 'Message 1');
      Logger.info('Test', 'Message 2');
      Logger.info('Test', 'Message 3');

      expect(sink.entries).toHaveLength(3);
      expect(sink.entries[0].message).toBe('Message 1');
      expect(sink.entries[2].message).toBe('Message 3');
    });

    it('can be cleared', () => {
      const sink = new ArraySink();

      Logger.addSink(sink);
      Logger.info('Test', 'Message');

      expect(sink.entries).toHaveLength(1);

      sink.clear();

      expect(sink.entries).toHaveLength(0);
    });
  });

  describe('scoped loggers', () => {
    it('creates logger with bound category', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const logger = Logger.create('MyCategory');
      logger.info('Test message');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].category).toBe('MyCategory');
    });

    it('supports all log levels', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);
      Logger.setGlobalLevel(LogLevel.TRACE);

      const logger = Logger.create('Test');

      logger.trace('Trace');
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
      logger.fatal('Fatal');

      expect(sink.entries).toHaveLength(6);
    });

    it('passes data to log entries', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const logger = Logger.create('Test');
      logger.info('Message', { key: 'value' });

      expect(sink.entries[0].data).toEqual({ key: 'value' });
    });

    it('can be created with new keyword', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const logger = new Logger('MyCategory');
      logger.info('Test message');

      expect(sink.entries[0].category).toBe('MyCategory');
    });

    it('supports Logger.get() alias', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const logger = Logger.get('MyCategory');
      logger.info('Test message');

      expect(sink.entries[0].category).toBe('MyCategory');
    });

    it('defaults to "Default" category', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const logger = new Logger();
      logger.info('Test message');

      expect(sink.entries[0].category).toBe('Default');
    });
  });

  describe('structured logging', () => {
    it('attaches data to log entries', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Message', { userId: 123, action: 'login' });

      expect(sink.entries[0].data).toEqual({ userId: 123, action: 'login' });
    });

    it('handles complex data structures', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const complexData = {
        user: {
          id: 123,
          name: 'Test User',
        },
        items: [1, 2, 3],
        metadata: {
          timestamp: Date.now(),
        },
      };

      Logger.info('Test', 'Message', complexData);

      expect(sink.entries[0].data).toEqual(complexData);
    });

    it('handles null and undefined data', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Message 1', null);
      Logger.info('Test', 'Message 2', undefined);

      expect(sink.entries[0].data).toBeNull();
      expect(sink.entries[1].data).toBeUndefined();
    });
  });

  describe('rate limiting', () => {
    it('limits messages per category', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      // Spam messages
      for (let i = 0; i < 200; i++) {
        Logger.info('Test', `Message ${i}`);
      }

      // Should be rate limited
      expect(sink.entries.length).toBeLessThan(200);
    });

    it('resets rate limit for category', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      // Hit rate limit
      for (let i = 0; i < 200; i++) {
        Logger.info('Test', `Message ${i}`);
      }

      const count1 = sink.entries.length;

      Logger.resetRateLimit('Test');

      // Should be able to log again
      Logger.info('Test', 'After reset');

      expect(sink.entries.length).toBe(count1 + 1);
    });

    it('resets all rate limits', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      for (let i = 0; i < 200; i++) {
        Logger.info('Cat1', `Message ${i}`);
        Logger.info('Cat2', `Message ${i}`);
      }

      const count1 = sink.entries.length;

      Logger.resetAllRateLimits();

      Logger.info('Cat1', 'After reset');
      Logger.info('Cat2', 'After reset');

      expect(sink.entries.length).toBe(count1 + 2);
    });

    it('applies rate limiting per category', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      // Spam category A
      for (let i = 0; i < 200; i++) {
        Logger.info('CategoryA', `Message ${i}`);
      }

      // Category B should not be affected
      Logger.info('CategoryB', 'Message');

      const categoryBEntries = sink.entries.filter((e) => e.category === 'CategoryB');
      expect(categoryBEntries).toHaveLength(1);
    });
  });

  describe('history buffer', () => {
    it('stores recent log entries', () => {
      Logger.info('Test', 'Message 1');
      Logger.info('Test', 'Message 2');

      const history = Logger.getHistory();

      expect(history.entries.length).toBeGreaterThanOrEqual(2);
    });

    it('is accessible via getHistory()', () => {
      const history = Logger.getHistory();

      expect(history).toBeDefined();
      expect(history.entries).toBeDefined();
    });

    it('can be cleared', () => {
      Logger.info('Test', 'Message');

      const history = Logger.getHistory();
      const count = history.entries.length;

      expect(count).toBeGreaterThan(0);

      history.clear();

      expect(history.entries).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('clears all sinks', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.reset();

      Logger.info('Test', 'Message');

      // Sink should not receive the message
      expect(sink.entries).toHaveLength(0);
    });

    it('resets global level to INFO', () => {
      Logger.setGlobalLevel(LogLevel.ERROR);
      Logger.reset();

      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Should appear');

      expect(sink.entries).toHaveLength(1);
    });

    it('clears category levels', () => {
      Logger.setLevel('Test', LogLevel.ERROR);
      Logger.clearCategoryLevels();

      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Should appear');

      expect(sink.entries).toHaveLength(1);
    });

    it('resets rate limits', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      for (let i = 0; i < 200; i++) {
        Logger.info('Test', `Message ${i}`);
      }

      Logger.reset();
      Logger.addSink(sink);

      Logger.info('Test', 'After reset');

      // Should be able to log
      const afterResetCount = sink.entries.filter(
        (e) => e.message === 'After reset'
      ).length;
      expect(afterResetCount).toBe(1);
    });
  });

  describe('singleton instance', () => {
    it('provides global instance', () => {
      const instance = Logger.getInstance();

      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(Logger);
    });

    it('returns same instance on multiple calls', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('edge cases', () => {
    it('handles empty messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', '');

      expect(sink.entries).toHaveLength(1);
      expect(sink.entries[0].message).toBe('');
    });

    it('handles very long messages', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      const longMessage = 'x'.repeat(10000);
      Logger.info('Test', longMessage);

      expect(sink.entries[0].message).toBe(longMessage);
    });

    it('handles special characters', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Message with \n newlines \t tabs "quotes"');

      expect(sink.entries).toHaveLength(1);
    });

    it('handles Unicode characters', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', '日本語 測試 🎮');

      expect(sink.entries[0].message).toContain('日本語');
    });

    it('preserves timestamp ordering', () => {
      const sink = new ArraySink();
      Logger.addSink(sink);

      Logger.info('Test', 'Message 1');
      Logger.info('Test', 'Message 2');
      Logger.info('Test', 'Message 3');

      expect(sink.entries[0].timestamp).toBeLessThanOrEqual(sink.entries[1].timestamp);
      expect(sink.entries[1].timestamp).toBeLessThanOrEqual(sink.entries[2].timestamp);
    });
  });
});
