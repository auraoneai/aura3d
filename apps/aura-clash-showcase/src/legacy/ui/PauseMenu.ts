export interface PauseMenuAction {
  id: string;
  label: string;
  keyboardShortcut: string;
  description: string;
}

export const pauseMenuActions: PauseMenuAction[] = [
  {
    id: "resume",
    label: "Resume",
    keyboardShortcut: "P",
    description: "Return to the current round without resetting state.",
  },
  {
    id: "restart",
    label: "Restart round",
    keyboardShortcut: "R",
    description: "Reset health, guard, meter, timer, combo, and result state.",
  },
  {
    id: "reduced-motion",
    label: "Reduced motion",
    keyboardShortcut: "UI toggle",
    description: "Reduce camera shake, dash motion, and heavy transition effects.",
  },
  {
    id: "reduced-flash",
    label: "Reduced flash",
    keyboardShortcut: "UI toggle",
    description: "Suppress high-intensity hit flashes and super impact bursts.",
  },
  {
    id: "high-contrast",
    label: "High contrast",
    keyboardShortcut: "UI toggle",
    description: "Raise text, border, and health/meter contrast for readability.",
  },
];
