import App from "./App.svelte";

const target = document.querySelector("#app");
if (!target) {
  throw new Error("Missing #app element.");
}

new App({ target });
