import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { applyThemeChoice, readThemeChoice, type ThemeChoice } from "./theme";

const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeSelect() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readThemeChoice());
  const Icon = ICONS[choice];
  return (
    <span className="nodal-theme-select">
      <Icon aria-hidden="true" className="nodal-icon" />
      <select
        aria-label="Theme"
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
    </span>
  );
}
