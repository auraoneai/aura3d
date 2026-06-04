export interface SamplePrompt {
  readonly label: string;
  readonly prompt: string;
}

export const samplePrompts: readonly SamplePrompt[] = [
  {
    label: "Rainy neon alley",
    prompt: "Create a rainy neon alley at night. A lonely robot finds a glowing flower. Make it emotional and cinematic with wet pavement, fog, rain particles, blue rim light, neon reflections, and a slow 12-second dolly-in."
  },
  {
    label: "Wide city reveal",
    prompt: "A wide establishing shot of a small robot on a rooftop above a luminous future city, light fog rolling through the skyline, cool rim light, and a slow push toward the hero subject."
  },
  {
    label: "Warm aftermath",
    prompt: "A warm golden dawn scene after a storm. The robot stands beside a glowing flower on wet pavement, with soft amber light, gentle mist, and a hopeful camera move."
  },
  {
    label: "Noir close-up",
    prompt: "A tight noir close-up of the robot under a broken neon sign, heavy rain, dense fog, magenta rim light, wet metal material, and a dramatic low camera angle."
  }
];

export const samplePatchPrompts: readonly SamplePrompt[] = [
  {
    label: "Lower camera",
    prompt: "Make the camera lower and closer with a longer lens, keeping the glowing flower readable."
  },
  {
    label: "More atmosphere",
    prompt: "Increase the fog, rain, and bloom so the alley feels more cinematic."
  },
  {
    label: "Warmer light",
    prompt: "Shift the key light warmer and add a brighter magenta rim light."
  },
  {
    label: "Add prop",
    prompt: "Add a small lantern story prop and make the materials wetter."
  }
];
