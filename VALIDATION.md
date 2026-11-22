# Validation

Verified baseline: OpenCode 2.3.0, OpenTUI 0.8.4, Solid 1.9.17, Bun 1.4.3, Windows x64. Run tests from `packages/occo`.

## Unit and native-editor tests

```sh
bun test
bun typecheck
```

The tests exercise the search implementation and real OpenTUI text editors:

- Completed-message filtering, the ten-message limit, Markdown and code extraction.
- English and Chinese queries, ranking, deduplication, full saved-body insertion, and Unicode offsets.
- Stale drafts, cursor and session changes, protected attachment marks, and expanded pasted text.
- Native undo/redo: one step for insertion, two for replacement. OpenTUI 0.8.4 records replacement as deletion followed by insertion.

The search benchmark uses 1,000 fragments totaling 200,000 UTF-8 bytes. After 30 warm-up queries, it measures 100 queries and checks p95 against a 20ms budget. It prints the measured result and runtime; timings depend on the machine.

## Official-host integration

```sh
bun run test:host
```

Use official OpenCode 2.3.0 on PATH, or set `OPENCODE_BIN` to the executable. The harness launches two terminals in isolated projects and configuration directories. Its fixture provider points at a closed localhost port. No external model is needed.

Coverage includes:

- Automatic suggestions, arrow selection, mouse selection, insertion without sending, and Esc followed by native sending.
- Empty results, native slash/mention priority, and menu alignment after resizing.
- Body-only creation, editing, preview, duplicates, legacy records, and stale insertion rejection.
- Conflicting writes, concurrent additions across projects, unsaved-edit recovery, and a real filesystem write failure.
- Matching prompt/menu background colors in dark and light themes, selected-row contrast, and theme changes with the menu open.
- Plugin disposal and removal of commands and menu renderables.

Frames, rendered cell colors, state snapshots, and the completion marker are written under `tmp/occo-integration`. These are local diagnostic artifacts, not release files.

To exercise the packaged plugin after the integration suite, extract the current archive into `tmp/occo-packed` and run `script/integration.cjs` with `OCCO_DIRECT=1`. This check uses the library seeded by the integration suite and adds collapsed-paste saving, long-body preview, deletion, selection replacement, and Chinese multiline input at 40×20.

## Manual checks and platform limits

Physical IME composition in Windows Terminal remains a manual check: compose Chinese text, cancel or commit it, and verify that candidate selection does not accept an occo suggestion or send the draft. Unicode insertion and bracketed-paste tests do not exercise a physical IME.

Check mouse selection and text contrast with the terminal/font settings used for a release. Linux and macOS behavior has not been validated.
