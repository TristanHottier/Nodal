// The top bar: brand mark, project name, project actions, theme. Read-only has no project actions.
import { BookOpen } from "lucide-react";
import { Logo } from "../brand/Logo";
import { ThemeSelect } from "../theme/ThemeSelect";
import { useEditor } from "./EditorContext";
import { ProjectBar } from "./ProjectBar";
import "./TopBar.css";

/** "Title: description" splits at the first colon; a name without one is all title. */
export function splitProjectName(name: string): { title: string; description: string } {
  const i = name.indexOf(": ");
  return i > 0
    ? { title: name.slice(0, i), description: name.slice(i + 2) }
    : { title: name, description: "" };
}

export function TopBar({ readOnly = false }: { readOnly?: boolean }) {
  const name = useEditor((s) => s.project.name);
  const { title } = splitProjectName(name);
  return (
    <header className="nodal-topbar">
      <div className="nodal-topbar-brand">
        <Logo size={20} />
      </div>
      <span className="nodal-topbar-name" data-testid="project-name" title={name}>
        {title}
      </span>
      <div className="nodal-topbar-actions">
        {readOnly ? null : <ProjectBar />}
        <a className="nodal-topbar-codex" href="#/codex">
          <BookOpen aria-hidden="true" className="nodal-icon" />
          Codex
        </a>
        <ThemeSelect />
      </div>
    </header>
  );
}
