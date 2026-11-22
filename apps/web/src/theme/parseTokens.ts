// Reads custom properties out of tokens.css for the token tests.

export interface ThemeTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
  /** The dark block repeated inside `@media (prefers-color-scheme: dark)` for the "system" choice. */
  systemDark: Record<string, string>;
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (m[1] !== undefined && m[2] !== undefined) out[m[1]] = m[2].trim();
  }
  return out;
}

/** The body of the first `{ … }` block after `selector`, braces balanced. */
function blockAfter(css: string, selector: string, from = 0): { body: string; end: number } {
  const at = css.indexOf(selector, from);
  if (at < 0) throw new Error(`tokens.css has no block for ${selector}`);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return { body: css.slice(open + 1, i), end: i };
  }
  throw new Error(`Unbalanced braces after ${selector}`);
}

export function parseTokens(css: string): ThemeTokens {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const light = declarations(blockAfter(clean, ':root,\n[data-theme="light"]').body);
  const media = blockAfter(clean, "@media (prefers-color-scheme: dark)").body;
  const systemDark = declarations(blockAfter(media, ':root:not([data-theme="light"])').body);
  const dark = declarations(blockAfter(clean, '[data-theme="dark"] {').body);
  // Non-color tokens are defined once in the light block; the dark blocks override colors only.
  return { light, dark: { ...light, ...dark }, systemDark: { ...light, ...systemDark } };
}
