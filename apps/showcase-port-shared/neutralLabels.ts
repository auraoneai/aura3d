/**
 * Public-hosting label neutralizer. The ported simulations keep their internal identifiers, but the public pages must
 * not display third-party franchise names (docs/workflows/crayon-game-reverse-engineering.md section 4). This rewrites
 * visible text and a few accessibility attributes, including strings set later by the game's own code.
 * It cannot reach text drawn into canvases.
 */
export type LabelMap = ReadonlyArray<readonly [from: string, to: string]>;

const ATTRIBUTES = ["title", "aria-label", "alt", "placeholder"] as const;

export function installNeutralLabels(map: LabelMap): void {
  if (typeof document === "undefined") return;
  const entries = [...map].sort((a, b) => b[0].length - a[0].length);
  const lookup = new Map(entries.map(([from, to]) => [from.toLowerCase(), to]));
  const pattern = new RegExp(entries.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");

  const rewrite = (text: string): string =>
    text.replace(pattern, (match) => {
      const to = lookup.get(match.toLowerCase()) ?? match;
      return match === match.toUpperCase() && /[A-Z]/.test(match) ? to.toUpperCase() : to;
    });

  const fixNode = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      const next = rewrite(text);
      if (next !== text) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element;
    if (element.tagName === "SCRIPT" || element.tagName === "STYLE") return;
    for (const name of ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) {
        const next = rewrite(value);
        if (next !== value) element.setAttribute(name, next);
      }
    }
    element.childNodes.forEach(fixNode);
  };

  const run = (): void => {
    document.title = rewrite(document.title);
    fixNode(document.documentElement);
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") fixNode(record.target);
        else if (record.type === "attributes") fixNode(record.target);
        else record.addedNodes.forEach(fixNode);
      }
    }).observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: [...ATTRIBUTES] });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}
