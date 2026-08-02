import { EditorShell } from "./EditorShell.js";
import { installEditorStyles } from "./styles.js";

const root = document.querySelector<HTMLElement>("#editor-app");
if (!root) {
  throw new Error("Editor root element #editor-app was not found.");
}

installEditorStyles();
const shell = new EditorShell(root);
window.__AURA3D_EDITOR_APP__ = {
  shell,
  getState: () => shell.getState()
};

shell.mount().catch((error) => {
  shell.fail(error);
  window.__AURA3D_EDITOR_APP__ = {
    shell,
    getState: () => shell.getState()
  };
});
