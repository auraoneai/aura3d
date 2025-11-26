/**
 * River path generation and terrain carving for realistic water features.
 * Uses flow accumulation and path tracing to create natural river networks.
 * @module RiverGenerator
 */

import { Vector2 } from '../../math/Vector2';
import { Heightmap } from '../Heightmap';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RiverGenerator');

/**
 * River point in a path.
 */
export interface RiverPoint {
  /** Position in heightmap space */
  position: Vector2;
  /** Water flow volume */
  flow: number;
  /** River width at this point */
  width: number;
}

/**
 * River path data.
 */
export class RiverPath {
  /** River points */
  readonly points: RiverPoint[];
  /** Total river length */
  length: number;

  /**
   * Creates a river path.
   */
  constructor() {
    this.points = [];
    this.length = 0;
  }

  /**
   * Adds a point to the path.
   *
   * @param point - Point to add
   */
  addPoint(point: RiverPoint): void {
    this.points.push(point);

    if (this.points.length > 1) {
      const prev = this.points[this.points.length - 2]!;
      const dist = Math.sqrt(
        Math.pow(point.position.x - prev.position.x, 2) +
        Math.pow(point.position.y - prev.position.y, 2)
      );
      this.length += dist;
    }
  }
}

/**
 * River generator configuration.
 */
export interface RiverGeneratorConfig {
  /** Number of river sources to generate */
  riverCount: number;
  /** Minimum flow accumulation for river formation */
  minFlowThreshold: number;
  /** River carving depth multiplier */
  carvingDepth: number;
  /** River width multiplier */
  widthMultiplier: number;
  /** Minimum river width */
  minWidth: number;
  /** Maximum river width */
  maxWidth: number;
  /** River smoothing iterations */
  smoothingIterations: number;
}

/**
 * River generator for procedural river networks.
 * Generates rivers based on terrain flow and carves them into the heightmap.
 *
 * @example
 * ```typescript
 * const generator = new RiverGenerator({
 *   riverCount: 5,
 *   minFlowThreshold: 100,
 *   carvingDepth: 0.02,
 *   widthMultiplier: 0.5,
 *   minWidth: 2,
 *   maxWidth: 10
 * });
 *
 * const rivers = generator.generate(heightmap);
 * generator.carveRivers(heightmap, rivers);
 * ```
 */
export class RiverGenerator {
  private _config: RiverGeneratorConfig;
  private _random: number;

  /**
   * Creates a new river generator.
   *
   * @param config - Generator configuration
   */
  constructor(config: Partial<RiverGeneratorConfig> = {}) {
    this._config = {
      riverCount: config.riverCount ?? 5,
      minFlowThreshold: config.minFlowThreshold ?? 100,
      carvingDepth: config.carvingDepth ?? 0.02,
      widthMultiplier: config.widthMultiplier ?? 0.5,
      minWidth: config.minWidth ?? 2,
      maxWidth: config.maxWidth ?? 10,
      smoothingIterations: config.smoothingIterations ?? 3,
    };

    this._random = Math.random() * 10000;
  }

  /**
   * Generates river paths on a heightmap.
   *
   * @param heightmap - Terrain heightmap
   * @returns Array of river paths
   */
  generate(heightmap: Heightmap): RiverPath[] {
    logger.info(`Generating ${this._config.riverCount} rivers...`);

    // Calculate flow accumulation
    const flowMap = this._calculateFlowAccumulation(heightmap);

    // Find high-flow areas for river sources
    const sources = this._findRiverSources(flowMap, heightmap);

    // Trace river paths
    const rivers: RiverPath[] = [];
    for (const source of sources) {
      const path = this._tracePath(source, heightmap, flowMap);
      if (path.points.length > 10) {
        rivers.push(path);
      }
    }

    logger.info(`Generated ${rivers.length} river paths`);
    return rivers;
  }

  /**
   * Carves rivers into the heightmap.
   *
   * @param heightmap - Heightmap to carve
   * @param rivers - River paths to carve
   */
  carveRivers(heightmap: Heightmap, rivers: RiverPath[]): void {
    logger.info(`Carving ${rivers.length} rivers into terrain...`);

    for (const river of rivers) {
      for (const point of river.points) {
        this._carveRiverPoint(heightmap, point);
      }
    }

    // Smooth carved areas
    for (let i = 0; i < this._config.smoothingIterations; i++) {
      this._smoothRivers(heightmap, rivers);
    }

    logger.info('River carving complete');
  }

  /**
   * Calculates flow accumulation map.
   * @private
   */
  private _calculateFlowAccumulation(heightmap: Heightmap): Float32Array {
    const width = heightmap.width;
    const height = heightmap.height;
    const flowMap = new Float32Array(width * height);

    // Initialize flow map with 1 (each cell contributes 1 unit of flow)
    flowMap.fill(1);

    // Create sorted list of cells by height (highest first)
    const cells: Array<{ x: number; y: number; height: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        cells.push({ x, y, height: heightmap.getSample(x, y) });
      }
    }
    cells.sort((a, b) => b.height - a.height);

