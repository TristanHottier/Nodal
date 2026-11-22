import { useState } from "react";
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from "./theme";

export function ThemeSelect() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  return (
    <label className="nodal-theme-select">
      Theme{" "}
      <select
        value={choice}
        onChange={(e) => {
          const next = e.target.value as ThemeChoice;
          setChoice(next);
          applyThemeChoice(next);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
