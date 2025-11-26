/**
 * Global Test Setup for G3D 5.0
 *
 * This file is automatically loaded before all tests run. It sets up global mocks,
 * custom matchers, and configures the testing environment for WebGL/WebGPU, Canvas,
 * Audio, and other browser APIs.
 *
 * @module tests/setup
 */

import { expect } from 'vitest';
import { MockWebGL2RenderingContext } from './utils/MockWebGL';
import { MockGPUAdapter, MockGPUDevice } from './utils/MockWebGPU';
import { MockHTMLCanvasElement } from './utils/MockCanvas';
import { MockAudioContext } from './utils/MockAudio';

/**
 * Setup WebGL mocks for testing
 */
function setupWebGLMocks(): void {
  // Mock HTMLCanvasElement if not available (Node environment)
  if (typeof HTMLCanvasElement === 'undefined') {
    (global as any).HTMLCanvasElement = MockHTMLCanvasElement;
  }

  // Store original getContext if it exists
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  // Override getContext to return mocks
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    contextId: string,
    options?: any
  ): any {
    if (contextId === 'webgl2' || contextId === 'webgl' || contextId === 'experimental-webgl') {
      const mockCanvas = this as any;
      if (!mockCanvas._mockWebGLContext) {
        mockCanvas._mockWebGLContext = new MockWebGL2RenderingContext(this);
      }
      return mockCanvas._mockWebGLContext;
    }
    // Fall back to original implementation if available
    return originalGetContext ? originalGetContext.call(this, contextId, options) : null;
  };
}

/**
 * Setup WebGPU mocks for testing
 */
function setupWebGPUMocks(): void {
  // Mock GPU navigator API
  if (typeof navigator !== 'undefined') {
    if (!(navigator as any).gpu) {
      (navigator as any).gpu = {
        requestAdapter: async (): Promise<GPUAdapter | null> => {
          return new MockGPUAdapter() as unknown as GPUAdapter;
        },
        getPreferredCanvasFormat: (): GPUTextureFormat => {
          return 'bgra8unorm';
        }
      };
    }
  } else {
    // Create navigator in Node environment
    (global as any).navigator = {
      gpu: {
        requestAdapter: async (): Promise<GPUAdapter | null> => {
          return new MockGPUAdapter() as unknown as GPUAdapter;
        },
        getPreferredCanvasFormat: (): GPUTextureFormat => {
          return 'bgra8unorm';
        }
      },
      userAgent: 'Node.js Test Environment'
    };
  }
}

/**
 * Setup Canvas mocks for testing
 */
function setupCanvasMocks(): void {
  // Mock document.createElement for canvas
  if (typeof document !== 'undefined' && !document.createElement) {
    const originalCreateElement = document.createElement;
    document.createElement = function (tagName: string): any {
      if (tagName.toLowerCase() === 'canvas') {
        return new MockHTMLCanvasElement();
      }
      return originalCreateElement ? originalCreateElement.call(document, tagName) : {};
    };
  }
}

/**
 * Setup requestAnimationFrame mock
 */
function setupAnimationFrameMocks(): void {
  let frameId = 0;
  const callbacks = new Map<number, FrameRequestCallback>();

  if (typeof requestAnimationFrame === 'undefined') {
    (global as any).requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = ++frameId;
      callbacks.set(id, callback);
      setTimeout(() => {
        const cb = callbacks.get(id);
        if (cb) {
          callbacks.delete(id);
          cb(performance.now());
        }
      }, 16); // ~60fps
      return id;
    };
  }

  if (typeof cancelAnimationFrame === 'undefined') {
    (global as any).cancelAnimationFrame = (id: number): void => {
      callbacks.delete(id);
    };
  }
}

/**
 * Setup performance.now mock if not available
 */
function setupPerformanceMocks(): void {
  if (typeof performance === 'undefined') {
    const startTime = Date.now();
    (global as any).performance = {
      now(): number {
        return Date.now() - startTime;
      },
      timeOrigin: startTime
    };
  }
}

/**
 * Setup Audio API mocks
 */
function setupAudioMocks(): void {
  if (typeof AudioContext === 'undefined') {
    (global as any).AudioContext = MockAudioContext;
  }
  if (typeof webkitAudioContext === 'undefined') {
    (global as any).webkitAudioContext = MockAudioContext;
  }
}

/**
 * Setup Gamepad API mocks
 */
function setupGamepadMocks(): void {
  if (typeof navigator !== 'undefined' && !navigator.getGamepads) {
    (navigator as any).getGamepads = (): Gamepad[] => {
      return [];
    };
  }
}

/**
 * Setup WebXR mocks (basic stubs)
 */
function setupWebXRMocks(): void {
  if (typeof navigator !== 'undefined' && !(navigator as any).xr) {
    (navigator as any).xr = {
      isSessionSupported: async (mode: string): Promise<boolean> => {
        return false; // No XR support in tests by default
      },
      requestSession: async (mode: string, options?: any): Promise<any> => {
        throw new Error('WebXR not supported in test environment');
      }
    };
  }
}

