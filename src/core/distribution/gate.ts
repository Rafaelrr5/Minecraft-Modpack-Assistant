/**
 * The distribution gate (spec 0023) — a single, shared answer to one question: **may this resolved
 * set be materialized or distributed?**
 *
 * `resolveModpack` (spec 0006) already surfaces everything it could not resolve as an
 * {@link OrchestrationIssue}. Three of those codes mean the set is known to be broken — a mod with
 * no compatible build, a required dependency that cannot be resolved, or two mods that declare each
 * other incompatible. A pack in that state must not be written into an instance (spec 0008) nor
 * projected into a shareable archive (specs 0015/0016): distributing it hands someone a pack that
 * cannot launch.
 *
 * UI-agnostic core (Constitution P2) and pure — no I/O, no clock. The adapters (CLI, desktop,
 * assistant) ask this module and obey; they never re-implement the rule, so there is exactly one
 * gate and no second bypass path.
 */
import type { OrchestrationIssue, OrchestrationIssueCode } from '../orchestration/types.ts';
import type { ExportArtifact } from '../export/types.ts';
import type { BuildArtifacts } from '../build/types.ts';
import type { PackFile } from '../ports/index.ts';

/**
 * The issue codes that make a set undistributable. `provider-error` is deliberately **not** here:
 * it means the catalog lookup failed, i.e. we do not know — it is reported as a warning, never
 * silently promoted to a verdict (Constitution P5).
 */
export const BLOCKING_ISSUE_CODES = [
  'unresolved',
  'unsatisfied-dependency',
  'incompatible',
] as const satisfies readonly OrchestrationIssueCode[];

export type BlockingIssueCode = (typeof BLOCKING_ISSUE_CODES)[number];

/** Process exit code used by every command that refuses to act on a blocked pack. */
export const EXIT_BLOCKED = 3;

/** The marker written into an instance / archive produced under an expert override (FR-4). */
export const UNSUPPORTED_MARKER_FILE = 'MPA-UNSUPPORTED.txt';

/** The exact flag an expert must pass to override the gate — one unambiguous opt-in (FR-3). */
export const OVERRIDE_FLAG = '--allow-unsupported';

export function isBlockingIssue(issue: OrchestrationIssue): boolean {
  return (BLOCKING_ISSUE_CODES as readonly OrchestrationIssueCode[]).includes(issue.code);
}

/** The subset of `issues` that blocks a build/export/release, in the order they were reported. */
export function blockingIssues(
  issues: readonly OrchestrationIssue[],
): readonly OrchestrationIssue[] {
  return issues.filter(isBlockingIssue);
}

/** True when the resolved set may not be materialized or distributed as-is. */
export function isBlocked(issues: readonly OrchestrationIssue[]): boolean {
  return issues.some(isBlockingIssue);
}

const CODE_LABEL: Readonly<Record<BlockingIssueCode, string>> = {
  unresolved: 'no compatible build',
  'unsatisfied-dependency': 'unresolved required dependency',
  incompatible: 'declared incompatibility',
};

function label(issue: OrchestrationIssue): string {
  return CODE_LABEL[issue.code as BlockingIssueCode] ?? issue.code;
}

function issueLines(issues: readonly OrchestrationIssue[]): string[] {
  return issues.map((i) => {
    const related = i.relatedRef ? ` ↔ ${i.relatedRef}` : '';
    return `    ✖ ${i.projectRef}${related} — ${label(i)}: ${i.message}`;
  });
}

/**
 * Explain the refusal (Constitution P8: plain verdict first, then the expert detail). `command` is
 * the command that refused (`build`/`export`/`release`); `verb` is what it would have done.
 */
export function renderBlockedReport(
  issues: readonly OrchestrationIssue[],
  context: { readonly command: string; readonly verb: string },
): string {
  const blocking = blockingIssues(issues);
  const lines = [
    `Blocked: this pack cannot be ${context.verb} — ${blocking.length} unresolved/incompatible issue(s).`,
    ...issueLines(blocking),
    '',
    `  Nothing was written. Run 'orchestrate' to inspect the set, then remove or replace the`,
    `  mods above and re-run '${context.command}'.`,
    `  Experts only: ${OVERRIDE_FLAG} proceeds anyway and marks the result UNSUPPORTED`,
    '  (it may not launch; do not distribute it).',
  ];
  return `${lines.join('\n')}\n`;
}

/** One line confirming an override was used — printed before anything is produced (FR-4). */
export function renderOverrideNotice(
  issues: readonly OrchestrationIssue[],
  context: { readonly verb: string },
): string {
  const n = blockingIssues(issues).length;
  return (
    `⚠ ${OVERRIDE_FLAG}: ${context.verb} anyway with ${n} unresolved/incompatible issue(s). ` +
    `The result is marked UNSUPPORTED (${UNSUPPORTED_MARKER_FILE}) and may not launch.\n`
  );
}

/**
 * The contents of {@link UNSUPPORTED_MARKER_FILE}: why the artifact is unsupported, in full. Pure
 * and deterministic — no clock, no environment (Constitution P7).
 */
export function renderUnsupportedMarker(
  issues: readonly OrchestrationIssue[],
  context: { readonly command: string },
): string {
  const blocking = blockingIssues(issues);
  const lines = [
    'UNSUPPORTED PACK',
    '===============',
    '',
    `This artifact was produced by 'mpa ${context.command} ${OVERRIDE_FLAG}' from a resolved set`,
    'with known-blocking issues. It is NOT supported: it may fail to launch, and it should not be',
    'distributed as a working pack.',
    '',
    `Blocking issues (${blocking.length}):`,
    ...issueLines(blocking),
    '',
    "Re-resolve the set (run 'mpa orchestrate') and fix the issues above to produce a supported pack.",
  ];
  return `${lines.join('\n')}\n`;
}

/** The marker as a writable instance file (spec 0008 build artifacts). */
export function unsupportedMarkerFile(
  issues: readonly OrchestrationIssue[],
  context: { readonly command: string },
): PackFile {
  return { relPath: UNSUPPORTED_MARKER_FILE, contents: renderUnsupportedMarker(issues, context) };
}

/** Stamp a build's in-memory artifacts as unsupported, so the written instance carries the reason. */
export function withUnsupportedInstanceMarker(
  artifacts: BuildArtifacts,
  issues: readonly OrchestrationIssue[],
  context: { readonly command: string },
): BuildArtifacts {
  return {
    ...artifacts,
    files: [...artifacts.files, unsupportedMarkerFile(issues, context)],
  };
}

/** Insert `-unsupported` before the artifact's extension (`pack-0.1.0.mrpack` → `…-unsupported.mrpack`). */
function unsupportedFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot <= 0
    ? `${fileName}-unsupported`
    : `${fileName.slice(0, dot)}-unsupported${fileName.slice(dot)}`;
}

/**
 * Stamp an export/release artifact as unsupported: the marker file is added to the archive and the
 * suggested file name carries `-unsupported`, so neither the archive nor its name can pass for a
 * supported pack (FR-4). Pure — returns a new artifact.
 */
export function withUnsupportedMarker(
  artifact: ExportArtifact,
  issues: readonly OrchestrationIssue[],
  context: { readonly command: string },
): ExportArtifact {
  return {
    ...artifact,
    fileName: unsupportedFileName(artifact.fileName),
    entries: [
      ...artifact.entries,
      { path: UNSUPPORTED_MARKER_FILE, contents: renderUnsupportedMarker(issues, context) },
    ],
  };
}
