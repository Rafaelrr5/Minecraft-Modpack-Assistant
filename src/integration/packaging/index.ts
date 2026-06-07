/**
 * The `packaging` integration adapter (spec 0015, Phase 7): materializes a core {@link ExportArtifact}
 * into a single distributable archive on disk. It owns the only side effect in the export path — a
 * deterministic, dependency-free store-only ZIP writer (byte-stable, Constitution P7) plus a reader
 * used to validate the result (P3). The core never imports this; the CLI wires it in.
 */
export * from './zip.ts';
export * from './packaging-exporter.ts';