    // Process cells from highest to lowest
    for (const cell of cells) {
      const { x, y } = cell;
      const currentFlow = flowMap[y * width + x];

      // Find lowest neighbor
      let lowestHeight = Infinity;
      let lowestX = x;
      let lowestY = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighborHeight = heightmap.getSample(nx, ny);
            if (neighborHeight < lowestHeight) {
              lowestHeight = neighborHeight;
              lowestX = nx;
              lowestY = ny;
            }
          }
        }
      }

      // Flow to lowest neighbor
      if (lowestHeight < heightmap.getSample(x, y)) {
        const targetIndex = lowestY * width + lowestX;
        flowMap[targetIndex]! += currentFlow!;
      }
    }

    return flowMap;
  }

  /**
   * Finds river source positions.
   * @private
   */
  private _findRiverSources(flowMap: Float32Array, heightmap: Heightmap): Vector2[] {
    const width = heightmap.width;
    const height = heightmap.height;
    const sources: Vector2[] = [];

    // Find cells with high flow accumulation
    const candidates: Array<{ x: number; y: number; flow: number }> = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const flow = flowMap[y * width + x]!;
        if (flow >= this._config.minFlowThreshold) {
          candidates.push({ x, y, flow });
        }
      }
    }

    // Sort by flow (highest first)
    candidates.sort((a, b) => b.flow - a.flow);

    // Select river sources (with minimum distance between them)
    const minDistance = Math.min(width, height) * 0.1;
    for (const candidate of candidates) {
      if (sources.length >= this._config.riverCount) break;

      // Check distance to existing sources
      let tooClose = false;
      for (const source of sources) {
        const dist = Math.sqrt(
          Math.pow(candidate.x - source.x, 2) +
          Math.pow(candidate.y - source.y, 2)
        );
        if (dist < minDistance) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        sources.push(new Vector2(candidate.x, candidate.y));
      }
    }

    return sources;
  }

  /**
   * Traces a river path from source to sink.
   * @private
   */
  private _tracePath(
    start: Vector2,
    heightmap: Heightmap,
    flowMap: Float32Array
  ): RiverPath {
    const path = new RiverPath();
    const width = heightmap.width;
    const height = heightmap.height;

    let x = start.x;
    let y = start.y;
    let prevX = x;
    let prevY = y;

    const maxIterations = Math.max(width, height) * 2;
    const visited = new Set<string>();

    for (let i = 0; i < maxIterations; i++) {
      const key = `${Math.floor(x)},${Math.floor(y)}`;
      if (visited.has(key)) break;
      visited.add(key);

      const flow = flowMap[Math.floor(y) * width + Math.floor(x)];
      const riverWidth = Math.min(
        this._config.maxWidth,
        Math.max(this._config.minWidth, Math.sqrt(flow) * this._config.widthMultiplier)
      );

      path.addPoint({
        position: new Vector2(x, y),
        flow,
        width: riverWidth,
      });

      // Find steepest descent
      let steepestGradient = 0;
      let nextX = x;
      let nextY = y;

      const currentHeight = heightmap.getSample(Math.floor(x), Math.floor(y));

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          // Prevent backtracking
          if (Math.abs(nx - prevX) < 0.1 && Math.abs(ny - prevY) < 0.1) continue;

          if (nx >= 0 && nx < width - 1 && ny >= 0 && ny < height - 1) {
            const neighborHeight = heightmap.getSample(Math.floor(nx), Math.floor(ny));
            const gradient = currentHeight - neighborHeight;

            if (gradient > steepestGradient) {
              steepestGradient = gradient;
              nextX = nx;
              nextY = ny;
            }
          }
        }
      }

      // No downhill direction found
      if (nextX === x && nextY === y) break;

      prevX = x;
      prevY = y;
      x = nextX;
      y = nextY;

      // Stop at water level or edge
      if (currentHeight <= 0 || x < 1 || x >= width - 1 || y < 1 || y >= height - 1) {
        break;
      }
    }

    return path;
  }

  /**
   * Carves a single river point into the heightmap.
   * @private
   */
  private _carveRiverPoint(heightmap: Heightmap, point: RiverPoint): void {
    const x = Math.floor(point.position.x);
    const y = Math.floor(point.position.y);
    const radius = Math.ceil(point.width / 2);

    const centerHeight = heightmap.getSample(x, y);
    const carveDepth = Math.log(1 + point.flow) * this._config.carvingDepth;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx >= 0 && nx < heightmap.width && ny >= 0 && ny < heightmap.height) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= radius) {
            const falloff = 1 - (dist / radius);
            const currentHeight = heightmap.getSample(nx, ny);
            const targetHeight = centerHeight - carveDepth * falloff;

            // Only carve down, never up
            if (targetHeight < currentHeight) {
              heightmap.setSample(nx, ny, targetHeight);
            }
          }
        }
      }
    }
  }

  /**
   * Smooths river-carved areas.
   * @private
   */
  private _smoothRivers(heightmap: Heightmap, rivers: RiverPath[]): void {
    for (const river of rivers) {
      for (const point of river.points) {
        const x = Math.floor(point.position.x);
        const y = Math.floor(point.position.y);
        const radius = Math.ceil(point.width / 2);

        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 1 && nx < heightmap.width - 1 && ny >= 1 && ny < heightmap.height - 1) {
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist <= radius) {
                // Average with neighbors
                let sum = 0;
                let count = 0;

                for (let ndy = -1; ndy <= 1; ndy++) {
                  for (let ndx = -1; ndx <= 1; ndx++) {
                    sum += heightmap.getSample(nx + ndx, ny + ndy);
                    count++;
                  }
                }

                const avgHeight = sum / count;
                const currentHeight = heightmap.getSample(nx, ny);
                const smoothed = currentHeight * 0.7 + avgHeight * 0.3;

                heightmap.setSample(nx, ny, smoothed);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Sets the random seed.
   *
   * @param seed - New seed
   */
  setSeed(seed: number): void {
    this._random = seed;
  }
}
