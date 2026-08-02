import type { EditorShell } from "../EditorShell";

export class ConsolePanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel console-panel";
  }

  render(): void {
    const messages = this.shell.consoleMessages();
    this.element.innerHTML = `
      <div class="panel-title"><span>Console</span><button data-action="clear-console">Clear</button></div>
      <div class="console-list" data-role="console-list">
        ${messages.map((message) => `<div data-level="${message.level}"><strong>${message.level}</strong> ${escapeHtml(message.text)}</div>`).join("") || `<p class="muted">No editor diagnostics.</p>`}
      </div>
    `;
    this.element.querySelector('[data-action="clear-console"]')?.addEventListener("click", () => this.shell.clearConsole());
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
