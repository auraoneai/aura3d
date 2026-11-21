import { material, text3D, type AuraNodeBuilder, type AuraSceneNode } from "@aura3d/engine";

/**
 * H47-H1 (in-world part): the court name painted on the far apron in the court's tag colour (every court) and an SDF
 * score on the Rucker scoreboard rig (the one court with a scoreboard). The score node is rebuilt only when the score
 * text changes (`scoreboardText`), so the in-world score always equals the DOM score bug. Draws: +1 name per court,
 * +1 score at Rucker.
 */
export const SCOREBOARD_NODE_ID = "court-score-sdf";
export const COURT_NAME_NODE_ID = "court-name-paint";

export function scoreboardText(home: number, away: number, lab: boolean): string {
  return `${home}  ${lab ? "-" : away}`;
}

export function scoreboardNode(text: string): AuraNodeBuilder<AuraSceneNode> {
  return text3D(text, {
    name: SCOREBOARD_NODE_ID,
    size: 0.86,
    depth: 0.018,
    letterSpacing: 0.06,
    backend: "sdf",
    material: material.emissive({ color: "#2c1705", emissive: "#ffd257", emissiveIntensity: 2.5, practical: true })
  }).position(0, 5.4, -12.12) as unknown as AuraNodeBuilder<AuraSceneNode>;
}

export function courtNameNode(label: string, color: string, apronZ: number): AuraNodeBuilder<AuraSceneNode> {
  return text3D(label.toUpperCase(), {
    name: COURT_NAME_NODE_ID,
    size: 0.85,
    depth: 0.004,
    letterSpacing: 0.12,
    backend: "sdf",
    material: material.pbr({ color, roughness: 0.82, opacity: 0.78 })
  }).position(0, 0.018, apronZ).rotate(-Math.PI / 2, 0, 0) as unknown as AuraNodeBuilder<AuraSceneNode>;
}
