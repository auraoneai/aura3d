// A foreign React host embedding two Aura3D canvases. The host owns the data and the page; Aura3D owns
// only the two canvases. Live data goes through the imperative handle and `useAuraNodeUpdate`, never through
// scene props, so nothing remounts and `setScene` is never called after mount.
import { createElement as h, StrictMode, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { camera, lights, material, primitives, scene } from "@aura3d/engine";
import { AuraCanvas, useAuraNodeUpdate, type AuraCanvasHandle, type AuraNodePatch } from "@aura3d/react";

const counters = { appsCreated: 0, appsDisposed: 0, hostRenders: 0, handleWrites: 0, setScene: 0 };

function cubeScene() {
  return scene()
    .background("#10141a")
    .add(lights.studio({ intensity: 1.2 }))
    .add(primitives.plane({ name: "floor", size: [8, 1, 8], material: material.pbr({ color: "#3a4150", roughness: 0.6 }) }))
    .add(primitives.box({ name: "cube", material: material.pbr({ color: "#e0603a", roughness: 0.4 }) }).runtime({ id: "cube" }).position(0, 0.5, 0))
    .camera(camera.orbit({ target: [0, 0.6, 0], distance: 5.2, fov: 40 }));
}

function orbScene() {
  return scene()
    .background("#141a14")
    .add(lights.studio({ intensity: 1.2 }))
    .add(primitives.plane({ name: "floor", size: [8, 1, 8], material: material.pbr({ color: "#2f4036", roughness: 0.6 }) }))
    .add(primitives.sphere({ name: "orb", material: material.pbr({ color: "#4aa8e0", roughness: 0.25 }) }).runtime({ id: "orb" }).position(0, 0.6, 0))
    .camera(camera.orbit({ target: [0, 0.8, 0], distance: 5.2, fov: 40 }));
}

/** Runs inside canvas B: a child of AuraCanvas that pushes prop data into the live app. */
function OrbDriver(props: { readonly value: number }): null {
  const patch = useMemo<AuraNodePatch>(() => ({ position: [Math.sin(props.value * Math.PI * 2) * 1.6, 0.6 + props.value, 0], scale: 0.6 + props.value * 0.8 }), [props.value]);
  useAuraNodeUpdate("orb", patch);
  return null;
}

function CanvasA(props: { readonly value: number }): ReactElement {
  const handleRef = useRef<AuraCanvasHandle | null>(null);
  const built = useMemo(cubeScene, []);
  // Host data to the live scene: a plain effect on the host's own prop, no remount, no setScene.
  useEffect(() => {
    if (handleRef.current?.update("cube", { rotation: [0, props.value * Math.PI * 2, 0], position: [props.value * 2 - 1, 0.5, 0] })) counters.handleWrites++;
  }, [props.value]);
  return h(AuraCanvas, {
    scene: built,
    handleRef,
    className: "frame",
    onAppChange: (app) => {
      if (app) {
        counters.appsCreated++;
        // The host's first value lands as soon as the app is ready.
        handleRef.current?.update("cube", { rotation: [0, props.value * Math.PI * 2, 0], position: [props.value * 2 - 1, 0.5, 0] });
        const original = app.setScene.bind(app);
        app.setScene = ((next: Parameters<typeof original>[0]) => { counters.setScene++; return original(next); }) as typeof app.setScene;
      } else counters.appsDisposed++;
    }
  });
}

function CanvasB(props: { readonly value: number }): ReactElement {
  const built = useMemo(orbScene, []);
  return h(AuraCanvas, { scene: built, className: "frame", onAppChange: (app) => { if (app) counters.appsCreated++; else counters.appsDisposed++; } }, h(OrbDriver, { value: props.value }));
}

function Host(): ReactElement {
  counters.hostRenders++;
  const params = new URLSearchParams(location.search);
  const [value, setValue] = useState(Number(params.get("value") ?? 0.25));
  const [typed, setTyped] = useState("");
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__EMBED_HOST__ = { setValue, counters, ready: () => counters.appsCreated - counters.appsDisposed >= 2 };
    if (params.get("live") === "0") return undefined;
    // 20 Hz data feed owned by the host.
    const id = window.setInterval(() => setValue((current) => (current + 0.01) % 1), 50);
    return () => window.clearInterval(id);
  }, []);
  return h("main", null,
    h("h3", null, "Foreign React host"),
    h("input", { type: "text", placeholder: "type here: keys never reach Aura input", value: typed, onChange: (event) => setTyped(event.target.value) }),
    h("div", { className: "row" },
      h("div", { className: "panel" }, h(CanvasA, { value })),
      h("div", { className: "panel" }, h(CanvasB, { value }))),
    h("pre", { id: "counters" }, `value ${value.toFixed(2)}  host renders ${counters.hostRenders}  apps created ${counters.appsCreated}  setScene ${counters.setScene}`));
}

const root = document.querySelector("#root");
if (root) createRoot(root).render(h(StrictMode, null, h(Host)));
