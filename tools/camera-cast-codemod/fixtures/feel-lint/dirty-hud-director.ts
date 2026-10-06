// fighting-game pattern (:322,:361): director output goes to the HUD only.
export function round(game: any, dt: number, hud: any) {
  const director = game.cameraDirector();
  const frame = director.update(dt);
  hud.setText(frame.title);
  diagnostics.push({ directorFrame: frame });
}
declare const diagnostics: { push(e: unknown): void };
