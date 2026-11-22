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
- `extract.ts` walks Marked nodes into plain strings for readable prose, table cells, code, and literal HTML. Display metadata does not belong in extraction.
- `search.ts` prepares Unicode search projections, ranks matches, and creates completion edits; query evaluation stays in memory. Completion edits are the single source of preview and insertion text.
- `history.ts` loads all message pages for the active session and combines them with live transcript updates, owns loading/failure/retry state, and cancels outdated requests.
- `suggestions.tsx` owns display-row folding, timestamps, its eight-row viewport, theme-derived stripes and the one-row footer. The viewport measures preview heights only. Symmetric side markers use existing padding and close around the visible previews; empty states, filler and footer have no markers. The pieces belong to their candidate rows so mouse selection works on both sides. Alternating stripes adjust the dialog background's HSL lightness by +8 percentage points in dark mode or -8 in light mode, clamped to 0–100%, preserving hue, saturation and alpha. The host's `themeMode` determines the direction; text colors do not affect the stripe. The footer layout is pure; rendering owns colors and action handlers. `library-dialog.tsx` owns library interfaces; `tui.tsx` registers and disposes them.

Candidate rows place the left marker, two-column emoji and preview text directly next to each other. Only the timestamp has a one-column left margin; footer and empty-state padding are independent.

Prefer inferred types, early returns, and small functions with clear responsibilities. Avoid `any`, unnecessary destructuring, and single-use abstractions. Comment on non-obvious host constraints rather than restating code. Test the implementation using real OpenTUI components where practical.

## Prepare release artifacts

Keep the root and package copies of both READMEs (English and Simplified Chinese), their images, both usage guides, CONTRIBUTING, VALIDATION, LICENSE, and THIRD_PARTY_NOTICES identical. Update both languages when behavior or installation instructions change. Update `release-files.json` when adding public files.

From `packages/occo`:

```sh
bun run pack
bun run release:source
```

The first command builds the installable archive. The second checks its inventory, scans release contents for local paths, common credential formats, and non-default package registries, checks documentation copies, and creates a source archive using the explicit file list. Both archives are written to `artifacts/`. Review their contents before publishing; automated checks cannot identify every kind of sensitive information.

The package is intentionally marked private to prevent accidental registry publication. Source and archive distribution do not require an npm release. Retain the MIT license and third-party notices in every distribution.

## Refresh the README screenshots

On Windows, with Windows Terminal and its PowerShell profile available, and official OpenCode 2.3.0 on PATH (or its executable path in `OPENCODE_BIN`), run from `packages/occo`:

```powershell
bun run screenshots
```

The command opens a separate Windows Terminal window with `pwsh.exe`. It uses the `PowerShell` profile by default; set `OCCO_TERMINAL_PROFILE` to use another profile. The window keeps its default startup size, font and zoom; the script does not resize, maximize or position it, and needs no reference window. It records the actual viewport and pixel dimensions. Subsequent inputs and captures must match that recorded layout, so all scenes in one run use the same size. A mismatch stops capture rather than resizing the image.

Keep the demonstration window in the foreground while the command types into it. Windows native window capture reads the complete terminal content even when the taskbar overlaps the window. Only native window chrome, such as the title bar, is excluded. PNG files retain the original pixel dimensions. Text is not redrawn, and the OpenCode layout is not cropped or rearranged.

Each run uses a fresh configuration and data directory under `tmp/occo-readme-*`. It creates English and Chinese examples with three suggestions each: regression tests from a conversation table, and saved prompts with one-, two- and folded three-row previews. It checks source visibility, automatic menu opening and insertion without sending, then copies the four images to both documentation directories. It types only into its own window and does not press F12 or change the clipboard. The window closes when the run ends. Normal host tests keep their existing fixtures and directories.

Review all four images before packaging, including the full interface and any visible paths. Runtime files and window measurements stay in the temporary directory.

### Frame the existing captures

`bun run screenshots` also creates framed display copies. To refresh only the frames without opening a terminal, run `bun run screenshots:frame` from `packages/occo`.

The frame uses an 80px transparent margin, 10px padding, a 24px corner radius and a `#15181D` shell. A 2px white outline at 15% opacity and a 1px black inner line at 30% opacity define its edges. Two black shadows provide depth: a 16% ambient shadow offset 16px down with three 14px-radius box-blur passes, and a 12% contact shadow offset 4px down with three 3px-radius passes. Each pass blurs both axes. All measurements refer to the original image pixels.

The generator copies the original screenshot at its native size without clipping its corners. It checks every decoded pixel in the copied region, shadow falloff and transparent canvas edges. Review the results on light and dark backgrounds at full size and around 900px display width. To check existing display copies without rewriting them, run `powershell -NoProfile -File script/frame-screenshots.ps1 -CheckOnly`.

README images use the `*-framed.png` files and link to the original PNGs. Keep both versions in the source and installable archives.
