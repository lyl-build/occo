import type { Storage } from "@opencode/plugin/tui/context"

export type SavedPrompt = { id: string; text: string; updatedAt: number }
export type State = { automaticSuggestions: boolean; prompts: SavedPrompt[] }
export type Library = ReturnType<typeof createLibrary>

export function createLibrary(storage: Storage) {
  const [state, update] = storage.store<State>("state", { initial: { automaticSuggestions: true, prompts: [] } })
  return {
    state,
    toggle: () =>
      update((draft) => {
        draft.automaticSuggestions = !draft.automaticSuggestions
      }),
    async save(input: { text: string }, expected?: SavedPrompt) {
      if (!input.text.trim()) return { status: "empty" as const }
      let result: { status: "saved" | "duplicate" | "conflict"; prompt?: SavedPrompt } = { status: "conflict" }
      await update((draft) => {
        const current = expected && draft.prompts.find((prompt) => prompt.id === expected.id)
        if (expected && (!current || current.updatedAt !== expected.updatedAt || current.text !== expected.text)) return
        const duplicate = draft.prompts.find((prompt) => prompt.text === input.text && prompt.id !== expected?.id)
        if (duplicate) {
          result = { status: "duplicate", prompt: { ...duplicate } }
          return
        }
        const prompt = {
          id: expected?.id ?? crypto.randomUUID(),
          text: input.text,
          updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
        }
        if (current) draft.prompts[draft.prompts.findIndex((item) => item.id === current.id)] = prompt
        if (!current) draft.prompts.push(prompt)
        result = { status: "saved", prompt }
      })
      return result
    },
    async remove(expected: SavedPrompt) {
      let removed = false
      await update((draft) => {
        const index = draft.prompts.findIndex(
          (prompt) =>
            prompt.id === expected.id && prompt.updatedAt === expected.updatedAt && prompt.text === expected.text,
        )
        if (index < 0) return
        draft.prompts.splice(index, 1)
        removed = true
      })
      return removed
    },
  }
}
