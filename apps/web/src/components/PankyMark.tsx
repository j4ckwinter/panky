export function PankyMark({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`panky-mark${small ? " panky-mark-small" : ""}`}
      aria-hidden="true"
    >
      p
    </span>
  );
}
