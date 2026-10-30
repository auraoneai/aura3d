// GU47 E-I/E-F: the `evaluate` step of tools/real-gpu/capture.mjs, kept free of the harness's top-level browser launch
// so unit tests can import it. A scenario step `{ "evaluate": "<expression>" }` records the expression's value.

/**
 * Evaluates `expression` in the page (Playwright serialises the value; a returned Promise is awaited) and returns the
 * report entry: `{ expression, shot?, value }`, or `{ expression, shot?, error }` when the expression throws.
 */
export async function evaluateStep(page, expression, shot) {
  const entry = { expression, ...(shot ? { shot } : {}) };
  try {
    const value = await page.evaluate(expression);
    return { ...entry, value: value === undefined ? null : value };
  } catch (error) {
    return { ...entry, error: String(error?.message ?? error) };
  }
}