/**
 * Setup fetch mock utilities
 */
function setupFetchMocks(): void {
  if (typeof fetch === 'undefined') {
    (global as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      return new Response('{}', {
        status: 200,
        statusText: 'OK',
        headers: { 'Content-Type': 'application/json' }
      });
    };
  }
}

/**
 * Custom matcher: Check if two numbers are approximately equal
 */
interface CustomMatchers<R = unknown> {
  toBeCloseTo(expected: number, precision?: number): R;
  toBeCloseToVector3(expected: { x: number; y: number; z: number }, epsilon?: number): R;
  toBeValidMatrix4(): R;
  toBeUnitQuaternion(epsilon?: number): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

/**
 * Setup custom matchers for G3D testing
 */
function setupCustomMatchers(): void {
  // Vector3 approximate equality matcher
  expect.extend({
    toBeCloseToVector3(
      received: any,
      expected: { x: number; y: number; z: number },
      epsilon: number = 0.00001
    ) {
      const pass =
        Math.abs(received.x - expected.x) <= epsilon &&
        Math.abs(received.y - expected.y) <= epsilon &&
        Math.abs(received.z - expected.z) <= epsilon;

      return {
        pass,
        message: () =>
          pass
            ? `Expected vector ${JSON.stringify(received)} not to be close to ${JSON.stringify(expected)}`
            : `Expected vector ${JSON.stringify(received)} to be close to ${JSON.stringify(expected)} (epsilon: ${epsilon})`,
        actual: received,
        expected
      };
    },

    // Matrix4 validity matcher
    toBeValidMatrix4(received: any) {
      const isArray = Array.isArray(received?.elements);
      const hasCorrectLength = received?.elements?.length === 16;
      const allNumbers = hasCorrectLength && received.elements.every((n: any) => typeof n === 'number' && !isNaN(n));

      const pass = isArray && hasCorrectLength && allNumbers;

      return {
        pass,
        message: () =>
          pass
            ? 'Expected matrix not to be valid Matrix4'
            : `Expected matrix to be valid Matrix4 (16 numbers), got: ${JSON.stringify(received)}`,
        actual: received,
        expected: 'Valid Matrix4 with 16 numeric elements'
      };
    },

    // Quaternion unit length matcher
    toBeUnitQuaternion(received: any, epsilon: number = 0.00001) {
      const { x, y, z, w } = received;
      const lengthSq = x * x + y * y + z * z + w * w;
      const pass = Math.abs(lengthSq - 1.0) <= epsilon;

      return {
        pass,
        message: () =>
          pass
            ? `Expected quaternion ${JSON.stringify(received)} not to be unit length`
            : `Expected quaternion ${JSON.stringify(received)} to be unit length (length²: ${lengthSq}, epsilon: ${epsilon})`,
        actual: received,
        expected: 'Unit quaternion with length² ≈ 1.0'
      };
    }
  });
}

/**
 * Console output capture for testing
 */
let consoleOutputCapture: { logs: string[]; errors: string[]; warns: string[] } | null = null;

export function startConsoleCapture(): void {
  consoleOutputCapture = { logs: [], errors: [], warns: [] };

  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: any[]) => {
    consoleOutputCapture?.logs.push(args.join(' '));
    originalLog.apply(console, args);
  };

  console.error = (...args: any[]) => {
    consoleOutputCapture?.errors.push(args.join(' '));
    originalError.apply(console, args);
  };

  console.warn = (...args: any[]) => {
    consoleOutputCapture?.warns.push(args.join(' '));
    originalWarn.apply(console, args);
  };
}

export function getConsoleOutput(): { logs: string[]; errors: string[]; warns: string[] } {
  return consoleOutputCapture || { logs: [], errors: [], warns: [] };
}

export function stopConsoleCapture(): void {
  consoleOutputCapture = null;
}

/**
 * Main setup function - runs before all tests
 */
function setupTestEnvironment(): void {
  // Setup all mocks
  setupWebGLMocks();
  setupWebGPUMocks();
  setupCanvasMocks();
  setupAnimationFrameMocks();
  setupPerformanceMocks();
  setupAudioMocks();
  setupGamepadMocks();
  setupWebXRMocks();
  setupFetchMocks();

  // Setup custom matchers
  setupCustomMatchers();

  // Suppress console warnings in tests unless debugging
  if (!process.env.DEBUG_TESTS) {
    const originalWarn = console.warn;
    console.warn = (...args: any[]) => {
      // Filter out known test warnings
      const message = args.join(' ');
      if (
        !message.includes('WebGL') &&
        !message.includes('WebGPU') &&
        !message.includes('AudioContext')
      ) {
        originalWarn.apply(console, args);
      }
    };
  }
}

// Run setup
setupTestEnvironment();
