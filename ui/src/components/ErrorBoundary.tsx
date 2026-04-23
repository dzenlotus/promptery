import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Safety net for React-thrown exceptions. A crash anywhere beneath this
 * boundary renders a fallback instead of unmounting the entire tree — keeping
 * unrelated UI interactive and preserving any in-flight work outside the
 * failing subtree.
 *
 * Class component because React's only official error-boundary API lives on
 * `componentDidCatch` / `getDerivedStateFromError`. No hook equivalent yet.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div
        role="alert"
        data-testid="error-boundary-fallback"
        className="m-4 grid gap-2 rounded-lg border border-red-400/40 bg-red-500/10 p-4 text-sm"
      >
        <p className="font-medium text-red-300">Something went wrong</p>
        <pre className="whitespace-pre-wrap text-xs text-[var(--color-text-muted)]">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={this.reset}
          className="justify-self-start rounded bg-[var(--hover-overlay)] px-3 py-1.5 text-xs hover:bg-[var(--active-overlay)]"
        >
          Try again
        </button>
      </div>
    );
  }
}
