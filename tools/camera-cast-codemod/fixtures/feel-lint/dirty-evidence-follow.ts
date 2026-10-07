// mini-game pattern (templates/mini-game/src/main.ts:214): cameraRig.follow
// result lives only inside the evidence payload.
export function frame(app: any, game: any, focus: number[], dt: number) {
  const rig = game.cameraRig({ kind: "follow" });
  publishEvidence({ camera: rig.follow(focus, dt), score: 0 });
}
declare function publishEvidence(e: unknown): void;
