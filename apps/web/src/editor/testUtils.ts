// Shared helpers for tests that drive the <Editor /> through pointer and key events.
import { fireEvent, screen } from "@testing-library/react";
import { createEditorStore } from "./store";
import type { Schematic } from "@nodal/schema";

export type Store = ReturnType<typeof createEditorStore>;

export function makeStore(doc?: Schematic): Store {
  let n = 0;
  return createEditorStore({
    ...(doc ? { doc } : {}),
    newId: () => `id${String((n += 1))}`,
  });
}

const PTR = { pointerId: 1, button: 0 };
const at = (x: number, y: number) => ({ clientX: x * 10, clientY: y * 10 });

export const canvas = (): HTMLElement => screen.getByTestId("schematic-canvas");

export function moveTo(x: number, y: number): void {
  fireEvent.pointerMove(canvas(), { ...PTR, ...at(x, y) });
}

/** Press and release on the canvas (or on `target`) at grid point (x, y). */
export function click(x: number, y: number, target: Element = canvas()): void {
  fireEvent.pointerDown(target, { ...PTR, ...at(x, y) });
  fireEvent.pointerUp(canvas(), { ...PTR, ...at(x, y) });
}

/** Drag `target` from grid point `from` to grid point `to`. */
export function drag(target: Element, from: [number, number], to: [number, number]): void {
  fireEvent.pointerDown(target, { ...PTR, ...at(...from) });
  fireEvent.pointerMove(canvas(), { ...PTR, ...at(...to) });
  fireEvent.pointerUp(canvas(), { ...PTR, ...at(...to) });
}

export function key(k: string, mods: { ctrl?: boolean; shift?: boolean } = {}): void {
  fireEvent.keyDown(window, { key: k, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift });
}

export const undo = () => {
  key("z", { ctrl: true });
};
export const redo = () => {
  key("Z", { ctrl: true, shift: true });
};
