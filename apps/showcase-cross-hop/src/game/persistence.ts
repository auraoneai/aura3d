export interface Profile {
  best: number;
  coins: number;
  unlocked: string[];
  selected: string;
  drills: string[];
  /** The first-run objective card was shown once (CH-E2). */
  seenIntro: boolean;
}
const KEY = "crosshop.v1";
const DEF: Profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [], seenIntro: false };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEF, unlocked: [...DEF.unlocked], drills: [] };
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      best: p.best ?? 0, coins: p.coins ?? 0,
      unlocked: Array.isArray(p.unlocked) && p.unlocked.length ? p.unlocked : ["hop"],
      selected: p.selected ?? "hop",
      drills: Array.isArray(p.drills) ? p.drills : [],
      seenIntro: p.seenIntro === true
    };
  } catch { return { ...DEF, unlocked: [...DEF.unlocked], drills: [] }; }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
