import { createApp, h, onBeforeUnmount, onMounted, ref } from "vue";
import { createAuraApp, looks, type AuraApp } from "@aura3d/engine";
import { LOOK_ID, starterScene } from "./scene";

const App = {
  setup() {
    const canvas = ref<HTMLCanvasElement | null>(null);
    let app: AuraApp | undefined;

    onMounted(() => {
      if (!canvas.value) return;
      // createAuraApp owns the renderer and frame loop; dispose on unmount.
      app = createAuraApp(canvas.value, { scene: starterScene, ...looks.appOptions(LOOK_ID) });
    });
    onBeforeUnmount(() => app?.dispose());

    // Render function, not a `template:` string: the default `vue` build is
    // runtime-only and silently renders nothing for string templates.
    return () => h("canvas", { ref: canvas, id: "viewport", width: 960, height: 540 });
  }
};

createApp(App).mount("#app");
