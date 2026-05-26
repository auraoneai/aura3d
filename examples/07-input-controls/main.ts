import { FirstPersonControls, InputSnapshot, InputSystem, OrbitControls, type CameraTransformLike, type Vec3Like } from "@aura3d/input";
import { createExample, drawGrid, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

const metadata: ExampleMetadata = {
  id: "07-input-controls",
  title: "07 Input Controls",
  purpose: "Attach public input devices, orbit controls, and first-person controls to camera-like objects.",
  acceptance: "Pointer input changes orbit camera metrics, first-person controls move a camera, and the target reticle remains visible.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, ({ canvas }) => {
    const camera: CameraTransformLike = {
      position: { x: 0, y: 0, z: 5 },
      lookAt(target: Vec3Like) {
        this.target = { ...target };
      },
      target: { x: 0, y: 0, z: 0 },
    } as CameraTransformLike & { target: Vec3Like };
    const input = new InputSystem(canvas);
    const controls = new OrbitControls(camera, { distance: 5, target: { x: 0, y: 0, z: 0 } });
    const firstPersonCamera: CameraTransformLike = {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    };
    const firstPerson = new FirstPersonControls(firstPersonCamera, { moveSpeed: 2 });

    return {
      metrics: () => ({
        orbitControl: true,
        firstPersonControl: true,
        firstPersonZ: Number(firstPersonCamera.position.z.toFixed(2)),
      }),
      draw(context, canvasElement) {
        const snapshot = input.update();
        controls.update(snapshot);
        firstPerson.update(new InputSnapshot({ keys: new Set(["KeyW"]) }), 1 / 60);
        input.endFrame();
        drawGrid(context, canvasElement);
        context.strokeStyle = "#f4d35e";
        context.lineWidth = 4;
        context.beginPath();
        context.arc(canvasElement.width / 2, canvasElement.height / 2, 58, 0, Math.PI * 2);
        context.stroke();
        context.fillStyle = "#eef2f6";
        context.font = "16px ui-sans-serif, system-ui, sans-serif";
        context.fillText(
          `camera ${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)}`,
          32,
          48,
        );
        context.fillText(`first-person z ${firstPersonCamera.position.z.toFixed(2)}`, 32, 72);
      },
      dispose() {
        controls.dispose();
        firstPerson.dispose();
        input.dispose();
      },
    };
  });
}
