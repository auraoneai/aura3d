import { Vector2 } from "../Vector2.js";
import { generateUUID } from "../MathUtils.js";
import { Path } from "./Path.js";

/** 2D shape boundary + holes — three.js `Shape` parity. */
export class Shape extends Path {
  readonly uuid = generateUUID();

  readonly holes: Path[] = [];

  constructor(points?: readonly Vector2[]) {
    super(points);
  }

  getPointsHoles(divisions: number): Vector2[][] {
    const holesPts: Vector2[][] = [];
    for (const hole of this.holes) {
      holesPts.push(hole.getPoints(divisions));
    }
    return holesPts;
  }

  /** `{shape, holes}` outline points (three.js `Shape.extractPoints`). */
  extractPoints(divisions: number): { shape: Vector2[]; holes: Vector2[][] } {
    return {
      shape: this.getPoints(divisions),
      holes: this.getPointsHoles(divisions)
    };
  }
}
