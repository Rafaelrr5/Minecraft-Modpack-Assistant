/**
 * The write confirmation gate (spec 0022, FR-4 / Constitution P4) — the single component every
 * write capability goes through, so the dry-run → review → confirm model is implemented once and
 * looks the same everywhere.
 *
 * Two properties this encodes, rather than leaving to each screen to remember:
 *  - **Confirm follows a preview.** `disabled` is set by the caller when no plan has been
 *    previewed yet, so the user cannot confirm a change set they have not seen.
 *  - **Overwriting is a second, separate decision.** When the previewed plan is destructive, the
 *    confirm button stays inert until the force checkbox is ticked; the core would refuse anyway,
 *    but the UI must not offer a button that it knows will be refused.
 */
export interface ConfirmWriteProps {
  /** What is about to be written, in plain language. */
  readonly title: string;
  /** Concrete consequence: which folder, how many files. */
  readonly summary: string;
  /** True when the previewed plan replaces existing files — gates the force checkbox. */
  readonly destructive: boolean;
  readonly force: boolean;
  readonly onForceChange: (force: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
}

export function ConfirmWrite({
  title,
  summary,
  destructive,
  force,
  onForceChange,
  onConfirm,
  onCancel,
  busy,
}: ConfirmWriteProps): JSX.Element {
  // The core refuses a destructive apply without force; don't offer a button that cannot succeed.
  const blocked = destructive && !force;

  return (
    <div className="confirm" role="dialog" aria-label={title}>
      <p>
        <strong>{title}</strong>
      </p>
      <p className="muted">{summary}</p>
      {destructive && (
        <>
          <p className="warn-line">
            This replaces files that already exist. A backup is taken before anything is
            overwritten, but this is a separate decision — tick the box to allow it.
          </p>
          <label className="inline">
            <input
              type="checkbox"
              checked={force}
              onChange={(e) => onForceChange(e.target.checked)}
            />
            Allow overwriting existing files
          </label>
        </>
      )}
      <div className="actions">
        <button
          className={`btn ${destructive ? 'danger' : ''}`}
          disabled={busy || blocked}
          onClick={onConfirm}
        >
          {busy ? 'Working…' : 'Confirm and write'}
        </button>
        <button className="btn ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
