export type HexColor = `#${string}`;

export type FighterColorPalette = Readonly<{
  displayName: string;
  primary: HexColor;
  secondary: HexColor;
  accent: HexColor;
  aura: HexColor;
  hud: HexColor;
}>;

export type FighterPortraitProfile = Readonly<{
  camera: string;
  background: string;
  expression: string;
}>;

export type FighterVfxProfile = Readonly<{
  aura: string;
  trail: string;
  impact: string;
  guard: string;
  signature: string;
}>;

export type FighterVisualProfile = Readonly<{
  palette: FighterColorPalette;
  silhouette: readonly string[];
  materials: readonly string[];
  motifs: readonly string[];
  idlePose: string;
  introPose: string;
  victoryPose: string;
  portrait: FighterPortraitProfile;
  vfx: FighterVfxProfile;
}>;

