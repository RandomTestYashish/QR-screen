/**
 * Issuer mark. Four modules in a 2x2 — the QR field reduced to its smallest
 * legible form, so the wordmark and the pass read as one system.
 */
export function PassMark() {
  return (
    <span
      aria-hidden="true"
      className="pass-surface grid size-6 shrink-0 place-items-center rounded-[8px]"
    >
      <svg viewBox="0 0 2 2" className="size-2.5" fill="var(--module)">
        <circle cx="0.5" cy="0.5" r="0.34" />
        <circle cx="1.5" cy="0.5" r="0.34" />
        <circle cx="0.5" cy="1.5" r="0.34" />
        <circle cx="1.5" cy="1.5" r="0.34" opacity="0.35" />
      </svg>
    </span>
  );
}
