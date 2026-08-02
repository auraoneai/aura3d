export function installEditorStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      background: #0c111b;
      color: #e5edf8;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #0c111b; }
    button, input, select, textarea {
      font: inherit;
      color: #e5edf8;
      background: #121a27;
      border: 1px solid #344256;
      border-radius: 6px;
      padding: 6px 8px;
    }
    button { cursor: pointer; }
    button:hover { border-color: #6aa7ff; }
    .editor-topbar {
      height: 52px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border-bottom: 1px solid #263244;
      background: #101723;
    }
    .editor-topbar strong { margin-right: auto; }
    .editor-topbar select { max-width: 150px; }
    .editor-layout {
      min-height: calc(100vh - 52px);
      display: grid;
      grid-template-columns: minmax(260px, 300px) minmax(440px, 1fr) minmax(300px, 360px);
      gap: 10px;
      padding: 10px;
    }
    .left-rail, .right-rail, .center-stage {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .panel, .editor-viewport-panel {
      border: 1px solid #263244;
      background: #101723;
      border-radius: 8px;
      overflow: hidden;
    }
    .panel-title {
      min-height: 38px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-bottom: 1px solid #263244;
      background: #121a27;
    }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .toolbar select { min-width: 110px; }
    .hierarchy-list, .asset-list, .asset-tree, .hierarchy-search, fieldset, .metrics, .diagnostics-list, .plugin-list, .timeline-controls, .timeline-track-list, .material-editor, .console-list {
      padding: 10px;
    }
    .hierarchy-row {
      display: grid;
      grid-template-columns: 22px minmax(84px, 1fr) minmax(80px, 1fr) repeat(5, auto);
      gap: 6px;
      align-items: center;
      margin-bottom: 6px;
    }
    .hierarchy-row.is-selected { background: rgba(106, 167, 255, 0.12); }
    .hierarchy-row button:first-child { text-align: left; }
    fieldset {
      margin: 0;
      border: 0;
      border-bottom: 1px solid #263244;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    legend { grid-column: 1 / -1; color: #9fb3c8; padding: 0 0 4px; }
    label { display: grid; gap: 4px; color: #c7d2e2; }
    .asset-tree {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      border-bottom: 1px solid #263244;
    }
    .asset-card {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) auto auto auto;
      gap: 7px;
      align-items: center;
      padding: 10px;
      border: 1px solid #263244;
      border-radius: 7px;
      margin-bottom: 8px;
      background: #121a27;
    }
    .asset-card strong, .asset-card label, .asset-card span, .asset-card small, .asset-card details {
      grid-column: 2 / -1;
    }
    .asset-card span, .asset-card small, .muted { color: #9fb3c8; }
    .asset-thumbnail {
      grid-row: 1 / 5;
      width: 42px;
      height: 42px;
      border: 1px solid #344256;
      border-radius: 6px;
      box-shadow: inset 0 0 0 10px rgba(255,255,255,0.08);
    }
    .asset-card button { min-width: 70px; }
    .material-editor {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .console-list {
      display: grid;
      gap: 6px;
      max-height: 160px;
      overflow: auto;
    }
    .console-list div {
      padding: 6px 8px;
      border: 1px solid #263244;
      border-radius: 6px;
      background: #121a27;
      color: #c7d2e2;
    }
    .console-list div[data-level="warning"] { border-color: #d69e2e; color: #ffe8a3; }
    .console-list div[data-level="error"] { border-color: #f56565; color: #fecaca; }
    .timeline-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      border-bottom: 1px solid #263244;
    }
    .timeline-controls label { grid-column: 1 / -1; }
    .timeline-track-list { display: grid; gap: 8px; }
    .timeline-track {
      display: grid;
      grid-template-columns: minmax(90px, 1fr) minmax(110px, 1.2fr);
      gap: 8px;
      align-items: center;
      border: 1px solid #263244;
      border-radius: 7px;
      padding: 8px;
      background: #121a27;
    }
    .timeline-track span { color: #9fb3c8; }
    .visual-script-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      border-bottom: 1px solid #263244;
      padding-bottom: 8px;
    }
    .visual-script-summary span {
      border: 1px solid #344256;
      border-radius: 999px;
      padding: 4px 8px;
      color: #c7d2e2;
    }
    .visual-node-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }
    .visual-node-card {
      display: grid;
      gap: 3px;
      border: 1px solid #263244;
      border-radius: 7px;
      padding: 7px;
      background: #121a27;
    }
    .visual-node-card span { color: #9fb3c8; }
    .visual-output-list {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(120px, 1.5fr);
      gap: 6px 10px;
      margin: 0;
      border-top: 1px solid #263244;
      padding-top: 8px;
    }
    .visual-output-list dt { color: #9fb3c8; }
    .visual-output-list dd { margin: 0; }
    .viewport-stack { position: relative; min-height: 520px; }
    .editor-viewport, .editor-viewport-overlay {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
    }
    .editor-viewport { touch-action: none; }
    .editor-viewport-overlay { pointer-events: none; }
    .viewport-hud {
      padding: 8px 10px;
      color: #c7d2e2;
      border-top: 1px solid #263244;
      background: #121a27;
    }
    .metrics {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 7px 10px;
    }
    .metrics dt { color: #9fb3c8; }
    .metrics dd { margin: 0; }
    .diagnostics-list, .plugin-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      border-top: 1px solid #263244;
    }
    .diagnostics-list span, .plugin-list span {
      border: 1px solid #344256;
      border-radius: 999px;
      padding: 4px 8px;
      color: #c7d2e2;
    }
    .diagnostics-list span[data-status="warning"] { border-color: #d69e2e; color: #ffe8a3; }
    .diagnostics-list span[data-status="error"] { border-color: #f56565; color: #fecaca; }
    .project-buffer, .export-summary {
      position: fixed;
      right: 12px;
      bottom: 12px;
      width: 360px;
      max-width: calc(100vw - 24px);
      height: 110px;
      opacity: 0.08;
      pointer-events: none;
    }
    .export-summary {
      bottom: 130px;
      height: auto;
      min-height: 48px;
      padding: 8px;
      white-space: pre-wrap;
      background: #121a27;
      border: 1px solid #344256;
      border-radius: 6px;
    }
    @media (max-width: 920px) {
      .editor-layout { grid-template-columns: 1fr; }
      .viewport-stack { min-height: 360px; }
      fieldset { grid-template-columns: 1fr; }
      .hierarchy-row, .asset-card, .material-editor { grid-template-columns: 1fr; }
    }
  `;
  document.head.append(style);
}
