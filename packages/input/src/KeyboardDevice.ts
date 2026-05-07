export interface KeyboardEventLike {
  readonly code: string;
  readonly repeat?: boolean;
  preventDefault?(): void;
}

export class KeyboardDevice {
  private current = new Set<string>();
  private previous = new Set<string>();

  keyDown(event: KeyboardEventLike): void {
    if (!event.repeat) {
      this.current.add(event.code);
    }
  }

  keyUp(event: KeyboardEventLike): void {
    this.current.delete(event.code);
  }

  blur(): void {
    this.current.clear();
  }

  snapshotSets(): { readonly keys: ReadonlySet<string>; readonly previousKeys: ReadonlySet<string> } {
    return { keys: new Set(this.current), previousKeys: new Set(this.previous) };
  }

  endFrame(): void {
    this.previous = new Set(this.current);
  }
}
