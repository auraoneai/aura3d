import { BloomPassThreeCompat, EffectComposerThreeCompat, RenderPassThreeCompat, createThreeCompatBaseFrame } from "@aura3d/rendering";
document.body.dataset.a3dExample = `three-compat-postprocess-cinema:${new EffectComposerThreeCompat().addPass(new RenderPassThreeCompat()).addPass(new BloomPassThreeCompat()).render(createThreeCompatBaseFrame()).bloom}`;
