# Usage details

[Back to README](../README.md) · [简体中文](usage.zh-CN.md)

## Suggestions

- Automatic lookup waits 300ms after three English letters or two Chinese characters. It uses contiguous matching and does not open after whitespace. The candidate area uses up to eight display rows, fewer on small screens; each match occupies one to three rows; ↑/↓ reaches all results. Closing the menu or inserting a suggestion pauses automatic suggestions for three seconds. F12 bypasses the pause, works with short or empty queries, and adds fuzzy matching.
- Choose **Disable automatic suggestions** in the command palette for manual-only use. F12 and the library remain available.
- Clicking any row of a suggestion selects it without inserting. Moving between candidates keeps the viewport height stable; the footer counts entries, not display rows. Esc restores normal sending, cursor movement, and prompt history. An empty manual menu still blocks Enter from sending.
- ⭐ marks saved prompts, which insert their full original text; their preview starts at the beginning of that original text, including Markdown and indentation. 💬 previews exactly the continuation to insert. Ctrl+S saves the full original fragment, not just its matched suffix.
- Conversation prose and table cells complete from the matched character to the end of the current sentence fragment. For example, matching `delete` in `Do not delete the cache.` inserts `delete the cache.` Code and literal HTML complete from the match to the end of the source fragment, without restoring earlier indentation or syntax. Previews wrap to the available width. Up to three display lines are shown in full. Longer previews show the first two lines, then `... ` and the end of the last display line, followed by `(N lines)`. N counts the complete wrapped preview before adding these labels; resizing can change N but never changes the inserted text.
- Completion replaces the matched current word or typed line prefix; an empty query inserts at the cursor. Text outside that range stays intact, including other text to the right of the cursor. A cursor inside a word also replaces the word's remaining suffix.
- Conversation matches are highlighted. Saved originals highlight direct normalized matches only; matches that require stripping Markdown, decoding entities or fuzzy search do not force a highlight into the original text. A longer contiguous phrase ranks above a last-word-only match. Identical resulting drafts appear once, with the saved source preferred. Background data updates preserve your selection; changing the query or edit range selects the first result.
- Alternating backgrounds distinguish adjacent suggestions. Symmetric side markers enclose the entire visible list: `-` on both sides for one display row; otherwise `┌` / `┐` on the first row, `│` on both sides in between, and `└` / `┘` on the last row. Empty states, viewport filler and the footer have no side markers. The menu uses the theme's dialog background, aligns with the input's left border and updates its colors when the theme changes.
- The single footer row groups Insert, Save and Close on the left. The right shows `↑↓ current/total` for multiple matches, or history loading/failure status instead. A single match needs no counter. Narrow menus first hide the Save hint, then shorten other hints; hidden shortcuts remain active. Labels are omitted as whole items, never split across rows. Switching sources does not add an explanation row.
- Each candidate shows its source time on the first row: message creation time for 💬, last save/edit time for ⭐. Times use the local timezone: `14:32` today, `11-14 14:32` on another day in the same year, or `2025-11-14 14:32` in another year. Short table fragments have no extra context label.
- History appears page by page. The manual menu distinguishes loading, no matches, and failure. After a failure, loaded content and saved prompts remain usable; close and reopen F12 to retry the unfinished loading.
- Native references, slash commands, Shell mode, dialogs, and existing selections take priority over suggestions. occo protects attachment marks when inserting. Native undo and redo each take one step for cursor insertion and two for replacement in OpenTUI 0.8.4.

## Prompt library

Use **Save selection** to save selected prompt text, or **Ctrl+S** in the suggestion menu to save a result. Saving expands collapsed pasted text but excludes files and images.

In the library, **Enter** previews the full text, **Ctrl+A** creates a prompt, and **Ctrl+D** asks before deleting it. **Ctrl+E** edits and **Ctrl+R** inserts from either the library or preview. In the save form, **Ctrl+S** saves and **Esc** cancels.

Saving from the prompt or suggestions returns you directly to the input, with a short saved or duplicate notification. Creating or editing from the library opens the saved text for review. Canceling an edit returns to the view that opened it. Returning to the list restores the selected prompt; its search field resets. After deletion, selection moves to a neighboring prompt.

Library insertion uses the position captured before opening the library, replacing a text selection if present. If the draft or session changes, close the library and reopen it at the intended position.

Library search also supports fuzzy matching. Lists show a readable one-line summary; previews, edits and insertion use the original text. Exact duplicates reuse the existing entry. Legacy records remain usable, but their titles are neither shown nor searched. Without an input target, the library remains available for management but does not offer insertion.

Unsaved changes require confirmation before discarding. Conflicts and failed writes retain your edits in the form. If another terminal changes the same prompt, **Save as new** preserves your version as a separate entry.

## Storage and sharing

OpenCode stores saved prompts and the automatic-suggestions setting locally. They are shared across projects, sessions, and server connections within the same local configuration environment and release channel.

Conversation snippets stay in memory and come from all completed user and assistant messages in the current session. Sending a draft uses your usual OpenCode provider configuration. Do not save credentials or other secrets in the library.

## Build an installable archive

Run `bun run pack` from `packages/occo`. The archive appears in `artifacts/` at the repository root. See [CONTRIBUTING.md](../CONTRIBUTING.md) for release checks.
