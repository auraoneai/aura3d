/**
 * Story captions on the game clock. `tick(dt)` is only called while the walk runs (not on the title card, not while
 * paused, not in a hidden tab), so a sequence waits with the game and a caption's display time does not run out
 * during a pause. `say` shows one line now and cancels the rest of any sequence, so a letter or the bell always
 * replaces the intro; `clear` cancels everything (leaving the epilogue, starting a new walk).
 */
export interface CaptionSink {
  show(text: string): void;
  hide(): void;
}

export interface CaptionCue {
  readonly text: string;
  /** Seconds on the game clock after `play` is called. */
  readonly at: number;
  /** Seconds the line stays up. */
  readonly seconds: number;
}

export interface CaptionQueue {
  play(cues: readonly CaptionCue[]): void;
  say(text: string, seconds: number): void;
  clear(): void;
  tick(dt: number): void;
  /** The line on screen, or null. */
  readonly current: string | null;
  /** Cues still waiting. */
  readonly pending: number;
}

export function createCaptionQueue(sink: CaptionSink): CaptionQueue {
  let clock = 0;
  let queue: { text: string; at: number; seconds: number }[] = [];
  let current: { text: string; until: number } | null = null;

  const show = (text: string, seconds: number): void => {
    current = { text, until: clock + seconds };
    sink.show(text);
  };
  const flush = (): void => {
    while (queue.length > 0 && queue[0]!.at <= clock + 1e-9) {
      const cue = queue.shift()!;
      show(cue.text, cue.seconds);
    }
    if (current && clock >= current.until - 1e-9) {
      current = null;
      sink.hide();
    }
  };

  return {
    get current() { return current?.text ?? null; },
    get pending() { return queue.length; },
    play(cues) {
      queue = cues.map((c) => ({ text: c.text, at: clock + Math.max(0, c.at), seconds: c.seconds })).sort((a, b) => a.at - b.at);
      flush();
    },
    say(text, seconds) {
      queue = [];
      show(text, seconds);
    },
    clear() {
      queue = [];
      if (current) { current = null; sink.hide(); }
    },
    tick(dt) {
      if (!(dt > 0)) return;
      clock += dt;
      flush();
    }
  };
}
