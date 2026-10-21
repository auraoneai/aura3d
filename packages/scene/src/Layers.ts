export class Layers {
  mask = 1;

  set(channel: number): void {
    this.mask = 1 << validateChannel(channel);
  }

  enable(channel: number): void {
    this.mask |= 1 << validateChannel(channel);
  }

  enableAll(): void {
    this.mask = 0xffffffff;
  }

  toggle(channel: number): void {
    this.mask ^= 1 << validateChannel(channel);
  }

  disable(channel: number): void {
    this.mask &= ~(1 << validateChannel(channel));
  }

  disableAll(): void {
    this.mask = 0;
  }

  /** three's `layers.isEnabled` is spelled `test` per channel here. */
  isEnabled(channel: number): boolean {
    return (this.mask & (1 << validateChannel(channel))) !== 0;
  }

  test(other: Layers): boolean {
    return (this.mask & other.mask) !== 0;
  }
}

function validateChannel(channel: number): number {
  if (!Number.isInteger(channel) || channel < 0 || channel > 31) throw new Error("Layer channel must be an integer in [0, 31].");
  return channel;
}
