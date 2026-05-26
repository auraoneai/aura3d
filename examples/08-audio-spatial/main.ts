import { AudioListener, AudioSystem } from "@aura3d/audio";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "08-audio-spatial",
  title: "08 Audio Spatial",
  purpose: "Represent listener and source positions through public audio APIs.",
  acceptance: "Listener/source positions and locked audio state are visible without forcing autoplay.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const audio = new AudioSystem();
    const listener = new AudioListener();
    listener.setTransform({ x: 0, y: 0, z: 0 });
    const source = { x: 2.25, y: 0, z: -1.5 };

    return {
      metrics: { audioState: audio.contextManager.state, sourceX: source.x, listenerX: listener.position.x },
      draw(context, canvas) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        context.strokeStyle = "#3f4a53";
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(centerX - 220, centerY);
        context.lineTo(centerX + 220, centerY);
        context.stroke();
        context.fillStyle = "#70d6ff";
        context.beginPath();
        context.arc(centerX, centerY, 38, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#ff70a6";
        context.beginPath();
        context.arc(centerX + source.x * 90, centerY + source.z * 50, 30, 0, Math.PI * 2);
        context.fill();
      },
      async dispose() {
        await audio.dispose();
      },
    };
  });
}
