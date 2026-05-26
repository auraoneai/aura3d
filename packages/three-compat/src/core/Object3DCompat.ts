import { Matrix4Compat, QuaternionCompat, Vector3Compat } from "../math";

let nextObjectId = 1;

export class Object3DCompat {
  readonly id = nextObjectId++;
  uuid: string;
  name = "";
  type = "Object3D";
  parent: Object3DCompat | null = null;
  readonly children: Object3DCompat[] = [];
  readonly position = new Vector3Compat();
  readonly rotation = new Vector3Compat();
  readonly quaternion = new QuaternionCompat();
  readonly scale = new Vector3Compat(1, 1, 1);
  readonly matrix = new Matrix4Compat();
  readonly matrixWorld = new Matrix4Compat();
  visible = true;
  userData: Record<string, unknown> = {};

  constructor() {
    this.uuid = `a3d-three-compat-${this.id}`;
  }

  add(...objects: Object3DCompat[]): this {
    for (const object of objects) {
      if (object.parent) object.parent.remove(object);
      object.parent = this;
      this.children.push(object);
    }
    return this;
  }

  remove(...objects: Object3DCompat[]): this {
    for (const object of objects) {
      const index = this.children.indexOf(object);
      if (index >= 0) {
        this.children.splice(index, 1);
        object.parent = null;
      }
    }
    return this;
  }

  traverse(callback: (object: Object3DCompat) => void): void {
    callback(this);
    for (const child of this.children) child.traverse(callback);
  }

  updateMatrixWorld(): void {
    this.matrixWorld.identity();
    for (const child of this.children) child.updateMatrixWorld();
  }
}

export class GroupCompat extends Object3DCompat {
  override type = "Group";
}

export class MeshCompat extends Object3DCompat {
  override type = "Mesh";

  constructor(public geometry: unknown = null, public material: unknown = null) {
    super();
  }
}

export class LineSegmentsCompat extends Object3DCompat {
  override type = "LineSegments";

  constructor(public geometry: unknown = null, public material: unknown = null) {
    super();
  }
}

export class PointsCompat extends Object3DCompat {
  override type = "Points";

  constructor(public geometry: unknown = null, public material: unknown = null) {
    super();
  }
}

export class SpriteCompat extends Object3DCompat {
  override type = "Sprite";

  constructor(public material: unknown = null) {
    super();
  }
}

export interface SpriteBatchInstanceCompat {
  readonly sprite: SpriteCompat;
  readonly position: readonly [number, number, number];
  readonly scale: readonly [number, number];
  readonly rotation: number;
}

export class SpriteBatchCompat extends Object3DCompat {
  override type = "SpriteBatch";
  readonly sprites: SpriteCompat[] = [];
  readonly billboardMode = "screen-aligned";

  addSprite(sprite: SpriteCompat): this {
    this.add(sprite);
    this.sprites.push(sprite);
    return this;
  }

  buildInstanceData(): readonly SpriteBatchInstanceCompat[] {
    return this.sprites.filter((sprite) => sprite.visible).map((sprite) => ({
      sprite,
      position: [sprite.position.x, sprite.position.y, sprite.position.z],
      scale: [sprite.scale.x, sprite.scale.y],
      rotation: typeof (sprite.material as { readonly rotation?: unknown } | null)?.rotation === "number"
        ? (sprite.material as { readonly rotation: number }).rotation
        : 0
    }));
  }
}
