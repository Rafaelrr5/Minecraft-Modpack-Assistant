/**
 * The `diagnose` command (spec 0010) — read a crash report / log from an instance and print a
 * categorized diagnosis with concrete remediation. A **thin adapter** (Constitution P2): it reads
 * files through the guarded `InstanceFs` (read-only), optionally fetches a mclo.gs second opinion
 * (only with `--mclogs`), calls the `crash-diagnosis` capability, and renders the result. It writes
 * **nothing** to the instance (Constitution P4).
 */
import {
  type DiagnosisContext,
  type DiagnosisInput,
  type DiagnosisReport,
  type InstanceFs,
  type LoaderFamily,
  type LogAnalysis,
  type LogAnalysisProvider,
  renderDiagnosis,
  runDiagnosis,
} from '../../core/index.ts';
import { GuardedInstanceFs } from '../../integration/instance-fs/index.ts';
import { createMcLogsAnalysisProvider } from '../../integration/mclogs/index.ts';

export interface DiagnoseOptions {
  readonly instancePath: string;
  /** Relative path to a specific crash report (e.g. `crash-reports/crash-….txt`). */
  readonly crashPath?: string;
  /** Relative path to the log; defaults to `logs/latest.log`. */
  readonly logPath?: string;
  /** Opt in to the mclo.gs second opinion (the only network call). */
  readonly mclogs?: boolean;
  readonly json?: boolean;
  readonly minecraft?: string;
  readonly loader?: LoaderFamily;
}

const DEFAULT_LOG_PATH = 'logs/latest.log';

/**
 * The structured outcome behind the rendered text (spec 0022 FR-2). A GUI renders the ranked
 * findings itself; `evidence: null` distinguishes "no crash report or log was found" from "found
 * evidence, nothing matched". Optional observer; the CLI path is unchanged.
 */
export interface DiagnoseRunDetail {
  /** `null` when neither a crash report nor a log could be read (nothing was diagnosed). */
  readonly report: DiagnosisReport | null;
  /** Which sources were actually read, for an honest "what this is based on" line. */
  readonly sources: { readonly crashReport: boolean; readonly log: boolean };
}

/**
 * Read the evidence, optionally fetch a second opinion, diagnose, and render. The `InstanceFs` and
 * the analyser are injected so this is testable without a real instance or the network.
 */
export async function runDiagnose(
  options: DiagnoseOptions,
  fs: InstanceFs,
  write: (text: string) => void,
  analyser?: LogAnalysisProvider,
  onDetail?: (detail: DiagnoseRunDetail) => void,
): Promise<number> {
  const logPath = options.logPath ?? DEFAULT_LOG_PATH;
  const crashReportText = options.crashPath
    ? await fs.readText(options.instancePath, options.crashPath)
    : null;
  const logText = await fs.readText(options.instancePath, logPath);

  if (!crashReportText && !logText) {
    onDetail?.({ report: null, sources: { crashReport: false, log: false } });
    write(
      `No crash report or log found under ${options.instancePath}.\n` +
        `  Looked for: ${options.crashPath ?? '(no --crash given)'} and ${logPath}.\n` +
        '  Point --crash at a crash-reports/crash-*.txt, or --log at a log file.\n',
    );
    return 0;
  }

  const context: DiagnosisContext = {
    ...(options.minecraft ? { minecraftVersion: options.minecraft } : {}),
    ...(options.loader ? { loader: options.loader } : {}),
  };

  // Second opinion is opt-in: only with --mclogs do we transmit the log off-machine (privacy / P4).
  let secondOpinion: LogAnalysis | undefined;
  if (options.mclogs && analyser) {
    const textForAnalysis = logText ?? crashReportText!;
    secondOpinion = await analyser.analyse(textForAnalysis);
  }

  const input: DiagnosisInput = {
    ...(crashReportText ? { crashReportText } : {}),
    ...(logText ? { logText } : {}),
    context,
    ...(secondOpinion ? { secondOpinion } : {}),
  };

  const report = runDiagnosis(input);
  onDetail?.({
    report,
    sources: { crashReport: crashReportText !== null, log: logText !== null },
  });
  write(renderDiagnosis(report, { json: options.json === true }));
  return 0; // diagnosis is informational; usage errors are signalled by the arg parser.
}

/** Wire to the guarded filesystem + the real mclo.gs provider for terminal use. */
export async function runDiagnoseCli(options: DiagnoseOptions): Promise<number> {
  const fs = new GuardedInstanceFs();
  const analyser = options.mclogs ? createMcLogsAnalysisProvider() : undefined;
  return runDiagnose(options, fs, (text) => process.stdout.write(text), analyser);
}
