export interface ThreeCompatSprite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export class SpriteSystemThreeCompat {
  readonly sprites: ThreeCompatSprite[] = [];

  add(sprite: ThreeCompatSprite): void {
    this.sprites.push(sprite);
  }
}
