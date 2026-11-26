// Where focus goes when the codex drawer closes: the control that opened it. The drawer replaces
// the inspector, so an inspector button is unmounted while the drawer is open; the opener is
// therefore remembered as a key and looked up again (data-codex-opener) once the drawer is gone.
const ATTR = "data-codex-opener" as const;
let current: string | null = null;

/** Props for a control that opens the drawer; spread them on the button. */
export function openerProps(key: string): { "data-codex-opener": string } {
  return { "data-codex-opener": key };
}

export function rememberOpener(key: string): void {
  current = key;
}

/** Focuses the remembered opener if it is on the page; returns whether it was. */
export function focusOpener(): boolean {
  if (current === null) return false;
  const el = Array.from(document.querySelectorAll<HTMLElement>(`[${ATTR}]`)).find(
    (e) => e.getAttribute(ATTR) === current,
  );
  el?.focus();
  return el !== undefined;
}
