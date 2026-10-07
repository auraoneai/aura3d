// D-1/D-3 spec-conformant usage: feel reaches the frame.
export function frame(app: any, dt: number) {
  app.camera.use("chase", { subject: "hero" });
  app.feel.preset("arcade");
  app.feel.emit("land", { strength: 0.6 });
  const rig = game.cameraRig({ kind: "follow" });
  const pose = rig.update(dt);
  app.camera.use(rig.id, { pose });
}
declare const game: any;
