import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("UI crash", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 text-center">
            <h1 className="text-lg font-semibold text-white">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-400">
              The page hit an unexpected error. Reload to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
