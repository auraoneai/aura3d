import { createRecastNavigation } from "../../packages/navigation-recast/src/index.js";

interface BuildMessage { readonly positions: number[]; readonly indices: number[] }

self.onmessage = async (event: MessageEvent<BuildMessage>) => {
  const started = performance.now();
  const navigation = await createRecastNavigation();
  const mesh = navigation.generateSolo(event.data, {});
  const bytes = mesh.serialize();
  mesh.dispose();
  self.postMessage({ pass: true, bytes, generationMs: performance.now() - started }, { transfer: [bytes.buffer] });
};
