import type { EpisodeDocument } from "./types";

export type DocumentSnapshot = { doc: EpisodeDocument; at: number };

export function createHistory(maxDepth = 50) {
  const stack: DocumentSnapshot[] = [];
  let index = -1;
  let clipboard: string | null = null;

  return {
    push(snapshot: DocumentSnapshot) {
      if (index < stack.length - 1) {
        stack.length = index + 1;
      }
      stack.push(snapshot);
      if (stack.length > maxDepth) {
        stack.shift();
        index = Math.min(index, stack.length - 1);
      } else {
        index++;
      }
    },
    undo(): DocumentSnapshot | undefined {
      if (index <= 0) return undefined;
      index--;
      return stack[index];
    },
    redo(): DocumentSnapshot | undefined {
      if (index >= stack.length - 1) return undefined;
      index++;
      return stack[index];
    },
    copy(obj: unknown) {
      clipboard = JSON.stringify(obj);
    },
    paste(): unknown | undefined {
      if (clipboard == null) return undefined;
      try {
        return JSON.parse(clipboard);
      } catch {
        return undefined;
      }
    },
    get canUndo(): boolean {
      return index > 0;
    },
    get canRedo(): boolean {
      return index >= 0 && index < stack.length - 1;
    }
  };
}
