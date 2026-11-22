# Contributing

Use Bun 1.4.3 and the pinned OpenCode 2.3.0 / OpenTUI 0.8.4 baseline. Keep fixes within the plugin; do not introduce a host fork or a compatibility layer for older APIs.

## Set up and check a change

From the repository root:

```sh
bun install --frozen-lockfile
cd packages/occo
bun test
bun typecheck
bun run build
```

Run tests and type checking from `packages/occo`, not the repository root. For input, rendering, storage, or lifecycle changes, also run `bun run test:host` with official OpenCode 2.3.0 available. See [VALIDATION.md](VALIDATION.md) for setup and coverage.

Work on a short-lived branch from `main`. A pull request should explain the user-visible problem, the change, and how it was tested. Include a minimal reproduction for bug fixes. Use synthetic prompt text in fixtures; remove private paths, credentials, and conversation content from reports and screenshots.

## Code boundaries

- `composer.ts` is the only production module that writes to the native prompt. Preserve native undo, attachment marks, and stale-draft protection.
- `library.ts` is the only production module that changes persistent prompt-library state. Keep conflict checks and failure recovery intact.
- `search.ts` extracts and ranks text; query evaluation stays in memory.
- `suggestions.tsx` and `library-dialog.tsx` own the interfaces; `tui.tsx` registers and disposes them.

Prefer inferred types, early returns, and small functions with clear responsibilities. Avoid `any`, unnecessary destructuring, and single-use abstractions. Comment on non-obvious host constraints rather than restating code. Test the implementation using real OpenTUI components where practical.

## Prepare release artifacts

Keep the root and package copies of both READMEs (English and Simplified Chinese), their images, both usage guides, CONTRIBUTING, VALIDATION, LICENSE, and THIRD_PARTY_NOTICES identical. Update both languages when behavior or installation instructions change. Update `release-files.json` when adding public files.

From `packages/occo`:

```sh
bun run pack
bun run release:source
```

The first command builds the installable archive. The second checks its inventory, scans release contents for local paths and common credential formats, checks documentation copies, and creates a source archive using the explicit file list. Both archives are written to `artifacts/`. Review their contents before publishing; automated checks cannot identify every kind of sensitive information.

The package is intentionally marked private to prevent accidental registry publication. Source and archive distribution do not require an npm release. Retain the MIT license and third-party notices in every distribution.

## Refresh the README screenshots

On Windows, open a Windows Terminal PowerShell window at the size and zoom you want to capture. Use one pane. With official OpenCode 2.3.0 on PATH (or its executable path in `OPENCODE_BIN`), run from `packages/occo`:

```powershell
bun run screenshots
```

The command opens a separate Windows Terminal window with `pwsh.exe`. It uses the `PowerShell` profile by default; set `OCCO_TERMINAL_PROFILE` to use another profile. The new window must match the reference window's font, cell dimensions, DPI, and terminal viewport size. A mismatch stops the capture instead of resizing the image.

Keep the demonstration window visible and unobstructed while the command runs. The capture reads the entire terminal content area directly from the screen, excluding Windows Terminal's title bar and the taskbar. PNG files retain the original pixel dimensions. Text is not redrawn, and the OpenCode layout is not cropped or rearranged.

Each run uses a fresh configuration and data directory under `tmp/occo-readme-*`. It creates English and Chinese examples for conversation reuse and saved prompts, checks automatic menu opening and insertion without sending, then copies the four images to both documentation directories. It types only into its own window, does not press F12 or change the clipboard, and makes no model calls. The window closes when the run ends. Normal host tests keep their existing fixtures and directories.

Review all four images before packaging, including the full interface and any visible paths. Runtime files and window measurements stay in the temporary directory.

### Frame the existing captures

`bun run screenshots` also creates framed display copies. To refresh only the frames without opening a terminal, run `bun run screenshots:frame` from `packages/occo`.

The frame adds a transparent margin, a dark rounded shell, a thin border, and a soft shadow. It copies the original screenshot at its native size without clipping its corners. The generator checks every decoded pixel in the copied region and verifies that the shadow does not touch the canvas edges. To check existing display copies without rewriting them, run `powershell -NoProfile -File script/frame-screenshots.ps1 -CheckOnly`.

README images use the `*-framed.png` files and link to the original PNGs. Keep both versions in the source and installable archives.
