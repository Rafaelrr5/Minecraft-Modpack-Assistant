/**
 * Library entry point. Re-exports the UI-agnostic core (domain + ports) and the integration
 * adapters that implement those ports, so consumers (the CLI today, a web/SaaS layer later)
 * build on one surface. The CLI is a separate `bin` and is intentionally not exported here.
 */
export * from './core/index.ts';
export * from './integration/logging/index.ts';
export * from './integration/instance-fs/index.ts';
export * from './integration/modrinth/index.ts';
export * from './integration/nvidia/index.ts';
export * from './integration/packwiz/index.ts';
