// neon-swarm pattern (main.ts:1667-1671): camera state computed then voided.
export function tick(app: any, rig: any, dt: number) {
  const feelRig = app.camera.shake();
  const cameraState = feelRig.update(dt);
  void cameraState;
}
