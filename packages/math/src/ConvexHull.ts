import { Line3 } from "./Line3.js";
import { Plane } from "./Plane.js";
import { Triangle } from "./Triangle.js";
import { Vector3 } from "./Vector3.js";
import type { Ray } from "./Ray.js";

const Visible = 0;
const Deleted = 1;

/**
 * QuickHull convex hull — three.js `examples/jsm/math/ConvexHull.js` parity.
 * The internal face/half-edge/vertex-list topology is mutable by design
 * (QuickHull is a mutating algorithm); hull point data stays immutable.
 */
export class ConvexHull {
  tolerance = -1;

  /** The generated faces of the convex hull. */
  faces: ConvexHullFace[] = [];

  /** Faces generated within a single iteration. */
  newFaces: ConvexHullFace[] = [];

  /** Vertices assigned to faces they can "see". */
  readonly assigned = new VertexList();

  /** Vertices not (yet) assigned to any face. */
  readonly unassigned = new VertexList();

  /** All hull vertices (internal representation). */
  vertices: VertexNode[] = [];

  /** three.js `ConvexHull.setFromPoints` — needs ≥ 4 points. */
  setFromPoints(points: readonly Vector3[]): this {
    if (points.length >= 4) {
      this.makeEmpty();
      for (const point of points) {
        this.vertices.push(new VertexNode(point));
      }
      this.compute();
    }
    return this;
  }

  /** three.js `ConvexHull.setFromObject`-equivalent over flat points. */
  static fromPoints(points: readonly Vector3[]): ConvexHull {
    return new ConvexHull().setFromPoints(points);
  }

  /** `true` when `point` is inside the hull (within `tolerance`). */
  containsPoint(point: Vector3): boolean {
    for (const face of this.faces) {
      if (face.distanceToPoint(point) > this.tolerance) return false;
    }
    return true;
  }

  /**
   * Ray–hull intersection — "Fast Ray-Convex Polyhedron Intersection"
   * (Haines, Graphics Gems II). Returns the nearer hit point or `undefined`.
   */
  intersectRay(ray: Ray): Vector3 | undefined {
    const faces = this.faces;
    let tNear = -Infinity;
    let tFar = Infinity;

    for (const face of faces) {
      const vN = face.distanceToPoint(ray.origin);
      const vD = face.normal.dot(ray.direction);

      // plane can "see" the origin and ray points away/parallel → no hit
      if (vN > 0 && vD >= 0) return undefined;

      const t = vD !== 0 ? -vN / vD : 0;
      if (t <= 0) continue;

      if (vD > 0) {
        tFar = Math.min(t, tFar);
      } else {
        tNear = Math.max(t, tNear);
      }
      if (tNear > tFar) return undefined;
    }

    if (tNear !== -Infinity) {
      return ray.at(tNear);
    }
    return ray.at(tFar);
  }

  intersectsRay(ray: Ray): boolean {
    return this.intersectRay(ray) !== undefined;
  }

  makeEmpty(): this {
    this.faces = [];
    this.vertices = [];
    return this;
  }

  // ---- internals (verbatim QuickHull port) ----

  private addVertexToFace(vertex: VertexNode, face: ConvexHullFace): void {
    vertex.face = face;
    if (face.outside === null) {
      this.assigned.append(vertex);
    } else {
      this.assigned.insertBefore(face.outside, vertex);
    }
    face.outside = vertex;
  }

  private removeVertexFromFace(vertex: VertexNode, face: ConvexHullFace): void {
    if (vertex === face.outside) {
      if (vertex.next !== null && vertex.next.face === face) {
        face.outside = vertex.next;
      } else {
        face.outside = null;
      }
    }
    this.assigned.remove(vertex);
  }

  private removeAllVerticesFromFace(face: ConvexHullFace): VertexNode | undefined {
    if (face.outside !== null) {
      const start = face.outside;
      let end = face.outside;
      while (end.next !== null && end.next.face === face) {
        end = end.next;
      }
      this.assigned.removeSubList(start, end);
      start.prev = null;
      end.next = null;
      face.outside = null;
      return start;
    }
    return undefined;
  }

  private deleteFaceVertices(face: ConvexHullFace, absorbingFace?: ConvexHullFace): void {
    const faceVertices = this.removeAllVerticesFromFace(face);
    if (faceVertices !== undefined) {
      if (absorbingFace === undefined) {
        this.unassigned.appendChain(faceVertices);
      } else {
        let vertex: VertexNode | null = faceVertices;
        do {
          const nextVertex: VertexNode | null = vertex.next;
          const distance = absorbingFace.distanceToPoint(vertex.point);
          if (distance > this.tolerance) {
            this.addVertexToFace(vertex, absorbingFace);
          } else {
            this.unassigned.append(vertex);
          }
          vertex = nextVertex;
        } while (vertex !== null);
      }
    }
  }

