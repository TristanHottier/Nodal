// Mouse down must not focus a button: the canvas ignores Space aimed at a
// focused button (so Space+drag would stop panning), and releasing Space would
// click it again. Keyboard focus with Tab is unaffected.
export const keepFocus = (e: { preventDefault(): void }) => {
  e.preventDefault();
};
