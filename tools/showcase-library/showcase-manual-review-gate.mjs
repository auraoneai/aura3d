/**
 * Manual review is a downward-only release veto. It can reject machine-passing
 * evidence, but it can never promote evidence that failed an automated gate.
 */
export function applyDownwardOnlyManualReview(input) {
  const validatorOk = input.validatorOk === true;
  const manualReviewOk = input.manualReviewOk === true;
  return {
    ok: validatorOk && manualReviewOk,
    validatorOk,
    manualReviewOk,
    vetoedByManualReview: validatorOk && !manualReviewOk,
    blockedByValidator: !validatorOk
  };
}
