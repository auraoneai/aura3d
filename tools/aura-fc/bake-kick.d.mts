export const CLIP_SECONDS: number;
export const CONTACT_FRAC: number;
export const FPS: number;
export const VARIANTS: Record<string, number>;
export const BALL_MODEL: [number, number, number];
export const BALL_RADIUS_MODEL: number;
export const TOE_POINT: [number, number, number];
export function bakeClips(inPath: string): { glb: any; clips: any[]; report: Record<string, unknown> };
