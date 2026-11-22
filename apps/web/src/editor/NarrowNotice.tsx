// Shown instead of the editing chrome when the window is narrower than the editor supports.
export function NarrowNotice() {
  return (
    <p className="nodal-narrow-notice" role="status">
      Nodal&apos;s editor needs a window at least 1024 px wide. The schematic is shown read-only.
    </p>
  );
}
