/**
 * The `distribution` capability module (spec 0023): the one gate that decides whether a resolved
 * set may be materialized into an instance or projected into a distributable archive. Pure,
 * UI-agnostic core (Constitution P2) — adapters call it, none of them re-implement it.
 */
export * from './gate.ts';
