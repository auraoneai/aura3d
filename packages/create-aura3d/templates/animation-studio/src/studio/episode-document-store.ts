/**
 * episode-document-store.ts — the versioned Episode Document.
 *
 * The single editable artifact the Prompt Studio agent mutates (never raw code). Every
 * commit is validated by the coherence gate and recorded as a revision (undo/redo). A
 * commit that fails the gate is REJECTED — there is no path to a broken document.
 */

import { validateEpisodeDocument, type EpisodeDocumentValidation, type ValidateOptions } from "../animation-episode-validator";
import type { EpisodeDocument } from "../episode-document";

export interface CommitResult {
  readonly committed: boolean;
  readonly validation: EpisodeDocumentValidation;
  readonly revision: number;
}

export class EpisodeDocumentStore {
  private revisions: EpisodeDocument[] = [];
  private cursor = -1;

  constructor(initial: EpisodeDocument, private readonly validateOptions: ValidateOptions = {}) {
    // The initial document is committed even if it only has warnings; hard errors throw.
    const validation = validateEpisodeDocument(initial, this.validateOptions);
    if (!validation.ok) {
      throw new Error(`initial document is invalid:\n - ${validation.errors.join("\n - ")}`);
    }
    this.revisions.push(initial);
    this.cursor = 0;
  }

  current(): EpisodeDocument {
    return this.revisions[this.cursor]!;
  }

  /** Validate + commit a new revision. Rejected (not committed) if it has hard errors. */
  commit(next: EpisodeDocument): CommitResult {
    const validation = validateEpisodeDocument(next, this.validateOptions);
    if (!validation.ok) {
      return { committed: false, validation, revision: this.cursor };
    }
    // Truncate any redo history, then push.
    this.revisions = this.revisions.slice(0, this.cursor + 1);
    this.revisions.push(next);
    this.cursor = this.revisions.length - 1;
    return { committed: true, validation, revision: this.cursor };
  }

  undo(): boolean {
    if (this.cursor > 0) {
      this.cursor -= 1;
      return true;
    }
    return false;
  }

  redo(): boolean {
    if (this.cursor < this.revisions.length - 1) {
      this.cursor += 1;
      return true;
    }
    return false;
  }

  revisionCount(): number {
    return this.revisions.length;
  }

  currentRevision(): number {
    return this.cursor;
  }
}
