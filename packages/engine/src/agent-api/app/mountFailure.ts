/**
 * A non-strict mount failure used to leave a black canvas with nothing in the console: the error went only to
 * `app.diagnostics().errors` and `app.ready()` still resolved. This is the one line printed for that case.
 */
export function mountFailureConsoleMessage(message: string): string {
  const text = message.length > 400 ? `${message.slice(0, 400)}...` : message;
  return `[aura3d] RENDERER_MOUNT_FAILED: ${text} Nothing will draw. The same text is in app.diagnostics().errors; pass strict: true to make app.ready() reject.`;
}
