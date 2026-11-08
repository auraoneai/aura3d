import { defineConfig } from "vite";
import { auraDecodersPlugin } from "@aura3d/assets/vite";

// F-05-04 (05-PKG): ship + serve the decoder vendor tree at /aura-decoders/
// so compressed (KTX2/draco/meshopt) GLBs decode same-origin with correct
// MIME in both `vite dev` and `vite preview`/deployed builds.
export default defineConfig({ plugins: [auraDecodersPlugin()] });
