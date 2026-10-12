<script>
  import { onMount } from "svelte";
  import { createAuraApp, looks } from "@aura3d/engine";
  import { LOOK_ID, starterScene } from "./scene";

  let canvas;

  onMount(() => {
    // createAuraApp owns the renderer and frame loop; dispose on unmount.
    const app = createAuraApp(canvas, { scene: starterScene, ...looks.appOptions(LOOK_ID) });
    return () => app.dispose();
  });
</script>

<canvas bind:this={canvas} id="viewport" width="960" height="540"></canvas>
