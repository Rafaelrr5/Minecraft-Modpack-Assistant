/**
 * Synthetic examples of the four official loader-metadata feed shapes, used by the offline contract
 * tests. Lives under `__fixtures__/` so it is excluded from the build.
 *
 * These are NOT captured responses or evidence of published builds. Values/order are deliberately
 * chosen to test numeric sorting, target validation and stable filtering. The historical filename
 * is retained; endpoint/schema provenance is documented in DOMAIN-KNOWLEDGE §1.5.
 */

/** Synthetic sorting/stability cases shaped like Fabric metadata. */
export const FABRIC_LOADER_1_21_1 = [
  {
    loader: { separator: '.', build: 10, maven: 'net.fabricmc:fabric-loader:0.16.10', version: '0.16.10', stable: true },
    intermediary: { maven: 'net.fabricmc:intermediary:1.21.1', version: '1.21.1', stable: true },
  },
  {
    loader: { separator: '.', build: 9, maven: 'net.fabricmc:fabric-loader:0.16.9', version: '0.16.9', stable: true },
    intermediary: { maven: 'net.fabricmc:intermediary:1.21.1', version: '1.21.1', stable: true },
  },
  {
    loader: { separator: '.', build: 0, maven: 'net.fabricmc:fabric-loader:0.17.0-beta.1', version: '0.17.0-beta.1', stable: false },
    intermediary: { maven: 'net.fabricmc:intermediary:1.21.1', version: '1.21.1', stable: true },
  },
];

/** Synthetic Quilt cases (the feed may omit `stable`). */
export const QUILT_LOADER_1_21_1 = [
  {
    loader: { separator: '.', build: 4, maven: 'org.quiltmc:quilt-loader:0.26.4', version: '0.26.4' },
    hashed: { maven: 'org.quiltmc:hashed:1.21.1', version: '1.21.1' },
  },
  {
    loader: { separator: '.', build: 0, maven: 'org.quiltmc:quilt-loader:0.27.0-beta.1', version: '0.27.0-beta.1' },
    hashed: { maven: 'org.quiltmc:hashed:1.21.1', version: '1.21.1' },
  },
];

/** Synthetic unsorted NeoForge inventory. */
export const NEOFORGE_MAVEN_VERSIONS_PAYLOAD = {
  isSnapshot: false,
  versions: [
    '20.2.3-beta',
    '20.2.88',
    '20.4.237',
    '21.1.57',
    '21.1.62',
    '21.1.9',
    '21.4.0-beta',
  ],
};

/** Synthetic Forge promotions (not a captured response). */
export const FORGE_PROMOTIONS_PAYLOAD = {
  homepage: 'https://files.minecraftforge.net/',
  promos: {
    '1.20.1-recommended': '47.3.0',
    '1.20.1-latest': '47.3.12',
    '1.21.1-recommended': '52.1.0',
    '1.21.1-latest': '52.1.16',
    '1.21.4-latest': '54.0.16',
  },
};
