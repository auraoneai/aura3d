/** "Busted Mode" (game.js `toggleWorkMode`): the game hides behind an editable spreadsheet and the sound stops. */
export interface WorkModeDeps {
  /** True when work mode may start (single player, in a match). */
  canStart(): boolean;
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  clearInputs(): void;
  setAudioEnabled(enabled: boolean): void;
  soundEnabled(): boolean;
  syncPauseMenu(): void;
  focusCanvas(): void;
}
export interface WorkMode { readonly active: boolean; toggle(): void }

export function createWorkMode(deps: WorkModeDeps): WorkMode {
  const sheet = document.getElementById("work-sheet") as HTMLDialogElement;
  let active = false, wasPaused = false, title = "";
  const rows = sheet.querySelector("tbody") as HTMLTableSectionElement;
  for (let row = 9; row <= 40; row++) {
    const tr = document.createElement("tr");
    const heading = document.createElement("th");
    heading.textContent = String(row);
    tr.append(heading);
    for (let column = 0; column < 8; column++) tr.append(document.createElement("td"));
    rows.append(tr);
  }
  type Cell = { input: HTMLInputElement; column: number; span: number };
  const grid: Cell[][] = [];
  const address = sheet.querySelector(".work-formula span:first-child") as HTMLElement;
  const value = sheet.querySelector(".work-formula span:last-child") as HTMLElement;
  [...rows.rows].forEach((row, rowIndex) => {
    let column = 0;
    const cells: Cell[] = [];
    [...row.querySelectorAll("td")].forEach((cell) => {
      const input = document.createElement("input");
      input.type = "text"; input.value = cell.textContent ?? ""; input.autocomplete = "off"; input.spellcheck = false;
      const addr = `${String.fromCharCode(65 + column)}${rowIndex + 1}`;
      input.setAttribute("aria-label", addr); input.dataset.address = addr;
      const cellColumn = column;
      column += cell.colSpan;
      cell.replaceChildren(input);
      cells.push({ input, column: cellColumn, span: cell.colSpan });
      const update = (): void => { address.textContent = addr; value.textContent = input.value; };
      input.addEventListener("focus", () => {
        sheet.querySelector(".work-selected")?.classList.remove("work-selected");
        cell.classList.add("work-selected"); update(); input.select();
      });
      input.addEventListener("input", update);
      input.addEventListener("keydown", (event) => {
        if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
        let target: Cell | undefined;
        const index = cells.findIndex((entry) => entry.input === input);
        if (event.key === "Tab" || event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const direction = event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey) ? -1 : 1;
          target = cells[index + direction];
          if (!target && event.key === "Tab") {
            const nextRow = grid[rowIndex + direction];
            target = direction > 0 ? nextRow?.[0] : nextRow?.at(-1);
          }
        } else if (event.key === "Enter" || event.key === "ArrowUp" || event.key === "ArrowDown") {
          const direction = event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1;
          target = grid[rowIndex + direction]?.find((entry) => cellColumn >= entry.column && cellColumn < entry.column + entry.span);
        } else return;
        event.preventDefault();
        target?.input.focus();
      });
    });
    grid.push(cells);
  });
  sheet.addEventListener("cancel", (event) => event.preventDefault());

  return {
    get active() { return active; },
    toggle() {
      if (!active && !deps.canStart()) return;
      if (active) {
        active = false;
        sheet.close();
        document.title = title;
        deps.setPaused(wasPaused);
        deps.clearInputs();
        deps.setAudioEnabled(deps.soundEnabled());
        deps.syncPauseMenu();
        if (!deps.isPaused()) deps.focusCanvas();
      } else {
        wasPaused = deps.isPaused();
        title = document.title;
        active = true;
        deps.setPaused(true);
        deps.clearInputs();
        deps.setAudioEnabled(false);
        document.title = "Monthly Report";
        sheet.showModal();
        (sheet.querySelector(".work-selected input") as HTMLElement | null)?.focus({ preventScroll: true });
      }
    }
  };
}
