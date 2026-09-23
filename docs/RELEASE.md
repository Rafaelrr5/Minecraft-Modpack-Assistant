# Release guide — Windows desktop installer

How the Windows installer is built, what it does and does not guarantee, and how a user verifies
what they downloaded. Scope: spec [`0022-desktop-app`](../specs/0022-desktop-app/spec.md), task
T-0022-12. The CLI is distributed from source and is not covered here.

---

## Building the installer

```bash
npm ci                 # strict peers; the repo pins legacy-peer-deps=false in .npmrc
npm run desktop:dist   # electron-vite build → electron-builder → SHA256SUMS.txt
```

Artifacts land in `release/` (git-ignored):

| File | What it is |
| --- | --- |
| `MinecraftModpackAssistant-Setup-<version>-x64.exe` | The NSIS installer users download |
| `SHA256SUMS.txt` | SHA-256 of every distributable artifact, coreutils format |
| `...exe.blockmap` | electron-builder's differential-download map (not distributed) |
| `win-unpacked/` | The unpacked app the installer wraps (build by-product) |
| `builder-debug.yml` | electron-builder's own log (build by-product) |

The artifact name is pinned in `electron-builder.yml`. The electron-builder default
(`${productName} Setup ${version}.exe`) contains spaces, which makes checksum files, download URLs
and scripted installs needlessly awkward.

### Build environment

Building on Windows needs no elevation and no Developer Mode with the current toolchain
(electron-builder 26 / electron 44, verified on Windows 11 26200). This was not always true:
electron-builder 25 fetched a `winCodeSign` bundle containing **symlinks**, and extracting symlinks
on Windows requires Developer Mode or an elevated shell, so the NSIS stage failed with a permission
error on a normal user session. electron-builder 26 no longer extracts that bundle for an unsigned
Windows build. If a future change enables code signing and the failure returns, it is an
**environment** requirement (enable Developer Mode, or run the build elevated), not a configuration
bug to patch around.

The first `desktop:dist` on a machine downloads the Electron binary, 7-Zip, and the NSIS toolchain
into electron-builder's user-level cache. Subsequent builds reuse it and are much faster.

### Regenerating the icon

`build-resources/icon.ico` is **generated from code**, not hand-drawn:

```bash
npm run desktop:icon                      # rewrite build-resources/icon.ico
node scripts/generate-icon.mjs --check    # fail if the committed file drifts
```

`scripts/generate-icon.mjs` is pure deterministic math on the standard library (no image
dependency, no network, no randomness), so it emits byte-identical output on any machine.
`src/desktop/icon.test.ts` runs the generator inside `npm run check` and fails if the committed
`.ico` differs, so the binary in the repo can always be re-derived and reviewed.

It lives in `build-resources/`, not the conventional electron-builder `build/`, because `/build/`
is git-ignored in this repo as a compiler output directory. An icon committed there would be
absent from a clean checkout and CI, and electron-builder would fall back to the default Electron
icon with only a log line. The icon test asserts the path is not git-ignored.

---

## Code signing: absent in the alpha, by decision

**The alpha installer is unsigned.** There is no Authenticode certificate for this project yet.

This is stated explicitly in `electron-builder.yml` (`signAndEditExecutable: false`) rather than
left to chance. Without an explicit setting, electron-builder signs or does not sign depending on
whether `CSC_LINK` / `WIN_CSC_LINK` happens to be set in the environment, which makes the artifact
machine-dependent — the opposite of reproducible.

What users will see on first run:

> **Windows protected your PC** — Microsoft Defender SmartScreen prevented an unrecognised app from
> starting.
>
> Click **More info** → **Run anyway**.

Until a certificate exists, the SHA-256 checksum below is the only integrity signal we offer, and
the release notes must say so. To sign later: remove `signAndEditExecutable: false`, provide
`CSC_LINK` (base64 `.pfx`) and `CSC_KEY_PASSWORD` as CI secrets, and update this section — the
packaging test only requires that the posture be explicit, not that it be "unsigned".

---

## Verifying a download

`SHA256SUMS.txt` uses the classic coreutils format (`<hex>  <name>`), sorted by file name.

Windows (PowerShell or cmd, no install required):

```
certutil -hashfile MinecraftModpackAssistant-Setup-0.1.0-x64.exe SHA256
```

Compare the printed hash with the line in `SHA256SUMS.txt`. Linux/macOS, or a Git Bash shell on
Windows:

```bash
sha256sum -c SHA256SUMS.txt      # Linux / Git Bash
shasum -a 256 -c SHA256SUMS.txt  # macOS
```

Maintainers can re-verify a `release/` directory in one step:

```bash
node scripts/checksum-release.mjs --check
```

electron-builder also writes a `latest.yml` containing a base64 SHA-512 for its auto-updater. This
project does not ship auto-update, and that format is not something a person can check by hand, so
`SHA256SUMS.txt` is the published checksum.

---

## Release checklist

Automated (`npm run check` + `npm run desktop:typecheck`; CI runs both):

- [ ] `build-resources/icon.ico` matches `scripts/generate-icon.mjs` and is not git-ignored
- [ ] `package.json` has `author`, `description`, `version`
- [ ] `electron-builder.yml` pins an icon, a copyright, a space-free artifact name, and an explicit
      signing posture
- [ ] `desktop:dist` still chains the checksum step
- [ ] packaging globs still cover the CommonJS preload bundle

Manual, on a real Windows machine — these cannot be asserted from a test process and must be
re-done for each release:

- [ ] `npm run desktop:dist` exits 0 and writes the `.exe` plus `SHA256SUMS.txt`
- [ ] the installer's header and the installed `.exe` show the app icon, not the Electron default
- [ ] the installer runs, offers a directory choice, and completes
- [ ] the installed app launches and the UI reaches the core (the doctor view renders a report:
      this is the packaged-app equivalent of `npm run desktop:smoke`)
- [ ] Start-menu and desktop shortcuts exist and launch the app
- [ ] uninstall from **Settings → Apps** removes the app and the shortcuts, and leaves user data in
      `%APPDATA%` untouched (`deleteAppDataOnUninstall: false` — Constitution P4: never delete what
      the user did not ask us to)

Record the result of the manual block in the release notes, including the exact Windows build it
was verified on. Verified for 0.1.0 (alpha) on Windows 11 build 26200, x64.