  private resolveUnassignedPoints(newFaces: ConvexHullFace[]): void {
    if (!this.unassigned.isEmpty()) {
      let vertex = this.unassigned.first();
      do {
        const nextVertex = vertex!.next;
        let maxDistance = this.tolerance;
        let maxFace: ConvexHullFace | null = null;
        for (const face of newFaces) {
          if (face.mark === Visible) {
            const distance = face.distanceToPoint(vertex!.point);
            if (distance > maxDistance) {
              maxDistance = distance;
              maxFace = face;
            }
            if (maxDistance > 1000 * this.tolerance) break;
          }
        }
        if (maxFace !== null) {
          this.addVertexToFace(vertex!, maxFace);
        }
        vertex = nextVertex;
      } while (vertex !== null);
    }
  }

  private computeExtremes(): { min: VertexNode[]; max: VertexNode[] } {
    const minVertices: VertexNode[] = [];
    const maxVertices: VertexNode[] = [];
    const min = this.vertices[0]!.point.toArray();
    const max = this.vertices[0]!.point.toArray();
    for (let i = 0; i < 3; i += 1) {
      minVertices[i] = this.vertices[0]!;
      maxVertices[i] = this.vertices[0]!;
    }
    for (const vertex of this.vertices) {
      const point = vertex.point;
      for (let j = 0; j < 3; j += 1) {
        if (point.getComponent(j) < min[j]!) {
          min[j] = point.getComponent(j);
          minVertices[j] = vertex;
        }
      }
      for (let j = 0; j < 3; j += 1) {
        if (point.getComponent(j) > max[j]!) {
          max[j] = point.getComponent(j);
          maxVertices[j] = vertex;
        }
      }
    }
    this.tolerance =
      3 * Number.EPSILON *
      (Math.max(Math.abs(min[0]!), Math.abs(max[0]!)) +
        Math.max(Math.abs(min[1]!), Math.abs(max[1]!)) +
        Math.max(Math.abs(min[2]!), Math.abs(max[2]!)));
    return { min: minVertices, max: maxVertices };
  }

