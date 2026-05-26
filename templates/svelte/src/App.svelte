<script>
  import { onMount } from "svelte";
  import { Geometry, Renderer, UnlitMaterial } from "@aura3d/rendering";

  let canvas;

  onMount(() => {
    let disposed = false;

    async function renderStarterScene() {
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
          label: "svelte-starter-triangle"
        }
      ]);
    }

    void renderStarterScene();

    return () => {
      disposed = true;
    };
  });
</script>

<canvas bind:this={canvas} id="viewport" width="960" height="540"></canvas>
