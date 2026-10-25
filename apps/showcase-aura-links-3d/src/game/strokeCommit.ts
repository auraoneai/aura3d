export interface StrokeRound {
  strokes: number;
  putts: number;
}

export interface StrokeDrive {
  committed: boolean;
}

/**
 * Count a stroke exactly once per shot. The swing meter keeps reporting
 * "committed" every frame until the clubhead reaches the ball, so the caller
 * must not add a stroke each time it sees that state.
 */
export function commitStroke(round: StrokeRound, drive: StrokeDrive, putter: boolean): boolean {
  if (drive.committed) return false;
  round.strokes += 1;
  if (putter) round.putts += 1;
  drive.committed = true;
  return true;
}
