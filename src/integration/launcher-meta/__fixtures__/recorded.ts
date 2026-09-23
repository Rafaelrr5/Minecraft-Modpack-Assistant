/**
 * Field projections of real Prism Launcher metadata responses, read from
 * `https://meta.prismlauncher.org/v1/<uid>/index.json` on 2026-09-23.
 *
 * These are **projections, not production defaults**: only the fields the adapter reads are kept,
 * and the version lists are trimmed to a handful of entries. The shape (`{ formatVersion, name,
 * uid, versions: [{ version, … }] }`) is preserved verbatim so the parser is tested against the real
 * contract, not an idealized one.
 */

export const NET_MINECRAFT_INDEX = {
  formatVersion: 1,
  name: 'Minecraft',
  uid: 'net.minecraft',
  versions: [
    {
      recommended: false,
      releaseTime: '2024-08-08T12:24:45+00:00',
      requires: [{ suggests: '3.3.3', uid: 'org.lwjgl3' }],
      sha256: 'f2f32e15aee292182e43b5fe5d0e27e67719e1549f1fc9af78207ab604ab4d73',
      type: 'release',
      version: '1.21.1',
    },
    {
      recommended: false,
      releaseTime: '2023-06-07T11:29:11+00:00',
      type: 'release',
      version: '1.20.1',
    },
  ],
} as const;

export const NET_NEOFORGED_INDEX = {
  formatVersion: 1,
  name: 'NeoForge',
  uid: 'net.neoforged',
  versions: [
    {
      recommended: false,
      releaseTime: '2026-09-18T16:17:21.691325+00:00',
      requires: [{ equals: '1.21.1', uid: 'net.minecraft' }],
      sha256: '6d2d6688bd34566981b1538e130779aca34c36cddbcb0357045c3aa43f50ab19',
      version: '21.1.251',
    },
    {
      recommended: false,
      requires: [{ equals: '1.21.1', uid: 'net.minecraft' }],
      version: '21.1.62',
    },
  ],
} as const;

export const FABRIC_LOADER_INDEX = {
  formatVersion: 1,
  name: 'Fabric Loader',
  uid: 'net.fabricmc.fabric-loader',
  versions: [
    {
      recommended: true,
      releaseTime: '2026-08-28T11:01:04+00:00',
      requires: [{ uid: 'net.fabricmc.intermediary' }],
      type: 'release',
      version: '0.19.5',
    },
  ],
} as const;
