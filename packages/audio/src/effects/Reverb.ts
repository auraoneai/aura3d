import type { AudioContextLike } from "../AudioContextManager";
import type { AudioEffect } from "../AudioEffect";

export class ReverbEffect implements AudioEffect {
  readonly input: ConvolverNode;
  readonly output: ConvolverNode;

  constructor(context: AudioContextLike, impulse?: AudioBuffer) {
    this.input = context.createConvolver();
    this.input.buffer = impulse ?? null;
    this.output = this.input;
  }

  setImpulse(buffer: AudioBuffer): void {
    this.input.buffer = buffer;
  }

  connect(destination: AudioNode): AudioNode {
    return this.output.connect(destination);
  }

  disconnect(): void {
    this.output.disconnect();
  }

  dispose(): void {
    this.input.buffer = null;
    this.disconnect();
  }
}
