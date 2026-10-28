import "./style.css";
import { start } from "./game";

// @concern resize-teardown
let running = await start();
addEventListener("pagehide", () => void running.dispose());
Object.assign(window, { remount: async () => { await running.dispose(); running = await start(); } });
