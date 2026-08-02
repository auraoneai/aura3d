import { ProductStudioApp } from "./ProductStudioApp";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Product Studio app root #app is missing.");
}

const app = new ProductStudioApp(root);
void app.start();
