/**
 * Meshy-generated models (text prompts only, through Kiro Prism) for the tram, passengers, townhouses, clock tower,
 * lighthouse, crates and street lamps. Prompts, task ids and credits are in PORTING-NOTES.md and
 * `assets/provenance/*`. Same-origin pathnames with sha256 hashes: the production bridge refuses http(s) model URLs.
 * `?procedural=1` falls back to the code-built stand-ins.
 */
import { defineModelAssets, model } from "@aura3d/engine";

const LICENSE = "Meshy generated asset (AuraOne Meshy account plan terms at generation time), original text prompt, 2026-10-23";
const entry = (file: string, sha256: string) => ({ url: new URL(`./assets/meshy/${file}`, import.meta.url).pathname, sha256 });

export const MESHY_ASSETS = defineModelAssets({
  tram: entry("tram.glb", "5de647e625490fa139d3fa4e3b83276114a4a2b58c321a00ccdf983e7292f89c"),
  paxEasy: entry("pax-easy.glb", "37f865b022634e9ece058f177e102c9e788f4ad4b0c37a11b478d51e47a039a3"),
  paxSightseer: entry("pax-sightseer.glb", "09879bab49364c70ee844b31531170a99db9e63d0977fa91f75df8c5d37dad94"),
  paxRushed: entry("pax-rushed.glb", "fdf52973e49d3daed261fb2aea1ef3d1c688547c84bae2d824e10cd0e33d4402"),
  paxSleeper: entry("pax-sleeper2.glb", "e092ce387e6feb975b1a484c8b03980016bc92f03fd3496f3112db92e5538ccb"),
  houseCream: entry("house-cream.glb", "28a191c2a6ee3bccd3ebb1ce6a5df8e7057fe5838f0210f6b760b93589b1649e"),
  houseOchre: entry("house-ochre.glb", "1d9070594cd823195ec2d3458f10c69aeccf8e21e5ad391c1a80f2ed1ef9b3c1"),
  houseBlue: entry("house-blue.glb", "46cb282e97d521fd6409c319e12152548d861a950c00cbc05d11f2c9916cb8c5"),
  clockTower: entry("clock-tower.glb", "2655ad824c490d3965273acfab2c12292fc8a1af82b328d85a749f09f42437be"),
  lighthouse: entry("lighthouse.glb", "d950164609a9857961db4e5bb1862066d502b7b43417c44e65d91d80039982ae"),
  crates: entry("crates.glb", "e037dd6cb054c0f67e03521f6e992ac920852b11467a1c7801706af5d3c3dc46"),
  lamp: entry("lamp.glb", "66bb1e5bc3780484e52f5836034afe53fdcd08872720984c78672ac9abe77204")
}, { license: LICENSE, queryParam: null }).refs;

export const MESHY_ENABLED = !(typeof location !== "undefined" && /[?&]procedural=1\b/.test(location.search));

/** Raw bounds of every GLB are centred on the origin with the longest side 1.9 (Meshy normalisation). */
export const MODEL_HALF = { tram: [0.951, 0.58, 0.335], pax: 0.951, house: 0.951 } as const;

/** Tram body: long axis is model X, mapped onto tram-local +Z; stretched to the sim's 10.4 m length. */
export const TRAM = {
  yaw: -Math.PI / 2,
  scale: [5.47, 3.8, 5.1] as const,
  /** model centre height above the pose point, in tram-local metres */
  centerY: 2.15,
  /** standing floor inside the tram, tram-local metres */
  floorY: 0.8
};

export const PAX_SCALE = 0.85;

export { model };
