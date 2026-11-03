import type { EditorShell } from "../EditorShell";

export class ConsolePanel {
  readonly element = document.createElement("section");
  /** Persistent log region: replacing it per render would suppress announcements. */
  private readonly list = document.createElement("div");
  /** Errors are also announced assertively, once per new error. */
  private readonly latestError = document.createElement("div");
  private announcedError: object | null = null;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel console-panel";
    this.element.innerHTML = `<div class="panel-title"><span>Console</span><button data-action="clear-console">Clear</button></div>`;
    this.list.className = "console-list";
    this.list.dataset.role = "console-list";
    this.list.setAttribute("role", "log");
    this.list.setAttribute("aria-live", "polite");
    this.list.setAttribute("aria-label", "Editor console");
    this.latestError.className = "panel-feedback";
    this.latestError.dataset.role = "console-latest-error";
    this.latestError.setAttribute("role", "alert");
    this.element.append(this.latestError, this.list);
    this.element.querySelector('[data-action="clear-console"]')?.addEventListener("click", () => this.shell.clearConsole());
  }

  render(): void {
    const messages = this.shell.consoleMessages();
    this.list.innerHTML = messages.map((message) => `<div data-level="${message.level}"><strong>${message.level}</strong> ${escapeHtml(message.text)}</div>`).join("") || `<p class="muted">No editor diagnostics.</p>`;
    const latest = [...messages].reverse().find((message) => message.level === "error") ?? null;
    if (!latest) this.latestError.textContent = "";
    else if (latest !== this.announcedError) this.latestError.textContent = latest.text;
    this.announcedError = latest;
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
