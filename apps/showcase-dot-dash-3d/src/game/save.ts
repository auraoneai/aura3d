// Glint Courier — localStorage profile: best score, per-board bests, settings.

export interface Profile {
  best: number;
  mazeBest: Record<string, number>;
  cleared: string[];            // maze ids ever cleared
  dashEnabled: boolean;
  orbColor: string;             // surge tint (Courier Studio)
  trailColor: string;           // player trail tint (Player Studio)
  cameraDefault: "follow" | "overhead";
  mazesPlayed: number;
}

const KEY = "dotdash3d.v1";
const DEF: Profile = {
  best: 0,
  mazeBest: {},
  cleared: [],
  dashEnabled: true,
  orbColor: "#5ff3ff",
  trailColor: "#ffb23e",
  cameraDefault: "overhead",
  mazesPlayed: 0
};

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEF, mazeBest: {}, cleared: [] };
    const p = JSON.parse(raw) as Partial<Profile>;
    return {
      best: p.best ?? 0,
      mazeBest: typeof p.mazeBest === "object" && p.mazeBest ? { ...p.mazeBest } : {},
      cleared: Array.isArray(p.cleared) ? p.cleared : [],
      dashEnabled: p.dashEnabled !== false,
      orbColor: typeof p.orbColor === "string" ? p.orbColor : DEF.orbColor,
      trailColor: typeof p.trailColor === "string" ? p.trailColor : DEF.trailColor,
      cameraDefault: p.cameraDefault === "overhead" ? "overhead" : "follow",
      mazesPlayed: p.mazesPlayed ?? 0
    };
  } catch { return { ...DEF, mazeBest: {}, cleared: [] }; }
}

export function saveProfile(p: Profile): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
