export interface AudioClipOptions {
  readonly name?: string;
  readonly buffer: AudioBuffer;
}

export class AudioClip {
  readonly name?: string;
  readonly buffer: AudioBuffer;

  constructor(options: AudioClipOptions) {
    this.name = options.name;
    this.buffer = options.buffer;
  }

  get duration(): number {
    return this.buffer.duration;
  }

  get channels(): number {
    return this.buffer.numberOfChannels;
  }

  get sampleRate(): number {
    return this.buffer.sampleRate;
  }
}
