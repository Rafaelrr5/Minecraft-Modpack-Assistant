/**
 * An in-memory {@link LoaderVersionProvider} for the loader-pinning tests (spec 0006 FR-8). Lives
 * under `__fixtures__/` so it is excluded from the build. No network, no clock — the core is
 * exercised entirely offline (Constitution P3).
 */
import type { LoaderFamily } from '../../domain/index.ts';
import type { LoaderVersionProvider } from '../../ports/index.ts';

export interface FakeLoaderVersionsOptions {
  /** `"<family>@<minecraft>" → concrete build`. A missing key resolves to `undefined`. */
  readonly versions?: Readonly<Record<string, string>>;
  /** When set, every lookup rejects with this message (metadata outage / HTTP error). */
  readonly failWith?: string;
}

export interface FakeLoaderVersions extends LoaderVersionProvider {
  /** Every `(family, minecraft)` pair the core asked for, in order. */
  readonly calls: readonly string[];
}

export function fakeLoaderVersions(options: FakeLoaderVersionsOptions = {}): FakeLoaderVersions {
  const calls: string[] = [];
  return {
    id: 'fake-loader-versions',
    calls,
    resolveLatest(family: LoaderFamily, minecraftVersion: string): Promise<string | undefined> {
      calls.push(`${family}@${minecraftVersion}`);
      if (options.failWith !== undefined) return Promise.reject(new Error(options.failWith));
      return Promise.resolve(options.versions?.[`${family}@${minecraftVersion}`]);
    },
  };
}
