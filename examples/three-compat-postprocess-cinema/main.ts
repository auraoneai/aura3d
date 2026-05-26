import { BloomPassV5, EffectComposerV5, RenderPassV5, createV5BaseFrame } from "@galileo3d/rendering";
document.body.dataset.g3dExample = `three-compat-postprocess-cinema:${new EffectComposerV5().addPass(new RenderPassV5()).addPass(new BloomPassV5()).render(createV5BaseFrame()).bloom}`;
