/**
 * C-19 — pose package subpath (CONTRACTS.md). Provider: PRD 06. Flag: A3D_QR_ANIMATION.
 * `@aura3d/animation/pose` — PoseMixer, inertializer, blend trees, IK,
 * retargeting (PRD 06 real). PR 0a ships the subpath with a stubbed API shape.
 */

export interface AuraPoseTransform { readonly position: readonly [number, number, number]; readonly quaternion: readonly [number, number, number, number]; readonly scale: readonly [number, number, number]; }
export interface AuraPose { readonly bones: Readonly<Record<string, AuraPoseTransform>>; readonly rootMotion?: AuraPoseTransform; }
export interface PoseMixerOptions { readonly restPose?: AuraPose; readonly inertialization?: boolean; }
export interface PoseMixer { sample(time: number): AuraPose; blend(a: AuraPose, b: AuraPose, alpha: number): AuraPose; }

/** PR 0a stub: blends linearly between two poses; sampling an empty pose returns the rest pose. */
export function createPoseMixer(_options: PoseMixerOptions = {}): PoseMixer {
  return {
    sample: (_time: number) => _options.restPose ?? { bones: {} },
    blend: (a: AuraPose, b: AuraPose, alpha: number) => {
      const bones: Record<string, AuraPoseTransform> = { ...a.bones };
      for (const [name, t] of Object.entries(b.bones)) {
        const prev = bones[name];
        if (!prev) { bones[name] = t; continue; }
        bones[name] = {
          position: [
            prev.position[0] + (t.position[0] - prev.position[0]) * alpha,
            prev.position[1] + (t.position[1] - prev.position[1]) * alpha,
            prev.position[2] + (t.position[2] - prev.position[2]) * alpha
          ],
          quaternion: [
            prev.quaternion[0] + (t.quaternion[0] - prev.quaternion[0]) * alpha,
            prev.quaternion[1] + (t.quaternion[1] - prev.quaternion[1]) * alpha,
            prev.quaternion[2] + (t.quaternion[2] - prev.quaternion[2]) * alpha,
            prev.quaternion[3] + (t.quaternion[3] - prev.quaternion[3]) * alpha
          ],
          scale: [
            prev.scale[0] + (t.scale[0] - prev.scale[0]) * alpha,
            prev.scale[1] + (t.scale[1] - prev.scale[1]) * alpha,
            prev.scale[2] + (t.scale[2] - prev.scale[2]) * alpha
          ]
        };
      }
      return { bones, rootMotion: a.rootMotion ?? b.rootMotion };
    }
  };
}
