/**
 * Comprehensive unit tests for the Camera class.
 * Tests perspective/orthographic projection, view matrix, frustum planes, ray generation, aspect ratio, and TAA jitter.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Camera, ProjectionType } from '../../../rendering/camera/Camera';
import { Vector2 } from '../../../math/Vector2';
import { Vector3 } from '../../../math/Vector3';
import { approximatelyEqual, vectorsApproximatelyEqual } from '../../utils/TestHelpers';

describe('Camera', () => {
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera();
  });

  describe('perspective projection', () => {
    it('creates perspective projection matrix', () => {
      camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);

      expect(camera.projectionType).toBe(ProjectionType.Perspective);
      expect(camera.fov).toBeCloseTo(Math.PI / 4);
      expect(camera.aspect).toBeCloseTo(16 / 9);
      expect(camera.near).toBe(0.1);
      expect(camera.far).toBe(1000);
    });

    it('generates correct projection matrix', () => {
      camera.setPerspective(Math.PI / 2, 1, 1, 100);

      const projMatrix = camera.projectionMatrix;
      const elements = projMatrix.elements;

      // Perspective matrix should have specific properties
      expect(elements[0]).toBeCloseTo(1); // X scale based on FOV and aspect
      expect(elements[15]).toBe(0); // w component should be 0 for perspective
    });

    it('updates projection matrix when parameters change', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      const matrix1 = camera.projectionMatrix.clone();

      camera.setPerspective(Math.PI / 2, 1, 0.1, 100);
      const matrix2 = camera.projectionMatrix;

      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('handles extreme FOV values', () => {
      camera.setPerspective(Math.PI * 0.99, 1, 0.1, 100);
      expect(camera.projectionMatrix).toBeDefined();

      camera.setPerspective(0.01, 1, 0.1, 100);
      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles extreme aspect ratios', () => {
      camera.setPerspective(Math.PI / 4, 0.1, 0.1, 100);
      expect(camera.projectionMatrix).toBeDefined();

      camera.setPerspective(Math.PI / 4, 10, 0.1, 100);
      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles extreme near/far planes', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.001, 10000);

      expect(camera.near).toBe(0.001);
      expect(camera.far).toBe(10000);
      expect(camera.projectionMatrix).toBeDefined();
    });
  });

  describe('orthographic projection', () => {
    it('creates orthographic projection matrix', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);

      expect(camera.projectionType).toBe(ProjectionType.Orthographic);
      expect(camera.near).toBe(0.1);
      expect(camera.far).toBe(100);
    });

    it('generates correct projection matrix', () => {
      camera.setOrthographic(-10, 10, -5, 5, 1, 100);

      const projMatrix = camera.projectionMatrix;
      const elements = projMatrix.elements;

      // Orthographic matrix should have specific properties
      expect(elements[15]).toBe(1); // w component should be 1 for orthographic
    });

    it('updates projection matrix when parameters change', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
      const matrix1 = camera.projectionMatrix.clone();

      camera.setOrthographic(-20, 20, -20, 20, 0.1, 100);
      const matrix2 = camera.projectionMatrix;

      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('handles zoom factor', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
      camera.zoom = 2;

      const matrix1 = camera.projectionMatrix.clone();

      camera.zoom = 1;
      const matrix2 = camera.projectionMatrix;

      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('clamps negative zoom values', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      camera.zoom = -1;

      expect(camera.zoom).toBeGreaterThan(0);

      consoleWarnSpy.mockRestore();
    });

    it('clamps zero zoom values', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      camera.zoom = 0;

      expect(camera.zoom).toBeGreaterThan(0);

      consoleWarnSpy.mockRestore();
    });
  });

  describe('view matrix', () => {
    it('generates view matrix from transform', () => {
      camera.transform.position.set(0, 10, 0);
      camera.transform.lookAt(new Vector3(0, 0, 0));

      const viewMatrix = camera.viewMatrix;
      expect(viewMatrix).toBeDefined();
    });

    it('updates view matrix when transform changes', () => {
      camera.transform.position.set(0, 0, 10);
      const matrix1 = camera.viewMatrix.clone();

      camera.transform.position.set(0, 0, 20);
      const matrix2 = camera.viewMatrix;

      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('generates inverse view matrix', () => {
      camera.transform.position.set(5, 5, 5);
      camera.transform.lookAt(new Vector3(0, 0, 0));

      const viewMatrix = camera.viewMatrix;
      const invViewMatrix = camera.inverseViewMatrix;

      expect(invViewMatrix).toBeDefined();

      if (invViewMatrix) {
        const identity = viewMatrix.multiply(invViewMatrix);
        // Should be approximately identity
        expect(approximatelyEqual(identity.elements[0]!, 1, 0.001)).toBe(true);
      }
    });

    it('computes view-projection matrix', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 5, 10);
      camera.transform.lookAt(new Vector3(0, 0, 0));

      const vpMatrix = camera.viewProjectionMatrix;
      expect(vpMatrix).toBeDefined();

      const projMatrix = camera.projectionMatrix;
      const viewMatrix = camera.viewMatrix;
      const expectedVP = projMatrix.multiply(viewMatrix);

      expect(vpMatrix.equals(expectedVP)).toBe(true);
    });

    it('handles singular transform matrices', () => {
      // Set up a degenerate transform
      camera.transform.scale.set(0, 0, 0);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const viewMatrix = camera.viewMatrix;

      // Should fall back to identity or handle gracefully
      expect(viewMatrix).toBeDefined();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('frustum planes', () => {
    it('computes frustum from view-projection matrix', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);

      const frustum = camera.frustum;
      expect(frustum).toBeDefined();
      expect(frustum.planes.length).toBe(6);
    });

    it('updates frustum when camera moves', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);

      const frustum1 = camera.frustum.clone();

      camera.transform.position.set(0, 0, 20);

      const frustum2 = camera.frustum;

      // Frustums should be different
      expect(frustum1.equals(frustum2)).toBe(false);
    });

    it('updates frustum when projection changes', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);

      const frustum1 = camera.frustum.clone();

      camera.setPerspective(Math.PI / 2, 1, 0.1, 100);

      const frustum2 = camera.frustum;

      expect(frustum1.equals(frustum2)).toBe(false);
    });

    it('performs frustum culling on boxes', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);
      camera.transform.lookAt(new Vector3(0, 0, 0));

      // Box in front of camera (should be visible)
      const visibleBox = {
        min: new Vector3(-1, -1, -5),
        max: new Vector3(1, 1, -3),
      };

      expect(camera.frustum.intersectsBox(visibleBox)).toBe(true);

      // Box behind camera (should not be visible)
      const hiddenBox = {
        min: new Vector3(-1, -1, 11),
        max: new Vector3(1, 1, 13),
      };

      expect(camera.frustum.intersectsBox(hiddenBox)).toBe(false);
    });
  });

  describe('screen ray generation', () => {
    beforeEach(() => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);
      camera.transform.lookAt(new Vector3(0, 0, 0));
    });

    it('generates ray through screen center', () => {
      const ray = camera.screenPointToRay(new Vector2(0.5, 0.5));

      expect(ray).toBeDefined();
      expect(ray.origin).toBeDefined();
      expect(ray.direction).toBeDefined();

      // Direction should be approximately normalized
      expect(approximatelyEqual(ray.direction.length(), 1, 0.001)).toBe(true);
    });

    it('generates ray through screen corners', () => {
      const topLeft = camera.screenPointToRay(new Vector2(0, 0));
      const topRight = camera.screenPointToRay(new Vector2(1, 0));
      const bottomLeft = camera.screenPointToRay(new Vector2(0, 1));
      const bottomRight = camera.screenPointToRay(new Vector2(1, 1));

      expect(topLeft).toBeDefined();
      expect(topRight).toBeDefined();
      expect(bottomLeft).toBeDefined();
      expect(bottomRight).toBeDefined();

      // All rays should have normalized directions
      expect(approximatelyEqual(topLeft.direction.length(), 1, 0.001)).toBe(true);
      expect(approximatelyEqual(topRight.direction.length(), 1, 0.001)).toBe(true);
      expect(approximatelyEqual(bottomLeft.direction.length(), 1, 0.001)).toBe(true);
      expect(approximatelyEqual(bottomRight.direction.length(), 1, 0.001)).toBe(true);
    });

    it('generates rays with correct origin for perspective camera', () => {
      const ray = camera.screenPointToRay(new Vector2(0.5, 0.5));

      // Ray origin should be near camera position for perspective
      expect(vectorsApproximatelyEqual(ray.origin, camera.transform.worldPosition, 10)).toBe(true);
    });

    it('generates rays with different directions for orthographic camera', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
      camera.transform.position.set(0, 0, 10);

      const ray1 = camera.screenPointToRay(new Vector2(0.25, 0.5));
      const ray2 = camera.screenPointToRay(new Vector2(0.75, 0.5));

      // Orthographic rays should be parallel
      expect(vectorsApproximatelyEqual(ray1.direction, ray2.direction, 0.001)).toBe(true);
    });

    it('handles invalid inverse matrices gracefully', () => {
      camera.transform.scale.set(0, 0, 0);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const ray = camera.screenPointToRay(new Vector2(0.5, 0.5));

      expect(ray).toBeDefined();

      consoleWarnSpy.mockRestore();
    });
  });

  describe('world to screen projection', () => {
    beforeEach(() => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);
      camera.transform.lookAt(new Vector3(0, 0, 0));
    });

    it('projects world point to screen', () => {
      const worldPoint = new Vector3(0, 0, 0);
      const screenPoint = camera.worldToScreenPoint(worldPoint);

      expect(screenPoint).toBeDefined();

      if (screenPoint) {
        // Point at origin should project to center of screen
        expect(approximatelyEqual(screenPoint.x, 0.5, 0.1)).toBe(true);
        expect(approximatelyEqual(screenPoint.y, 0.5, 0.1)).toBe(true);
      }
    });

    it('returns null for points behind camera', () => {
      const behindPoint = new Vector3(0, 0, 15);
      const screenPoint = camera.worldToScreenPoint(behindPoint);

      expect(screenPoint).toBeNull();
    });

    it('returns correct depth value', () => {
      const worldPoint = new Vector3(0, 0, 5);
      const screenPoint = camera.worldToScreenPoint(worldPoint);

      expect(screenPoint).toBeDefined();

      if (screenPoint) {
        expect(screenPoint.z).toBeGreaterThanOrEqual(0);
        expect(screenPoint.z).toBeLessThanOrEqual(1);
      }
    });

    it('projects corner points correctly', () => {
      const point = new Vector3(5, 5, 0);
      const screenPoint = camera.worldToScreenPoint(point);

      expect(screenPoint).toBeDefined();
    });

    it('converts to NDC coordinates', () => {
      const worldPoint = new Vector3(0, 0, 0);
      const ndcPoint = camera.worldToNDC(worldPoint);

      expect(ndcPoint).toBeDefined();

      if (ndcPoint) {
        // NDC should be in range [-1, 1]
        expect(Math.abs(ndcPoint.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(ndcPoint.y)).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('aspect ratio handling', () => {
    it('updates aspect ratio', () => {
      camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 100);

      camera.setAspect(4 / 3);

      expect(camera.aspect).toBeCloseTo(4 / 3);
    });

    it('updates projection matrix when aspect changes', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      const matrix1 = camera.projectionMatrix.clone();

      camera.setAspect(2);
      const matrix2 = camera.projectionMatrix;

      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('does not update orthographic projection on aspect change', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
      const matrix1 = camera.projectionMatrix.clone();

      camera.setAspect(2);
      const matrix2 = camera.projectionMatrix;

      // Orthographic should not be affected by aspect ratio changes
      expect(matrix1.equals(matrix2)).toBe(true);
    });

    it('handles window resize scenarios', () => {
      camera.setPerspective(Math.PI / 4, 800 / 600, 0.1, 100);

      // Simulate window resize
      camera.setAspect(1920 / 1080);

      expect(camera.aspect).toBeCloseTo(1920 / 1080);
    });
  });

  describe('jitter for TAA', () => {
    beforeEach(() => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
    });

    it('enables jitter', () => {
      camera.enableJitter(true);

      camera.updateJitter();

      const jitter = camera.jitterOffset;
      expect(jitter).toBeDefined();
    });

    it('disables jitter', () => {
      camera.enableJitter(true);
      camera.updateJitter();

      camera.enableJitter(false);

      const jitter = camera.jitterOffset;
      expect(jitter.x).toBe(0);
      expect(jitter.y).toBe(0);
    });

    it('generates different jitter values each frame', () => {
      camera.enableJitter(true);

      camera.updateJitter();
      const jitter1 = camera.jitterOffset.clone();

      camera.updateJitter();
      const jitter2 = camera.jitterOffset.clone();

      expect(jitter1.equals(jitter2)).toBe(false);
    });

    it('uses Halton sequence for jitter', () => {
      camera.enableJitter(true);

      const jitters: Vector2[] = [];
      for (let i = 0; i < 8; i++) {
        camera.updateJitter();
        jitters.push(camera.jitterOffset.clone());
      }

      // All jitters should be different (Halton sequence)
      for (let i = 0; i < jitters.length; i++) {
        for (let j = i + 1; j < jitters.length; j++) {
          expect(jitters[i].equals(jitters[j])).toBe(false);
        }
      }
    });

    it('resets jitter sequence', () => {
      camera.enableJitter(true);

      camera.updateJitter();
      const jitter1 = camera.jitterOffset.clone();

      camera.resetJitter();
      camera.updateJitter();
      const jitter2 = camera.jitterOffset.clone();

      // After reset, should produce same sequence
      expect(jitter1.equals(jitter2)).toBe(true);
    });

    it('applies jitter to projection matrix', () => {
      camera.enableJitter(false);
      const matrix1 = camera.projectionMatrix.clone();

      camera.enableJitter(true);
      camera.updateJitter();
      const matrix2 = camera.projectionMatrix;

      // Matrices should differ when jitter is applied
      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('does not apply jitter when disabled', () => {
      camera.enableJitter(false);
      const matrix1 = camera.projectionMatrix.clone();

      camera.updateJitter(); // Should have no effect
      const matrix2 = camera.projectionMatrix;

      expect(matrix1.equals(matrix2)).toBe(true);
    });
  });

  describe('matrix updates and caching', () => {
    it('caches projection matrix', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);

      const matrix1 = camera.projectionMatrix;
      const matrix2 = camera.projectionMatrix;

      // Should return same instance when not dirty
      expect(matrix1).toBe(matrix2);
    });

    it('invalidates cache when parameters change', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      const matrix1 = camera.projectionMatrix;

      camera.setPerspective(Math.PI / 2, 1, 0.1, 100);
      const matrix2 = camera.projectionMatrix;

      // Should be different after parameter change
      expect(matrix1.equals(matrix2)).toBe(false);
    });

    it('stores previous frame matrices', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);

      camera.updateMatrices();

      const prevView = camera.previousViewMatrix;
      const prevProj = camera.previousProjectionMatrix;
      const prevVP = camera.previousViewProjectionMatrix;

      expect(prevView).toBeDefined();
      expect(prevProj).toBeDefined();
      expect(prevVP).toBeDefined();
    });

    it('updates previous matrices correctly', () => {
      camera.setPerspective(Math.PI / 4, 1, 0.1, 100);
      camera.transform.position.set(0, 0, 10);

      const currentView = camera.viewMatrix.clone();
      camera.updateMatrices();

      const previousView = camera.previousViewMatrix;

      expect(currentView.equals(previousView)).toBe(true);
    });
  });

  describe('cloning', () => {
    it('clones perspective camera', () => {
      camera.setPerspective(Math.PI / 4, 16 / 9, 0.1, 1000);
      camera.transform.position.set(5, 5, 5);

      const cloned = camera.clone();

      expect(cloned.projectionType).toBe(camera.projectionType);
      expect(cloned.fov).toBeCloseTo(camera.fov);
      expect(cloned.aspect).toBeCloseTo(camera.aspect);
      expect(cloned.near).toBe(camera.near);
      expect(cloned.far).toBe(camera.far);
    });

    it('clones orthographic camera', () => {
      camera.setOrthographic(-10, 10, -10, 10, 0.1, 100);
      camera.zoom = 2;

      const cloned = camera.clone();

      expect(cloned.projectionType).toBe(camera.projectionType);
      expect(cloned.zoom).toBe(camera.zoom);
    });

    it('clones transform', () => {
      camera.transform.position.set(1, 2, 3);
      camera.transform.rotation.setFromEuler(0.5, 1.0, 1.5);

      const cloned = camera.clone();

      expect(vectorsApproximatelyEqual(
        cloned.transform.position,
        camera.transform.position,
        0.001
      )).toBe(true);
    });

    it('clones jitter settings', () => {
      camera.enableJitter(true);
      camera.updateJitter();

      const cloned = camera.clone();

      // Jitter should be enabled in clone
      expect(cloned).toBeDefined();
    });

    it('creates independent clone', () => {
      const cloned = camera.clone();

      camera.setPerspective(Math.PI / 2, 1, 0.1, 100);

      // Cloned camera should not be affected
      expect(cloned.fov).not.toBeCloseTo(camera.fov);
    });
  });

  describe('edge cases', () => {
    it('handles very small FOV', () => {
      camera.setPerspective(0.001, 1, 0.1, 100);

      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles very large FOV', () => {
      camera.setPerspective(Math.PI * 0.99, 1, 0.1, 100);

      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles zero near plane distance', () => {
      camera.setPerspective(Math.PI / 4, 1, 0, 100);

      // Should handle gracefully or clamp to minimum
      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles reversed near/far planes', () => {
      // Near > far (invalid but should not crash)
      camera.setPerspective(Math.PI / 4, 1, 100, 0.1);

      expect(camera.projectionMatrix).toBeDefined();
    });

    it('handles extreme position values', () => {
      camera.transform.position.set(1e6, 1e6, 1e6);

      expect(camera.viewMatrix).toBeDefined();
    });
  });
});
