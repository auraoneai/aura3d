import { BloomPassV5, EffectComposerV5, RenderPassV5, createV5BaseFrame } from "../../packages/rendering/src";
document.body.dataset.g3dExample = `v5-postprocess-cinema:${new EffectComposerV5().addPass(new RenderPassV5()).addPass(new BloomPassV5()).render(createV5BaseFrame()).bloom}`;
