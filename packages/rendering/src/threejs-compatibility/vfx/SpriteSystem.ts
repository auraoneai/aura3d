export interface V5Sprite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export class SpriteSystemV5 {
  readonly sprites: V5Sprite[] = [];

  add(sprite: V5Sprite): void {
    this.sprites.push(sprite);
  }
}
