// Window keyboard shortcuts. Ignored while typing in a form control.
import { useEffect } from "react";
import { rotateCw } from "./geometry";
import { useEditorStore } from "./EditorContext";
import { deleteItems, mirrorItems, rotateItems } from "./model/edits";

/** What the shortcuts need from the wire tool. */
export interface WireControl {
  active: boolean;
  cancel: () => void;
  finish: () => void;
  toggleBend: () => void;
}

const isFormControl = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable);

export function useShortcuts(wire?: WireControl): void {
  const store = useEditorStore();
  const active = wire?.active ?? false;
  const cancel = wire?.cancel;
  const finish = wire?.finish;
  const toggleBend = wire?.toggleBend;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormControl(e.target)) return;
      const s = store.getState();
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const handled = () => {
        e.preventDefault();
      };

      if (mod) {
        if (e.altKey) return;
        if (k === "z") {
          handled();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (k === "y") {
          handled();
          s.redo();
        } else if (k === "c") {
          handled();
          s.copy();
        } else if (k === "v") {
          handled();
          s.paste();
        }
        return;
      }
      if (e.altKey) return;

      if (k === "escape") {
        handled();
        if (active) cancel?.();
        else if (s.tool.kind !== "select") s.setTool({ kind: "select" });
        else s.select([]);
      } else if (k === "w") {
        handled();
        s.setTool({ kind: "wire" });
      } else if (k === "enter" && active) {
        handled();
        finish?.();
      } else if (k === "/" && active) {
        handled();
        toggleBend?.();
      } else if (k === "r" || k === "x") {
        const t = s.tool;
        if (t.kind === "place") {
          handled();
          if (k === "r") s.setTool({ ...t, rotation: rotateCw(t.rotation) });
          else if (t.item !== "label") s.setTool({ ...t, mirror: !t.mirror });
        } else if (t.kind === "select") {
          handled();
          s.commit(k === "r" ? rotateItems(s.doc, s.selection) : mirrorItems(s.doc, s.selection));
        }
      } else if (k === "delete" || k === "backspace") {
        if (s.tool.kind !== "select") return;
        handled();
        s.commit(deleteItems(s.doc, s.selection), []);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [store, active, cancel, finish, toggleBend]);
}
