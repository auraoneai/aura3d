import { OrbitControls } from "@galileo3d/controls";
const controls = new OrbitControls(); controls.rotate(1, 1);
document.body.dataset.g3dExample = `three-compat-controls-lab:${controls.state.rotation.x}`;
