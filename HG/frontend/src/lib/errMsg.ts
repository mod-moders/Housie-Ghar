/** Narrow an unknown thrown value to a display string for alerts/toasts. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
