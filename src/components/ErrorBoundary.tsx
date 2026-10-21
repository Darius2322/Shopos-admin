import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Nothing in this app previously caught a render error anywhere — any
// thrown error (a stale JS chunk reference after a redeploy, a runtime
// bug, an IndexedDB/Dexie schema mismatch) went straight to a blank
// screen with no message, which matches exactly what was reported on
// Users/Analytics/Sales. This won't fix whatever the underlying bug was,
// but it turns "silent blank screen, no way to know what happened" into
// "visible error + a way to recover" — and the visible message is what
// makes the *next* occurrence actually diagnosable instead of another
// screenshot of a black rectangle.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Render error caught by ErrorBoundary:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A failed dynamic import (lazy-loaded chunk referencing a JS file
    // that no longer exists after a new deploy) is by far the most
    // common cause of an otherwise-inexplicable blank screen in an app
    // that lazy-loads routes — Analytics is lazy-loaded here. A reload
    // fetches the current build and resolves it immediately.
    const isChunkError = /dynamically imported module|Failed to fetch|Loading chunk/i.test(error.message);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-paper">
        <p className="text-sm font-medium mb-1">Something went wrong loading this page</p>
        <p className="text-xs text-slate-500 max-w-xs mb-4">
          {isChunkError
            ? "This usually happens right after an update — reloading should fix it."
            : error.message}
        </p>
        <button onClick={() => window.location.reload()} className="btn-primary text-sm px-4 py-2">
          Reload
        </button>
      </div>
    );
  }
}
