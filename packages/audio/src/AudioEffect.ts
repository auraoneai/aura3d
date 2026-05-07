export interface AudioEffect {
  readonly input: AudioNode;
  readonly output: AudioNode;
  connect(destination: AudioNode): AudioNode;
  disconnect(): void;
  dispose(): void;
}
