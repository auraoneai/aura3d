/**
 * Local Whitney web cuts from the licensed font library's README.md
 * (Hoefler & Co.; typography.com EULA).
 * Source filenames under fonts/sans/Whitney: regular 24bda95d153a319704c33329f3ab84bb.woff2,
 * medium cf4a8a10bbdf9b775fad41e0b9921c84.woff2, semibold f9e7047f6447547781512ec4b977b2ab.woff2.
 */
export function installEditorStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    /* Whitney web cuts use the weights documented in the licensed font guide.
       Dense editor UI: 13px body, 12px metadata, 32px controls, 34px rows. */
    @font-face {
      font-family: "Whitney";
      src: url("/fonts/whitney-regular.woff2") format("woff2");
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Whitney";
      src: url("/fonts/whitney-medium.woff2") format("woff2");
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Whitney";
      src: url("/fonts/whitney-semibold.woff2") format("woff2");
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: "Whitney Fallback";
      src: local("Arial"), local("ArialMT"), local("Helvetica Neue"), local("Helvetica");
      font-weight: 400 500;
      font-style: normal;
      size-adjust: 93.6%;
      ascent-override: 102.6%;
      descent-override: 25.6%;
      line-gap-override: 0%;
    }
    @font-face {
      font-family: "Whitney Fallback";
      src: local("Arial Bold"), local("Arial-BoldMT"), local("Helvetica Neue Bold"), local("Helvetica Bold");
      font-weight: 600;
      font-style: normal;
      size-adjust: 87.9%;
      ascent-override: 109.2%;
      descent-override: 27.3%;
      line-gap-override: 0%;
    }
    :root {
      color-scheme: light;
      --font-ui: "Whitney", "Whitney Fallback", sans-serif;
      font-family: var(--font-ui);
      font-synthesis: none;
      font-size: 13px;
      font-weight: 400;
      line-height: 1.45;
      background: #f4f6f9;
      color: #1c2530;
    }
    * { box-sizing: border-box; }
    strong, b { font-weight: 500; }
    small { font-size: 12px; }
    th {
      font-size: 12px;
      font-weight: 500;
      font-variant-caps: small-caps;
      text-transform: lowercase;
      text-align: left;
    }
    td, .metrics dd { font-variant-numeric: tabular-nums; }
    body { margin: 0; min-height: 100vh; background: #f4f6f9; }
    button, input, select, textarea {
      font: inherit;
      font-size: 13px;
      min-height: 32px;
      color: #1c2530;
      background: #ffffff;
      border: 1px solid #c3cad4;
      border-radius: 6px;
      padding: 4px 8px;
    }
    button { cursor: pointer; font-weight: 500; }
    button:hover { border-color: #1f6feb; }
    button[aria-disabled="true"] { cursor: not-allowed; opacity: 0.65; }
    button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
      outline: 2px solid #1f6feb;
      outline-offset: 1px;
    }
    label { font-size: 12px; font-weight: 500; color: #566272; }
    .editor-topbar {
      height: 52px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      border-bottom: 1px solid #d8dde5;
      background: #ffffff;
    }
    .editor-topbar strong { margin-right: auto; font-size: 17px; font-weight: 600; }
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
      border: 1px solid #d8dde5;
      background: #ffffff;
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
      border-bottom: 1px solid #d8dde5;
      background: #f7f9fb;
      font-weight: 500;
      font-size: 13px;
    }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .toolbar select { min-width: 110px; }
    .panel-feedback:not(:empty) { padding: 8px 10px; }
    .panel-feedback[role="alert"] { color: #9b2233; }
    .inspector-field-error { color: #9b2233; font-size: 12px; font-weight: 400; }
    .hierarchy-parent { display: flex; align-items: end; gap: 8px; padding: 0 10px 10px; }
    .hierarchy-parent label { flex: 1; min-width: 0; }
    .hierarchy-parent select { width: 100%; }
    .hierarchy-list, .asset-list, .asset-tree, .hierarchy-search, fieldset, .metrics, .diagnostics-list, .plugin-list, .timeline-controls, .timeline-track-list, .material-editor, .console-list {
      padding: 10px;
    }
    .hierarchy-row {
      display: grid;
      grid-template-columns: 22px minmax(84px, 1fr) minmax(80px, 1fr) repeat(5, auto);
      gap: 6px;
      align-items: center;
      min-height: 34px;
      margin-bottom: 4px;
    }
    .hierarchy-row.is-selected { background: rgba(31, 111, 235, 0.10); }
    .hierarchy-row button:first-child { text-align: left; }
    fieldset {
      margin: 0;
      border: 0;
      border-bottom: 1px solid #d8dde5;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    legend { grid-column: 1 / -1; color: #566272; padding: 0 0 4px; font-size: 12px; }
    label { display: grid; gap: 4px; color: #1c2530; }
    .asset-tree {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      border-bottom: 1px solid #d8dde5;
    }
    .asset-card {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) auto auto auto;
      gap: 7px;
      align-items: center;
      padding: 10px;
      border: 1px solid #d8dde5;
      border-radius: 7px;
      margin-bottom: 8px;
      background: #f7f9fb;
    }
    .asset-card strong, .asset-card label, .asset-card span, .asset-card small, .asset-card details {
      grid-column: 2 / -1;
    }
    .asset-card span, .asset-card small, .muted { color: #566272; }
    .asset-thumbnail {
      grid-row: 1 / 5;
      width: 42px;
      height: 42px;
      border: 1px solid #c3cad4;
      border-radius: 6px;
      background: #ffffff;
      box-shadow: inset 0 0 0 1px rgba(28, 37, 48, 0.06);
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
      border: 1px solid #d8dde5;
      border-radius: 6px;
      background: #f7f9fb;
      color: #1c2530;
      font-size: 12px;
    }
    .console-list div[data-level="warning"] { border-color: #d69e2e; color: #8a6011; }
    .console-list div[data-level="error"] { border-color: #f56565; color: #9b2233; }
    .timeline-controls {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      border-bottom: 1px solid #d8dde5;
    }
    .timeline-controls label { grid-column: 1 / -1; }
    .timeline-track-list { display: grid; gap: 8px; }
    .timeline-track {
      display: grid;
      grid-template-columns: minmax(90px, 1fr) minmax(110px, 1.2fr);
      gap: 8px;
      align-items: center;
      min-height: 34px;
      border: 1px solid #d8dde5;
      border-radius: 7px;
      padding: 6px 8px;
      background: #f7f9fb;
    }
    .timeline-track span { color: #566272; }
    .visual-script-summary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      border-bottom: 1px solid #d8dde5;
      padding-bottom: 8px;
    }
    .visual-script-summary span {
      border: 1px solid #c3cad4;
      border-radius: 999px;
      padding: 2px 8px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      color: #1c2530;
      font-size: 12px;
    }
    .visual-node-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
    }
    .visual-node-card {
      display: grid;
      gap: 3px;
      border: 1px solid #d8dde5;
      border-radius: 7px;
      padding: 7px;
      background: #f7f9fb;
    }
    .visual-node-card span { color: #566272; font-size: 12px; }
    .visual-output-list {
      display: grid;
      grid-template-columns: minmax(80px, 1fr) minmax(120px, 1.5fr);
      gap: 6px 10px;
      margin: 0;
      border-top: 1px solid #d8dde5;
      padding-top: 8px;
    }
    .visual-output-list dt { color: #566272; font-size: 12px; }
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
      color: #1c2530;
      border-top: 1px solid #d8dde5;
      background: #ffffff;
      font-size: 12px;
    }
    .metrics {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 7px 10px;
    }
    .metrics dt { color: #566272; font-size: 12px; }
    .metrics dd { margin: 0; }
    .diagnostics-list, .plugin-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      border-top: 1px solid #d8dde5;
    }
    .diagnostics-list span, .plugin-list span {
      border: 1px solid #c3cad4;
      border-radius: 999px;
      padding: 2px 8px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      color: #1c2530;
      font-size: 12px;
    }
    .diagnostics-list span[data-status="warning"] { border-color: #d69e2e; color: #8a6011; }
    .diagnostics-list span[data-status="error"] { border-color: #f56565; color: #9b2233; }
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
      background: #ffffff;
      border: 1px solid #c3cad4;
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
