import "./style.css";
import { start } from "./game";

// @concern resize-teardown
let running = start();
addEventListener("pagehide", () => running.dispose());
Object.assign(window, { remount: () => { running.dispose(); running = start(); } });
