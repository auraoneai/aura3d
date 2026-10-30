/**
 * Gridlock Courier (GU47 WP-28 GC-H2): three SDF district banners hung 7.5 m over a north-south avenue at mid-block,
 * facing +z (the face drivers heading -z see). Static: a panel box and one `text3D` SDF node each, 6 draws in all
 * (the row's +6 cap). Shift look only. Text is centred on the panel with the board helpers.
 */
import { material, primitives, text3D } from "@aura3d/engine";
import { BOARD, textOrigin, textWidth } from "./board";
import { districtOf, PITCH, type District } from "./world";

export interface Banner { text: string; x: number; z: number; panel: string }
export const BANNER = { size: 1.2, y: 7.5, height: 1.8, pad: 1.6 } as const;
export const BANNERS: readonly Banner[] = [
  { text: "DOWNTOWN", x: -PITCH / 2, z: -PITCH, panel: "#2f4a52" }, // core towers (sea-glass)
  { text: "OLD TOWN", x: -3.5 * PITCH, z: 0, panel: "#3c5a4e" }, // residential (mint)
  { text: "HARBOUR", x: 3.5 * PITCH, z: 0, panel: "#5a3328" } // commerce (terracotta)
];

/** The district the banner hangs in (the block on its +x side). */
export const bannerDistrict = (b: Banner): District => districtOf(Math.round((b.x + PITCH / 2) / PITCH), Math.round(b.z / PITCH));

export function bannerNodes() {
  return BANNERS.flatMap((b, k) => {
    const width = textWidth(b.text, BANNER.size);
    const pose = { x: b.x, y: BANNER.y, z: b.z, yaw: 0 };
    const o = textOrigin(pose, width, BANNER.size);
    return [
      primitives.box({ name: `banner-${k}`, size: [width + BANNER.pad, BANNER.height, BOARD.panel[2]], position: [b.x, BANNER.y, b.z], material: material.emissive({ color: b.panel, emissive: b.panel, emissiveIntensity: 0.35 }), castShadow: false, receiveShadow: false }),
      text3D(b.text, { name: `banner-${k}-text`, size: BANNER.size, depth: 0.05, backend: "sdf", material: material.emissive({ color: "#efe3cf", emissive: "#efe3cf", emissiveIntensity: 1.2 }), castShadow: false, receiveShadow: false }).position(o[0], o[1], o[2])
    ];
  });
}
