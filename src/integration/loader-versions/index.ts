/**
 * The official loader-metadata adapter for the {@link LoaderVersionProvider} port (spec 0006 FR-8).
 * The only module in the tree that knows the Fabric/Quilt meta, NeoForge Maven and Forge promotions
 * endpoints; the core depends on the port alone (Constitution P2/P6).
 */
export * from './official-loader-versions.ts';
