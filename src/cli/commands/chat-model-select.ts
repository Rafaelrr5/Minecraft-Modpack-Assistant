/**
 * Shared LLM-provider resolution for the CLI's model-backed commands (`assistant`, and the
 * `quests`/`kubejs` `--describe` authoring path). Centralizes the **`MPA_LLM_PROVIDER`** switch
 * (spec 0021 FR-6) so every caller agrees on which provider is chosen; each caller phrases its own
 * user-facing note (different wording for a guided session vs. an authoring draft).
 *
 * Selection is pure (env in → decision out), so the missing-key / wrong-provider paths are testable
 * with no network. Provider order when `MPA_LLM_PROVIDER` is unset is **auto**: NVIDIA first (its key
 * is the pre-existing default), then Google.
 */

export type LlmProvider = 'nvidia' | 'google';

/** Env vars that carry a Google (AI Studio / Gemini) key, in precedence order. */
const GOOGLE_KEY_VARS = ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] as const;

function hasGoogleKey(env: Record<string, string | undefined>): boolean {
  return GOOGLE_KEY_VARS.some((name) => Boolean(env[name]));
}

/** Why no provider could be resolved — lets each caller render an apt message. */
export type NoProviderReason =
  | 'no-key' // auto mode, but no provider key is set
  | 'requested-nvidia-no-key' // MPA_LLM_PROVIDER=nvidia but NVIDIA_API_KEY missing
  | 'requested-google-no-key' // MPA_LLM_PROVIDER=google but GEMINI_API_KEY/GOOGLE_API_KEY missing
  | 'unknown-provider'; // MPA_LLM_PROVIDER set to something other than nvidia/google

export interface ProviderResolution {
  /** The provider to use, or `null` when none is available/selected. */
  readonly provider: LlmProvider | null;
  /** Present only when `provider` is `null`. */
  readonly reason?: NoProviderReason;
  /** The raw `MPA_LLM_PROVIDER` value, when it was set to an unknown provider. */
  readonly requested?: string;
}

/**
 * Resolve which LLM provider to use from the environment. Honors an explicit `MPA_LLM_PROVIDER`
 * (`nvidia` | `google`); otherwise auto-detects by available key (NVIDIA, then Google). Never
 * constructs anything — it only decides.
 */
export function resolveLlmProvider(
  env: Record<string, string | undefined> = process.env,
): ProviderResolution {
  const requested = env.MPA_LLM_PROVIDER?.trim().toLowerCase();

  if (requested === 'nvidia') {
    return env.NVIDIA_API_KEY ? { provider: 'nvidia' } : { provider: null, reason: 'requested-nvidia-no-key' };
  }
  if (requested === 'google') {
    return hasGoogleKey(env) ? { provider: 'google' } : { provider: null, reason: 'requested-google-no-key' };
  }
  if (requested) {
    return { provider: null, reason: 'unknown-provider', requested };
  }

  // Auto: prefer NVIDIA (the pre-existing default), then Google.
  if (env.NVIDIA_API_KEY) return { provider: 'nvidia' };
  if (hasGoogleKey(env)) return { provider: 'google' };
  return { provider: null, reason: 'no-key' };
}

/** Human-readable provider name for user-facing notes. */
export function providerLabel(provider: LlmProvider): string {
  return provider === 'nvidia' ? 'NVIDIA' : 'Google Gemini';
}

/**
 * One-sentence explanation of why no provider was resolved, for a caller's user-facing note.
 * The `no-key` wording names both key vars so existing fallback messages stay actionable.
 */
export function describeNoProvider(resolution: ProviderResolution): string {
  switch (resolution.reason) {
    case 'requested-nvidia-no-key':
      return 'MPA_LLM_PROVIDER=nvidia but NVIDIA_API_KEY is not set.';
    case 'requested-google-no-key':
      return 'MPA_LLM_PROVIDER=google but GEMINI_API_KEY/GOOGLE_API_KEY is not set.';
    case 'unknown-provider':
      return `MPA_LLM_PROVIDER="${resolution.requested ?? ''}" is not a known provider (use "nvidia" or "google").`;
    case 'no-key':
    default:
      return 'No LLM provider key is set (NVIDIA_API_KEY or GEMINI_API_KEY).';
  }
}
