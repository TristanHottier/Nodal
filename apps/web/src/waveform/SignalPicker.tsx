// Picks a signal from the result and adds it to the probes.
import { useState } from "react";

export function SignalPicker({
  signals,
  probes,
  onAdd,
}: {
  signals: { key: string; label: string }[];
  probes: string[];
  onAdd: (key: string) => void;
}) {
  const [chosen, setChosen] = useState("");
  const available = signals.filter((s) => !probes.includes(s.key));
  const value = available.some((s) => s.key === chosen) ? chosen : (available[0]?.key ?? "");
  return (
    <div className="nodal-signalpicker">
      <select
        aria-label="Signal"
        value={value}
        disabled={available.length === 0}
        onChange={(e) => {
          setChosen(e.target.value);
        }}
      >
        {available.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={value === ""}
        onClick={() => {
          onAdd(value);
        }}
      >
        Add
      </button>
    </div>
  );
}
