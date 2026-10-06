/**
 * Authoritative visual-world / physics-surface correspondence for Siege Golf.
 *
 * `siegeGolfCourseWorld` is a static, +Y-up render asset authored in metres.
 * It deliberately does not manufacture colliders from decorative banks or the
 * castle: `createHoleSimulation()` remains the only collision owner. The
 * mapping below pins each visible gameplay-facing surface to the matching
 * stable Rapier static body created in structures.ts, which keeps all nine
 * deterministic replay solutions intact while eliminating the old flat visual
 * prototype.
 */
export const SIEGE_GOLF_WORLD_SURFACE_MAPPING = {
  asset: "siegeGolfCourseWorld",
  coordinateSystem: "+Y up; metres; world origin at the centre of the tee-to-cup lane",
  staticRenderBounds: { min: [-4.88, -0.78, -12.1], max: [4.88, 2.66, 4.5] },
  colliderOwner: "apps/showcase-siege-golf/src/structures.ts#createHoleSimulation",
  surfaces: [
    {
      rendered: "continuous causeway, mown fairway bands, flush obstacle bay and open sensor court",
      rapier: "felt",
      rule: "All ball contact resolves against the static felt plane at y=-0.1; bank relief is visual-only so per-hole physics remains deterministic."
    },
    {
      rendered: "continuous low stone coping and shield standards along the lane",
      rapier: ["wall-left", "wall-right", "wall-tee", "wall-far"],
      rule: "The visible world envelopes the low restitution rails. Invisible shell-left/right/tee/far bodies retain bounce containment above the authored wall height."
    },
    {
      rendered: "U-shaped target keep, attached obstacle buttresses and banner poles",
      rapier: "dynamic structure and sensor bodies declared per HoleDefinition",
      rule: "No decoration creates scoring. Pins, destructibles, joints, cups and sensors remain the route-local Rapier entities exposed by the evidence contract."
    }
  ]
} as const;
