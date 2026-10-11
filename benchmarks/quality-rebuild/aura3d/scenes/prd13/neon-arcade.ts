/**
 * Lane prd13 adapter (aura3d): `prd13-neon-arcade`. With `looks` on (from the
 * page's `a3d-qr` list) the `neon-arcade` look is authored through the public
 * `looks.preset`; all flags on emit the v1 look node, which must lower to the
 * same renderable children. Flag off renders the base spec unchanged.
 */
import { looks, resolveQrFlags } from "@aura3d/engine";
import { getPrd13Scene } from "../../../scenes/prd13/index";
import { runAuraScene, type RunOptions } from "../../common";

export default (host: HTMLElement, opts: RunOptions = {}) =>
  runAuraScene(getPrd13Scene("prd13-neon-arcade"), host, {
    ...opts,
    extraNodes: () => {
      const url = typeof location === "undefined" ? undefined : location.href;
      return resolveQrFlags({ url }).on("A3D_QR_LOOKS") ? [looks.preset("neon-arcade").toJSON()] : [];
    }
  });
