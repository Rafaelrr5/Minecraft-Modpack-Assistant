/**
 * The SNBT serializer/parser — an FTB-agnostic NBT-in-text codec (spec 0011 FR-1/FR-5).
 * Reusable by spec 0012 (KubeJS) and anything else that must emit validated SNBT.
 */
export * from './types.ts';
export * from './serialize.ts';
export * from './parse.ts';
