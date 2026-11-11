import { useEffect, useState } from "react";
import { getEngineVersion } from "./engine/client";

type Status =
  { kind: "loading" } | { kind: "ready"; version: string } | { kind: "failed"; message: string };

export function App() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getEngineVersion().then(
      (version) => {
        if (!cancelled) setStatus({ kind: "ready", version });
      },
      (e: unknown) => {
        if (!cancelled)
          setStatus({
            kind: "failed",
            message: e instanceof Error ? e.message : String(e),
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const text =
    status.kind === "loading"
      ? "Loading engine…"
      : status.kind === "ready"
        ? `Engine ${status.version}`
        : `Engine failed to load: ${status.message}`;

  return (
    <main>
      <h1>Nodal</h1>
      <p data-testid="engine-status">{text}</p>
    </main>
  );
}
