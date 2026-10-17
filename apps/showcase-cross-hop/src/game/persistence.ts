export interface Profile {
  best: number;
  coins: number;
  unlocked: string[];
  selected: string;
  drills: string[];
}
const KEY = "crosshop.v1";
const DEF: Profile = { best: 0, coins: 0, unlocked: ["hop"], selected: "hop", drills: [] };

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEF };
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      best: p.best ?? 0, coins: p.coins ?? 0,
      unlocked: Array.isArray(p.unlocked) && p.unlocked.length ? p.unlocked : ["hop"],
      selected: p.selected ?? "hop",
      drills: Array.isArray(p.drills) ? p.drills : []
    };
  } catch { return { ...DEF }; }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
