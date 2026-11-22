# Usage details

[Back to README](../README.md) · [简体中文](usage.zh-CN.md)

## Suggestions

- Automatic lookup waits 300ms and shows up to eight matches, fewer on small screens. Closing the menu or inserting a suggestion pauses automatic suggestions for three seconds. F12 bypasses the pause and works with an empty draft.
- Choose **Disable automatic suggestions** in the command palette for manual-only use. F12 and the library remain available.
- Clicking a suggestion selects it without inserting. Esc restores normal sending, cursor movement, and prompt history. An empty manual menu still blocks Enter from sending.
- ★ marks saved prompts, which insert their full text. · marks conversation snippets, which may insert from the match onward. Saving a snippet keeps its full original fragment. The footer shows the edit range: current word, current line, or cursor.
- Native references, slash commands, Shell mode, dialogs, and existing selections take priority over suggestions. occo protects attachment marks when inserting. Native undo and redo each take one step for cursor insertion and two for replacement in OpenTUI 0.8.4.

## Prompt library

Use **Save selection** to save selected prompt text, or **Ctrl+S** in the suggestion menu to save a result. Saving expands collapsed pasted text but excludes files and images.

In the library, **Enter** previews the full text, **Ctrl+A** creates a prompt, and **Ctrl+D** asks before deleting it. **Ctrl+E** edits and **Ctrl+R** inserts from either the library or preview. In the save form, **Ctrl+S** saves and **Esc** cancels.

Library insertion uses the position captured before opening the library, replacing a text selection if present. If the draft or session changes, close the library and reopen it at the intended position.

Lists show a one-line summary; saved text keeps its formatting. Exact duplicate text opens the existing entry. Legacy records remain usable, but their titles are neither shown nor searched.

Unsaved changes require confirmation before discarding. Conflicts and failed writes retain your edits in the form. If another terminal changes the same prompt, **Save as new** preserves your version as a separate entry.

## Storage and sharing

OpenCode stores saved prompts and the automatic-suggestions setting locally. They are shared across projects, sessions, and server connections within the same local configuration environment and release channel.

Conversation snippets stay in memory and come only from the current session's last ten completed user or assistant messages. Sending a draft uses your usual OpenCode provider configuration. Do not save credentials or other secrets in the library.

## Build an installable archive

Run `bun run pack` from `packages/occo`. The archive appears in `artifacts/` at the repository root. See [CONTRIBUTING.md](../CONTRIBUTING.md) for release checks.