  private computeInitialHull(): void {
    const vertices = this.vertices;
    const extremes = this.computeExtremes();
    const min = extremes.min;
    const max = extremes.max;

    // 1. v0/v1: greatest 1D separation
    let maxDistance = 0;
    let index = 0;
    for (let i = 0; i < 3; i += 1) {
      const distance = max[i]!.point.getComponent(i) - min[i]!.point.getComponent(i);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    const v0 = min[index]!;
    const v1 = max[index]!;
    let v2: VertexNode | undefined;
    let v3: VertexNode | undefined;

    // 2. v2: farthest from line v0–v1
    maxDistance = 0;
    const line3 = new Line3(v0.point, v1.point);
    for (const vertex of vertices) {
      if (vertex !== v0 && vertex !== v1) {
        const closest = line3.closestPointToPoint(vertex.point, true);
        const distance = closest.distanceToSquared(vertex.point);
        if (distance > maxDistance) {
          maxDistance = distance;
          v2 = vertex;
        }
      }
    }

    // 3. v3: farthest from plane v0,v1,v2
    maxDistance = -1;
    const plane = Plane.fromCoplanarPoints(v0.point, v1.point, v2!.point);
    for (const vertex of vertices) {
      if (vertex !== v0 && vertex !== v1 && vertex !== v2) {
        const distance = Math.abs(plane.distanceToPoint(vertex.point));
        if (distance > maxDistance) {
          maxDistance = distance;
          v3 = vertex;
        }
      }
    }

    const faces: ConvexHullFace[] = [];
    if (plane.distanceToPoint(v3!.point) < 0) {
      faces.push(
        ConvexHullFace.create(v0, v1, v2!),
        ConvexHullFace.create(v3!, v1, v0),
        ConvexHullFace.create(v3!, v2!, v1),
        ConvexHullFace.create(v3!, v0, v2!)
      );
      for (let i = 0; i < 3; i += 1) {
        const j = (i + 1) % 3;
        faces[i + 1]!.getEdge(2).setTwin(faces[0]!.getEdge(j));
        faces[i + 1]!.getEdge(1).setTwin(faces[j + 1]!.getEdge(0));
      }
    } else {
      faces.push(
        ConvexHullFace.create(v0, v2!, v1),
        ConvexHullFace.create(v3!, v0, v1),
        ConvexHullFace.create(v3!, v1, v2!),
        ConvexHullFace.create(v3!, v2!, v0)
      );
      for (let i = 0; i < 3; i += 1) {
        const j = (i + 1) % 3;
        faces[i + 1]!.getEdge(2).setTwin(faces[0]!.getEdge((3 - i) % 3));
        faces[i + 1]!.getEdge(0).setTwin(faces[j + 1]!.getEdge(1));
      }
    }

    for (const face of faces) {
      this.faces.push(face);
    }

    // initial assignment of vertices to the tetrahedron faces
    for (const vertex of vertices) {
      if (vertex !== v0 && vertex !== v1 && vertex !== v2 && vertex !== v3) {
        maxDistance = this.tolerance;
        let maxFace: ConvexHullFace | null = null;
        for (let j = 0; j < 4; j += 1) {
          const distance = this.faces[j]!.distanceToPoint(vertex.point);
          if (distance > maxDistance) {
            maxDistance = distance;
            maxFace = this.faces[j]!;
          }
        }
        if (maxFace !== null) {
          this.addVertexToFace(vertex, maxFace);
        }
      }
    }
  }

  private reindexFaces(): void {
    const activeFaces: ConvexHullFace[] = [];
    for (const face of this.faces) {
      if (face.mark === Visible) {
        activeFaces.push(face);
      }
    }
    this.faces = activeFaces;
  }

  private nextVertexToAdd(): VertexNode | undefined {
    if (!this.assigned.isEmpty()) {
      let eyeVertex: VertexNode | undefined;
      let maxDistance = 0;
      const eyeFace = this.assigned.first()!.face!;
      let vertex: VertexNode | null = eyeFace.outside;
      do {
        const distance = eyeFace.distanceToPoint(vertex!.point);
        if (distance > maxDistance) {
          maxDistance = distance;
          eyeVertex = vertex!;
        }
        vertex = vertex!.next;
      } while (vertex !== null && vertex.face === eyeFace);
      return eyeVertex;
    }
    return undefined;
  }

  private computeHorizon(eyePoint: Vector3, crossEdge: HalfEdge | null, face: ConvexHullFace, horizon: HalfEdge[]): void {
    this.deleteFaceVertices(face);
    face.mark = Deleted;
    let edge: HalfEdge;
    let cross = crossEdge;
    if (cross === null) {
      cross = face.getEdge(0);
      edge = cross;
    } else {
      edge = cross.next!;
    }
    do {
      const twinEdge = edge.twin!;
      const oppositeFace = twinEdge.face;
      if (oppositeFace.mark === Visible) {
        if (oppositeFace.distanceToPoint(eyePoint) > this.tolerance) {
          this.computeHorizon(eyePoint, twinEdge, oppositeFace, horizon);
        } else {
          horizon.push(edge);
        }
      }
      edge = edge.next!;
    } while (edge !== cross);
  }

  private addAdjoiningFace(eyeVertex: VertexNode, horizonEdge: HalfEdge): HalfEdge {
    const face = ConvexHullFace.create(eyeVertex, horizonEdge.tail()!, horizonEdge.head());
    this.faces.push(face);
    face.getEdge(-1).setTwin(horizonEdge.twin!);
    return face.getEdge(0);
  }

  private addNewFaces(eyeVertex: VertexNode, horizon: HalfEdge[]): void {
    this.newFaces = [];
    let firstSideEdge: HalfEdge | null = null;
    let previousSideEdge: HalfEdge | null = null;
    for (const horizonEdge of horizon) {
      const sideEdge = this.addAdjoiningFace(eyeVertex, horizonEdge);
      if (firstSideEdge === null) {
        firstSideEdge = sideEdge;
      } else {
        sideEdge.next!.setTwin(previousSideEdge!);
      }
      this.newFaces.push(sideEdge.face);
      previousSideEdge = sideEdge;
    }
    firstSideEdge!.next!.setTwin(previousSideEdge!);
  }

  private addVertexToHull(eyeVertex: VertexNode): void {
    const horizon: HalfEdge[] = [];
    this.unassigned.clear();
    this.removeVertexFromFace(eyeVertex, eyeVertex.face!);
    this.computeHorizon(eyeVertex.point, null, eyeVertex.face!, horizon);
    this.addNewFaces(eyeVertex, horizon);
    this.resolveUnassignedPoints(this.newFaces);
  }

  private cleanup(): void {
    this.assigned.clear();
    this.unassigned.clear();
    this.newFaces = [];
  }

  compute(): this {
    this.computeInitialHull();
    let vertex: VertexNode | undefined;
    while ((vertex = this.nextVertexToAdd()) !== undefined) {
      this.addVertexToHull(vertex);
    }
    this.reindexFaces();
    this.cleanup();
    return this;
  }
}

/** Hull face — holds a half-edge loop plus plane data. */
export class ConvexHullFace {
  normal = new Vector3(0, 0, 0);
  midpoint = new Vector3(0, 0, 0);
  area = 0;
  constant = 0;
  outside: VertexNode | null = null;
  mark = Visible;
  edge: HalfEdge | null = null;

