// PRD-13 §17.2 — template-look-floor harness loader.
// Imports the requested template's real `src/main.ts`; the template self-mounts
// (createGame owns mount/lifecycle) and registers its app in __AURA3D_LIVE_APPS__.
export {};

const template = new URLSearchParams(location.search).get("template");

declare global {
  interface Window {
    __AURA3D_LOOK_FLOOR_HARNESS__?: { template: string | null; imported: boolean; error?: string };
  }
}

window.__AURA3D_LOOK_FLOOR_HARNESS__ = { template, imported: false };

if (!template) {
  window.__AURA3D_LOOK_FLOOR_HARNESS__.error = "missing ?template=<id> query param";
} else {
  try {
    // @vite-ignore — resolved by the dev server at runtime against the workspace copy
    // (packages/create-aura3d/templates/<id>, the shipped-mirror copy).
    await import(/* @vite-ignore */ `/packages/create-aura3d/templates/${template}/src/main.ts`);
    window.__AURA3D_LOOK_FLOOR_HARNESS__.imported = true;
  } catch (error) {
    window.__AURA3D_LOOK_FLOOR_HARNESS__.error = error instanceof Error ? error.message : String(error);
  }
}
