import { AnimationClip, AnimationMixer, AnimationTrack } from "@galileo3d/animation";
import { createExample, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "05-animation-character",
  title: "05 Animation Character",
  purpose: "Drive a looped public animation clip through AnimationMixer.",
  acceptance: "A marker moves in a deterministic loop and mixer state exposes sampled values.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const track = new AnimationTrack({
      target: "marker.position",
      valueType: "vector3",
      keyframes: [
        { time: 0, value: [-1, 0, 0] },
        { time: 0.5, value: [1, 0.6, 0] },
        { time: 1, value: [-1, 0, 0] },
      ],
    });
    const clip = new AnimationClip({ name: "marker-loop", tracks: [track], duration: 1 });
    const mixer = new AnimationMixer();
    mixer.play(clip);

    return {
      metrics: { clip: clip.name, actions: 1 },
      draw(context, canvas, timeSeconds) {
        mixer.update(1 / 60);
        const sampled = (mixer.getValue("marker.position") ?? [0, 0, 0]) as readonly [number, number, number];
        const x = canvas.width * 0.5 + sampled[0] * 180;
        const y = canvas.height * 0.55 - sampled[1] * 160 + Math.sin(timeSeconds * Math.PI * 2) * 4;
        context.strokeStyle = "#43505a";
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(canvas.width * 0.28, canvas.height * 0.55);
        context.lineTo(canvas.width * 0.72, canvas.height * 0.55);
        context.stroke();
        context.fillStyle = "#f5c84b";
        context.beginPath();
        context.arc(x, y, 34, 0, Math.PI * 2);
        context.fill();
      },
    };
  });
}
