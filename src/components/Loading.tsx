import "./Loading.css";

interface LoadingProps {
  label?: string;
}

export function Loading({ label = "Connecting to live feed…" }: LoadingProps) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <span className="loading__spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
