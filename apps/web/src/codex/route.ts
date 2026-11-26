// Hash routes: "#/" is the editor, "#/codex" the codex index, "#/codex/<id>" one entry.
// This file is part of the first-load bundle, so it imports nothing from the codex content.
import { useEffect, useState } from "react";

export type Route = { view: "editor" } | { view: "codex"; id: string | null };

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, "").split("?")[0] ?? "";
  const parts = path.split("/").filter((p) => p !== "");
  if (parts[0] !== "codex") return { view: "editor" };
  const id = parts[1];
  return { view: "codex", id: id === undefined ? null : decode(id) };
}

export function codexHref(id?: string): string {
  return id === undefined ? "#/codex" : `#/codex/${encodeURIComponent(id)}`;
}

/** The current route; re-renders when the hash changes. */
export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", onChange);
    onChange();
    return () => {
      window.removeEventListener("hashchange", onChange);
    };
  }, []);
  return parseRoute(hash);
}
