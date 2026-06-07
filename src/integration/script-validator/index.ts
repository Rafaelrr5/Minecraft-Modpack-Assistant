/**
 * The script-validator integration — a {@link ScriptValidator} adapter that parse-checks generated
 * KubeJS scripts with a real JS engine before they are written (spec 0012, DOMAIN §7.3). Behind the
 * provider-agnostic port (Constitution P6); compile-only, never executes the script (P3/P4).
 */
export * from './vm-script-validator.ts';