  static create(a: VertexNode, b: VertexNode, c: VertexNode): ConvexHullFace {
    const face = new ConvexHullFace();
    const e0 = new HalfEdge(a, face);
    const e1 = new HalfEdge(b, face);
    const e2 = new HalfEdge(c, face);
    e0.next = e2.prev = e1;
    e1.next = e0.prev = e2;
    e2.next = e1.prev = e0;
    face.edge = e0;
    return face.compute();
  }

  getEdge(i: number): HalfEdge {
    let edge = this.edge!;
    while (i > 0) {
      edge = edge.next!;
      i -= 1;
    }
    while (i < 0) {
      edge = edge.prev!;
      i += 1;
    }
    return edge;
  }

  compute(): this {
    const a = this.edge!.tail()!;
    const b = this.edge!.head();
    const c = this.edge!.next!.head();
    const triangle = new Triangle(a.point, b.point, c.point);
    this.normal = triangle.getNormal();
    this.midpoint = triangle.getMidpoint();
    this.area = triangle.getArea();
    this.constant = this.normal.dot(this.midpoint);
    return this;
  }

  distanceToPoint(point: Vector3): number {
    return this.normal.dot(point) - this.constant;
  }
}

/** Doubly-linked half-edge (three `HalfEdge`). */
export class HalfEdge {
  prev: HalfEdge | null = null;
  next: HalfEdge | null = null;
  twin: HalfEdge | null = null;

  constructor(
    readonly vertex: VertexNode,
    readonly face: ConvexHullFace
  ) {}

  head(): VertexNode {
    return this.vertex;
  }

  tail(): VertexNode | null {
    return this.prev ? this.prev.vertex : null;
  }

  length(): number {
    const head = this.head();
    const tail = this.tail();
    if (tail !== null) {
      return tail.point.distanceTo(head.point);
    }
    return -1;
  }

  lengthSquared(): number {
    const head = this.head();
    const tail = this.tail();
    if (tail !== null) {
      return tail.point.distanceToSquared(head.point);
    }
    return -1;
  }

  setTwin(edge: HalfEdge): this {
    this.twin = edge;
    edge.twin = this;
    return this;
  }
}

/** Doubly-linked vertex node (three `VertexNode`). */
export class VertexNode {
  prev: VertexNode | null = null;
  next: VertexNode | null = null;
  face: ConvexHullFace | null = null;

  constructor(readonly point: Vector3) {}
}

/** Doubly-linked vertex list (three `VertexList`). */
export class VertexList {
  head: VertexNode | null = null;
  tail: VertexNode | null = null;

  first(): VertexNode | null {
    return this.head;
  }

  last(): VertexNode | null {
    return this.tail;
  }

  clear(): this {
    this.head = this.tail = null;
    return this;
  }

  insertBefore(target: VertexNode, vertex: VertexNode): this {
    vertex.prev = target.prev;
    vertex.next = target;
    if (vertex.prev === null) {
      this.head = vertex;
    } else {
      vertex.prev.next = vertex;
    }
    target.prev = vertex;
    return this;
  }

  insertAfter(target: VertexNode, vertex: VertexNode): this {
    vertex.prev = target;
    vertex.next = target.next;
    if (vertex.next === null) {
      this.tail = vertex;
    } else {
      vertex.next.prev = vertex;
    }
    target.next = vertex;
    return this;
  }

  append(vertex: VertexNode): this {
    if (this.head === null) {
      this.head = vertex;
    } else {
      this.tail!.next = vertex;
    }
    vertex.prev = this.tail;
    vertex.next = null;
    this.tail = vertex;
    return this;
  }

  appendChain(vertex: VertexNode): this {
    if (this.head === null) {
      this.head = vertex;
    } else {
      this.tail!.next = vertex;
    }
    vertex.prev = this.tail;
    let v = vertex;
    while (v.next !== null) {
      v = v.next;
    }
    this.tail = v;
    return this;
  }

  remove(vertex: VertexNode): this {
    if (vertex.prev === null) {
      this.head = vertex.next;
    } else {
      vertex.prev.next = vertex.next;
    }
    if (vertex.next === null) {
      this.tail = vertex.prev;
    } else {
      vertex.next.prev = vertex.prev;
    }
    return this;
  }

  removeSubList(a: VertexNode, b: VertexNode): this {
    if (a.prev === null) {
      this.head = b.next;
    } else {
      a.prev.next = b.next;
    }
    if (b.next === null) {
      this.tail = a.prev;
    } else {
      b.next.prev = a.prev;
    }
    return this;
  }

  isEmpty(): boolean {
    return this.head === null;
  }
}
