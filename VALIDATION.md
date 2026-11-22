# Validation

Verified baseline: OpenCode 2.3.0, OpenTUI 0.8.4, Solid 1.9.17, Bun 1.4.3, Windows x64. Run tests from `packages/occo`.

## Unit and native-editor tests

```sh
bun test
bun typecheck
```

The tests exercise the search implementation and real OpenTUI text editors:

- Completed-message filtering; headings, nested lists, quotes, table cells, inline formatting, entities, hard breaks, literal HTML, code indentation, and sentence boundaries.
- English and Chinese queries; full-phrase ranking, final-draft deduplication, preserved right-hand text, complete saved-body insertion, and NFKC/grapheme-safe offsets.
- Insertion-text previews, direct original-text highlights, grapheme-safe wrapping, first-two/last-row folding, display-only line counts, absolute local timestamps and height-based viewports. Preview-height budgeting covers eight single-row entries, exact fits, low heights and complete selection visibility.
- Footer action/state separation, single-result counter omission, failure recovery hints, and every width from 0 to 100 columns with empty, single, multiple and large result counts. Labels stay whole and actions retain their order.
- Alternate-background HSL lightness changes of ±8 percentage points, hue and saturation preservation across mid-lightness, grayscale, black/white clamping, unchanged alpha and input colors. Native rendered stripes follow the host theme mode; both side markers always use the dialog base background.
- Stale drafts, cursor and session changes, protected attachment marks, and expanded pasted text.
- Native undo/redo: one step for insertion, two for replacement. OpenTUI 0.8.4 records replacement as deletion followed by insertion.

Search benchmarks use 1,000 fragments (200,000 UTF-8 bytes) and 10,000 fragments (2,000,000 bytes). After 30 warm-up queries, each measures 100 queries and checks p95 against budgets of 20ms and 100ms respectively. Extraction, index preparation, and query p95 are printed separately with the runtime; timings depend on the machine.

Measured on the baseline above on 2026-11-15:

| Fragments | Extraction | Index preparation | Query p95 | Query budget |
| --- | --- | --- | --- | --- |
| 1,000 | 12.74 ms | 38.58 ms | 0.61 ms | 20 ms |
| 10,000 | 111.77 ms | 347.19 ms | 10.62 ms | 100 ms |

## Official-host integration

```sh
bun run test:host
```

Use official OpenCode 2.3.0 on PATH, or set `OPENCODE_BIN` to the executable. The harness launches two terminals in isolated projects and configuration directories. Its fixture provider points at a closed localhost port.

Coverage includes:

- Automatic suggestions, arrow selection, mouse selection, insertion without sending, and Esc followed by native sending.
- Empty results, native slash/mention priority, and menu alignment after resizing. Candidate markers, two-column emoji and preview text are contiguous; timestamps retain one separating column and their right alignment.
- Browsing beyond eight results, position/total display, selection retention after library updates, and preserving text to the right of phrase completions.
- Opening prose, table and code suggestions in a 242-message session, beyond the host's initial page; session isolation and cancellation on navigation.
- A test-only fault boundary around the real message client verifies partial-page availability, retry from the failed cursor, unchanged extraction identity, and cancelled-response isolation. A committed revert in a synthetic session verifies that removed messages leave the index.
- Body-only creation, editing, preview, duplicates, legacy records, and stale insertion rejection.
- Conflicting writes, concurrent additions across projects, unsaved-edit recovery, and a real filesystem write failure.
- Dialog-derived stripes and footer semantic surfaces, complete selected-row backgrounds, adjacent previews, symmetric markers enclosing the visible list across scrolling and resizing, unmarked empty states, filler and footer, left alignment, one-row footer geometry and theme changes with the menu open.
- Plugin disposal and removal of commands and menu renderables.

Frames, rendered cell colors, state snapshots, and the completion marker are written under `tmp/occo-integration`. These are local diagnostic artifacts, not release files.

Run `node script/integration.cjs --ui` after building the integration observer for focused UI checks. It uses `tmp/occo-ui-integration` and covers direct-save return, duplicate-submit prevention, readable summaries versus original previews, edit cancellation, list selection restoration, neighboring selection after deletion, and dialogs at 100×30, 60×20 and 40×16. It also checks conflict recovery, management without an insertion target, and a real-client fault boundary for loading, failure, stable menu height and retry.

Run `node script/integration.cjs --multiline` for mixed-height suggestions, timestamps, first-two/last-row folding, clicks on both side markers and on continuation text, full insertion and width/height changes. It checks default dark/light, Dracula and a real custom theme with identical ordinary surfaces, without rebuilding the menu's search state. Its isolated evidence is written under `tmp/occo-multiline-integration`.

`bun run screenshots` captures four documented scenes at Windows Terminal's default startup size, without resizing, maximizing or copying another window's geometry. It records the actual rows, columns, pixel dimensions, font, DPI and character dimensions; the layout stays fixed throughout the run. Concise examples keep three candidates visible: conversation tables retain all three source suggestions; saved prompts show one-, two- and folded three-row previews above an unchanged draft. Source isolation and insertion without sending are checked for both languages. The same run also captures mixed-height suggestions in four theme configurations, plus library, preview, edit and validation-error screens. Additional UI captures stay in the diagnostic directory printed by the harness.

Framed images preserve every source pixel, use the expected canvas dimensions, and have a fading two-layer shadow with fully transparent outer edges. Check the frame at full size and 900px width on light and dark backgrounds.

To exercise the packaged plugin after the integration suite, extract the current archive into `tmp/occo-packed` and run `script/integration.cjs` with `OCCO_DIRECT=1`. This check uses the library seeded by the integration suite and adds collapsed-paste saving, long-body preview, deletion, selection replacement, and Chinese multiline input at 40×20.

## Manual checks and platform limits

Physical IME composition in Windows Terminal remains a manual check: compose Chinese text, cancel or commit it, and verify that candidate selection does not accept an occo suggestion or send the draft. Unicode insertion and bracketed-paste tests do not exercise a physical IME.

Check mouse selection and text contrast with the terminal/font settings used for a release. Linux and macOS behavior has not been validated.
