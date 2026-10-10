import { createApp, onMounted, ref } from "vue";
import { Geometry, Renderer, UnlitMaterial } from "@aura3d/rendering";

const App = {
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null);

    onMounted(async () => {
      if (!canvas.value) return;

      const renderer = await Renderer.create({
        backend: "webgl2",
        canvas: canvas.value,
        width: canvas.value.width,
        height: canvas.value.height,
        clearColor: [0.02, 0.025, 0.03, 1],
        preserveDrawingBuffer: true
      });

      renderer.render([
        {
          geometry: Geometry.triangle(),
          material: new UnlitMaterial({ color: [1, 0.36, 0.12, 1] }),
          label: "vue-starter-triangle"
        }
      ]);
    });

    return { canvas };
  },
  template: '<canvas ref="canvas" id="viewport" width="960" height="540"></canvas>'
};

createApp(App).mount("#app");
