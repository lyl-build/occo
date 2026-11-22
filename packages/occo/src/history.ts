import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js"
import { extract } from "./extract"
import type { Entry } from "./search"

type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]
export type HistoryStatus = "loading" | "ready" | "failed"

export function conversation(message: Message): Entry[] {
  return extract(messageText(message)).map((text, index) => ({
    text,
    id: `${message.id}:${index}`,
    saved: false,
    time: message.time.created,
  }))
}

function messageText(message: Message) {
  if (message.type === "user") return message.text
  if (message.type === "assistant" && message.time.completed !== undefined)
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n\n")
  return ""
}

export function conversationHistory(context: Context, session: () => string | undefined) {
  const [revision, setRevision] = createSignal(0)
  const [status, setStatus] = createSignal<HistoryStatus>("ready")
  const [view, setView] = createSignal<{ session?: string; entries: Entry[] }>({
    entries: [],
  })
  let retry = () => {}
  onCleanup(
    context.data.on("session.revert.committed", (event) => {
      if (event.data.sessionID === session()) setRevision((value) => value + 1)
    }),
  )
  createEffect(() => {
    const sessionID = session()
    revision()
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    setView({ session: sessionID, entries: [] })
    setStatus(sessionID ? "loading" : "ready")
    retry = () => {}
    if (!sessionID) return
    const messages = new Map<string, { text: string; entries: Entry[]; live: boolean }>()
    const [synced, setSynced] = createSignal(false)
    let cursor: string | undefined
    let done = false
    let running = false
    const merge = (incoming: readonly Message[], live: boolean) => {
      let changed = false
      incoming.forEach((message) => {
        const previous = messages.get(message.id)
        if (previous?.live && !live) return
        const text = messageText(message)
        if (previous?.text === text) {
          previous.live ||= live
          return
        }
        messages.set(message.id, {
          text,
          entries: conversation(message),
          live,
        })
        changed = true
      })
      if (changed)
        setView({
          session: sessionID,
          entries: [...messages.values()].flatMap((item) => item.entries),
        })
    }
    createEffect(() => {
      const live = context.data.session.message.list(sessionID)
      if (synced()) untrack(() => merge(live, true))
    })
    const load = async () => {
      if (running || controller.signal.aborted) return
      running = true
      setStatus("loading")
      const sync = synced()
        ? Promise.resolve()
        : context.data.session.message.sync(sessionID).then(() => {
            if (!controller.signal.aborted) setSynced(true)
          })
      const pages = async () => {
        while (!done) {
          const page = await context.client.message.list(
            {
              sessionID,
              limit: 200,
              ...(cursor ? { cursor } : { order: "desc" }),
            },
            { signal: controller.signal },
          )
          if (controller.signal.aborted) return
          merge(page.data, false)
          cursor = page.cursor.next ?? undefined
          done = !cursor
        }
      }
      const result = await Promise.allSettled([sync, pages()])
      running = false
      if (!controller.signal.aborted) setStatus(result.some((item) => item.status === "rejected") ? "failed" : "ready")
    }
    retry = () => {
      if (status() === "failed") void untrack(load)
    }
    void untrack(load)
  })
  return {
    entries: createMemo(() => (view().session === session() ? view().entries : [])),
    status,
    retry: () => retry(),
  }
}
