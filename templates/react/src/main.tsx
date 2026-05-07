import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Geometry, Renderer, UnlitMaterial } from "@galileo3d/rendering";

function App(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let disposed = false;

    async function renderStarterScene(): Promise<void> {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas,
        width: canvas.width,
        height: canvas.height,
        clearColor: [0.02, 0.025, 0.03, 1],
        preserveDrawingBuffer: true
      });

      if (disposed) {
        renderer.dispose();
        return;
      }

      renderer.render([
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ color: [1, 0.36, 0.12, 1] }),
          label: "react-starter-triangle"
        }
      ]);
    }

    void renderStarterScene();

    return () => {
      disposed = true;
    };
  }, []);

  return <canvas ref={canvasRef} id="app" width={960} height={540} />;
}

const rootElement = document.querySelector("#root");
if (!rootElement) {
  throw new Error("Missing #root element.");
}

createRoot(rootElement).render(<App />);
