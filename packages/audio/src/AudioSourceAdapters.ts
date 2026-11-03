/** Factories needed by the adapters. Native AudioContext satisfies this shape. */
export interface AudioSourceAdapterContext {
  readonly destination: AudioNode;
  createGain(): GainNode;
  createMediaElementSource?(element: HTMLMediaElement): MediaElementAudioSourceNode;
  createMediaStreamSource?(stream: MediaStream): MediaStreamAudioSourceNode;
}

/** Borrowed inputs survive disposal; owned elements are paused, streams stopped, and external nodes stopped/disconnected. */
export type AudioSourceAdapterOwnership = "borrowed" | "owned";

export interface AudioSourceAdapterOptions {
  readonly context: AudioSourceAdapterContext;
  readonly destination?: AudioNode;
  readonly ownership?: AudioSourceAdapterOwnership;
}

export interface MediaElementAudioSourceAdapterOptions extends AudioSourceAdapterOptions {
  readonly element: HTMLMediaElement;
}

export interface MediaStreamAudioSourceAdapterOptions extends AudioSourceAdapterOptions {
  readonly stream: MediaStream;
}

export interface ExternalAudioNodeAdapterOptions extends AudioSourceAdapterOptions {
  readonly node: AudioNode;
}

/**
 * Owns a private gain and its connection to the input. `disconnect()` removes
 * adapter output routes only. Disposing a borrowed input preserves its other
 * routes; disposing an owned external node disconnects all of that node's routes.
 * The adapter never unlocks an AudioContext automatically. For an element,
 * `play()` forwards its promise and must be called from an appropriate user
 * gesture when the browser requires one. For streams and external nodes,
 * `play()`/`pause()` only unmute/mute this adapter's private output; they do
 * not start, stop, or change the transport of the borrowed input. Element
 * routing remains associated with its AudioContext after disposal; create a
 * new adapter for that context to reconnect the element's audio. Element
 * playback rate and looping remain on the HTMLMediaElement; loop regions,
 * detune and scheduled start are not provided by these non-buffer adapters.
 */
export interface AudioSourceAdapter {
  readonly kind: "media-element" | "media-stream" | "external-node";
  readonly source: AudioNode;
  readonly output: GainNode;
  readonly disposed: boolean;
  play(): Promise<void>;
  pause(): void;
  connect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void;
  dispose(): void;
}

// A media element can be associated with only one source node, even across
// contexts. Keep the association after disposal so it can be reattached.
const mediaElementNodes = new WeakMap<HTMLMediaElement, { context: AudioSourceAdapterContext; source: MediaElementAudioSourceNode }>();

export function createMediaElementAudioSourceAdapter(options: MediaElementAudioSourceAdapterOptions): AudioSourceAdapter {
  validateOwnership(options.ownership);
  let entry = mediaElementNodes.get(options.element);
  if (entry && entry.context !== options.context) {
    throw new Error("Media element is already associated with another audio context");
  }
  if (!entry) {
    if (!options.context.createMediaElementSource) throw new Error("Audio context does not support media-element sources");
    entry = { context: options.context, source: options.context.createMediaElementSource(options.element) };
    mediaElementNodes.set(options.element, entry);
  }
  return makeAdapter("media-element", entry.source, options, () => {
    if (options.ownership === "owned") options.element.pause();
  }, options.element);
}

export function createMediaStreamAudioSourceAdapter(options: MediaStreamAudioSourceAdapterOptions): AudioSourceAdapter {
  validateOwnership(options.ownership);
  if (!options.context.createMediaStreamSource) throw new Error("Audio context does not support media-stream sources");
  const source = options.context.createMediaStreamSource(options.stream);
  return makeAdapter("media-stream", source, options, () => {
    if (options.ownership !== "owned") return;
    let failure: unknown;
    let failed = false;
    for (const track of options.stream.getTracks()) {
      try { track.stop(); } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
    if (failed) throw failure;
  });
}

export function createExternalAudioNodeAdapter(options: ExternalAudioNodeAdapterOptions): AudioSourceAdapter {
  validateOwnership(options.ownership);
  return makeAdapter("external-node", options.node, options, () => {
    if (options.ownership !== "owned") return;
    // Ownership of an external scheduled source includes stopping it. Some
    // nodes are not scheduled sources, and an already-ended source can reject.
    const stoppable = options.node as AudioNode & { stop?: () => void };
    if (typeof stoppable.stop === "function") {
      try { stoppable.stop(); } catch { /* already stopped or not started */ }
    }
    options.node.disconnect();
  });
}

function makeAdapter(
  kind: AudioSourceAdapter["kind"],
  source: AudioNode,
  options: AudioSourceAdapterOptions,
  release: () => void,
  element?: HTMLMediaElement
): AudioSourceAdapter {
  const output = options.context.createGain();
  try {
    source.connect(output);
    output.connect(options.destination ?? options.context.destination);
  } catch (error) {
    try { source.disconnect(output); } catch { /* connection was not created */ }
    output.disconnect();
    throw error;
  }
  const destinations = new Set<AudioNode>();
  destinations.add(options.destination ?? options.context.destination);
  let disposed = false;
  return {
    kind,
    source,
    output,
    get disposed() { return disposed; },
    async play() {
      if (disposed) throw new Error("Cannot play a disposed audio adapter");
      if (element) {
        await element.play();
        if (disposed && options.ownership === "owned") element.pause();
      }
      else output.gain.value = 1;
    },
    pause() {
      if (disposed) throw new Error("Cannot pause a disposed audio adapter");
      if (element) element.pause();
      else output.gain.value = 0;
    },
    connect(destination) {
      if (disposed) throw new Error("Cannot connect a disposed audio adapter");
      if (!destinations.has(destination)) {
        output.connect(destination);
        destinations.add(destination);
      }
    },
    disconnect(destination) {
      if (disposed) return;
      if (destination) {
        if (destinations.delete(destination)) output.disconnect(destination);
      } else {
        output.disconnect();
        destinations.clear();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // The input can be shared; disconnect only this adapter's private gain.
      try { source.disconnect(output); } catch { /* already disconnected by its owner */ }
      try { output.disconnect(); }
      finally {
        destinations.clear();
        release();
      }
    }
  };
}

function validateOwnership(value: AudioSourceAdapterOwnership | undefined): void {
  if (value !== undefined && value !== "borrowed" && value !== "owned") {
    throw new TypeError("Audio adapter ownership must be 'borrowed' or 'owned'");
  }
}
