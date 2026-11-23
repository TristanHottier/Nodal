// The top bar: brand mark, project name, project actions, theme. Read-only has no project actions.
import { Logo } from "../brand/Logo";
import { ThemeSelect } from "../theme/ThemeSelect";
import { useEditor } from "./EditorContext";
import { ProjectBar } from "./ProjectBar";
import "./TopBar.css";

export function TopBar({ readOnly = false }: { readOnly?: boolean }) {
  const name = useEditor((s) => s.project.name);
  return (
    <header className="nodal-topbar">
      <div className="nodal-topbar-brand">
        <Logo size={20} />
      </div>
      <span className="nodal-topbar-name" data-testid="project-name" title={name}>
        {name}
      </span>
      {readOnly ? null : <ProjectBar />}
      <ThemeSelect />
    </header>
  );
}
