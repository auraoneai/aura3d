/**
 * First-visit coach card (C17). The live page drops a new player straight onto court; this card explains the serve and the
 * rally once, in the words the court call already uses ("YOUR SERVE · SPACE TO TOSS", "PRESS SPACE AS BALL RISES INTO
 * CIRCLE"), with the player's own key labels. It does not pause the match (the serve waits for the player anyway), closes
 * after the first point, after three swings or on its button, and is shown once per browser.
 */
export interface CoachDeps {
  /** Container the card is appended to (`.game-shell`). */
  host: HTMLElement | null;
  /** The bound hit key ("SPACE", or "HIT" on touch). */
  hitKey: () => string;
  /** Movement keys as shown in help copy ("arrows/WASD" by default). */
  moveKeys: () => string;
  /** Short/deep preset keys ("Q", "E"). */
  presetKeys: () => readonly [string, string];
  touch: () => boolean;
  /** False for embeds, the Auto player and QA captures that asked for it. */
  allowed: () => boolean;
  storage: { get(): string | null; set(value: string): void };
}

export interface Coach {
  maybeShow(): boolean;
  swung(): void;
  pointPlayed(): void;
  readonly visible: boolean;
  dispose(): void;
}

export function coachSteps(hit: string, move: string, presets: readonly [string, string], touch: boolean): string[] {
  if (touch) {
    return [
      "YOUR SERVE · TAP HIT TO TOSS",
      "TAP HIT AGAIN AS THE BALL RISES INTO THE CIRCLE",
      "RALLY · SLIDE TO MOVE, TAP TO HIT WHEN THE BALL ARRIVES"
    ];
  }
  return [
    `YOUR SERVE · ${hit} TO TOSS`,
    `PRESS ${hit} AS THE BALL RISES INTO THE CIRCLE`,
    `RALLY · MOVE WITH ${move.toUpperCase()}, ${hit} TO HIT · ${presets[0]} SHORT, ${presets[1]} DEEP`
  ];
}

export function createCoach(deps: CoachDeps): Coach {
  let el: HTMLElement | null = null;
  let swings = 0;
  const close = (): void => { el?.remove(); el = null; };
  return {
    get visible() { return el !== null; },
    maybeShow() {
      if (el || !deps.host || !deps.allowed() || deps.storage.get() === "1") return false;
      deps.storage.set("1");
      el = document.createElement("aside");
      el.id = "coach-card";
      el.className = "coach-card";
      el.setAttribute("role", "note");
      el.setAttribute("aria-label", "How to play");
      const title = document.createElement("strong");
      title.textContent = "HOW TO PLAY";
      const list = document.createElement("ol");
      for (const step of coachSteps(deps.hitKey(), deps.moveKeys(), deps.presetKeys(), deps.touch())) {
        const li = document.createElement("li");
        li.textContent = step;
        list.append(li);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "GOT IT";
      button.addEventListener("click", close);
      el.append(title, list, button);
      deps.host.append(el);
      return true;
    },
    swung() { if (el && ++swings >= 3) close(); },
    pointPlayed() { close(); },
    dispose: close
  };
}
