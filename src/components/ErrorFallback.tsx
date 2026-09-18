import type { FallbackProps } from "react-error-boundary";
import "./ErrorFallback.css";

/**
 * Top-level error boundary fallback. `react-error-boundary` is used
 * instead of hand-rolling a `class extends React.Component` boundary —
 * React still requires a class under the hood for `componentDidCatch`,
 * but this library wraps that in a hook-friendly API so no class appears
 * in application code.
 *
 * The message shown is generic on purpose: `error.message` is not
 * rendered here, since a thrown error can carry stack traces or other
 * internal detail that shouldn't be exposed in the UI.
 */
export function ErrorFallback({ resetErrorBoundary }: FallbackProps) {
  return (
    <div className="error-fallback" role="alert">
      <h2>Something went wrong</h2>
      <p>The dashboard hit an unexpected error and stopped rendering this section.</p>
      <button type="button" onClick={resetErrorBoundary}>
        Try again
      </button>
    </div>
  );
}
