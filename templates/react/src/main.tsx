import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createAuraApp, looks } from "@aura3d/engine";
import { LOOK_ID, starterScene } from "./scene";

function App(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // createAuraApp owns the renderer and frame loop; dispose on unmount.
    const app = createAuraApp(canvas, { scene: starterScene, ...looks.appOptions(LOOK_ID) });
    return () => app.dispose();
  }, []);

  return <canvas ref={canvasRef} id="app" width={960} height={540} />;
}

const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("Missing #root element.");
}

createRoot(rootElement).render(<App />);
