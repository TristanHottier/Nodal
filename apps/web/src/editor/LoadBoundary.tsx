// Catches a failed lazy chunk (offline, a stale deploy) so one missing file cannot blank the app.
import { Component, type ReactNode } from "react";

interface Props {
  /** Called once with the error; the owner resets whatever asked for the chunk. */
  onError?: (error: unknown) => void;
  /** What to render after a failure; nothing by default. */
  fallback?: ReactNode;
  children: ReactNode;
}

export class LoadBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.onError?.(error);
  }

  override render(): ReactNode {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}
