/**
 * The `crash-diagnosis` capability module (spec 0010, Phase 4): crash/log text → a read-only,
 * categorized {@link DiagnosisReport} with concrete remediation, reconciling spec 0007's
 * *suspected* conflicts and optionally echoing a mclo.gs second opinion. UI-agnostic and
 * deterministic (Constitution P2/P3); the `diagnose` CLI command is a thin surface over
 * `runDiagnosis`. It diagnoses and proposes; it applies nothing (P4).
 */
export * from './types.ts';
export * from './ingest.ts';
export * from './remediation.ts';
export * from './diagnose.ts';
export * from './render.ts';
export { detectOutOfMemory } from './detectors/out-of-memory.ts';
export { detectWrongJava } from './detectors/wrong-java.ts';
export { detectMissingDependency } from './detectors/missing-dependency.ts';
export { detectMixinApply } from './detectors/mixin-apply.ts';
export { detectInvalidSide } from './detectors/invalid-side.ts';
export { detectGenericModException } from './detectors/generic-mod-exception.ts';
