"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUp, LockKeyhole, Sparkles, Square } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { z } from "zod";
import ClaudeSidebar from "@/components/pixel-perfect/claude-sidebar";
import { AiStatus } from "@/components/ui/ai-status";
import { AquariumPrompt } from "@/components/ui/aquarium-prompt";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WebSearch, type WebSource } from "@/components/ui/web-search";
import { ChatMarkdown } from "@/components/ui/chat-markdown";
import { ThemeToggle } from "@/components/theme-toggle";
import { chatHistoryResponseSchema } from "@/lib/schemas";

const ACTIVE_CONVERSATION_KEY = "active-conversation-id";
const ACTIVE_CONVERSATION_EVENT = "active-conversation-change";

function subscribeToActiveConversation(callback: () => void): () => void {
  window.addEventListener(ACTIVE_CONVERSATION_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(ACTIVE_CONVERSATION_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function activeConversationSnapshot(): string {
  return window.localStorage.getItem(ACTIVE_CONVERSATION_KEY) ?? "";
}

function setActiveConversation(conversationId: string): void {
  window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
  window.dispatchEvent(new Event(ACTIVE_CONVERSATION_EVENT));
}

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

const webSearchPartSchema = z.object({
  type: z.string(),
  toolName: z.string().optional(),
  state: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
});

const webSearchInputSchema = z.object({ query: z.string() });

const webSearchOutputSchema = z.object({
  query: z.string(),
  results: z.array(
    z.object({
      id: z.string(),
      url: z.url(),
      title: z.string(),
      content: z.string(),
      publishedDate: z.string().optional(),
      retrievedAt: z.string(),
    }),
  ),
});

const webSearchErrorSchema = z.object({
  query: z.string(),
  error: z.literal("search_unavailable"),
});

function sourcesForMessage(message: UIMessage): Map<string, WebSource> {
  const sources = new Map<string, WebSource>();
  for (const part of message.parts) {
    const parsedPart = webSearchPartSchema.safeParse(part);
    if (!parsedPart.success) continue;
    const output = webSearchOutputSchema.safeParse(parsedPart.data.output);
    if (!output.success) continue;
    for (const result of output.data.results) {
      sources.set(result.id.toLowerCase(), {
        id: result.id,
        title: result.title,
        url: result.url,
        snippet: result.content,
        retrievedAt: result.retrievedAt,
      });
    }
  }
  return sources;
}

function renderMessagePart(
  part: UIMessage["parts"][number],
  key: string,
  sources: ReadonlyMap<string, WebSource>,
  role: UIMessage["role"],
): ReactNode {
  if (part.type === "text") {
    if (role === "user") {
      return (
        <p key={key} className="whitespace-pre-wrap text-[15px] leading-7">
          {part.text}
        </p>
      );
    }
    return <ChatMarkdown key={key} text={part.text} sources={sources} />;
  }

  const parsedPart = webSearchPartSchema.safeParse(part);
  if (!parsedPart.success) {
    return null;
  }

  const toolName =
    parsedPart.data.type === "dynamic-tool"
      ? parsedPart.data.toolName
      : parsedPart.data.type.startsWith("tool-")
        ? parsedPart.data.type.slice(5)
        : undefined;
  if (toolName === "recall") {
    const failed =
      parsedPart.data.state === "output-error" ||
      (typeof parsedPart.data.output === "object" &&
        parsedPart.data.output !== null &&
        "error" in parsedPart.data.output);
    if (failed) {
      return <AiStatus key={key} state="error" label="Memory unavailable" />;
    }
    return (
      <AiStatus
        key={key}
        state={
          parsedPart.data.state === "output-available" ? "done" : "thinking"
        }
        label={
          parsedPart.data.state === "output-available"
            ? "Memory recalled"
            : "Recalling memory"
        }
      />
    );
  }
  if (toolName !== "webSearch") {
    return null;
  }

  const input = webSearchInputSchema.safeParse(parsedPart.data.input);
  const output = webSearchOutputSchema.safeParse(parsedPart.data.output);
  const failedOutput = webSearchErrorSchema.safeParse(parsedPart.data.output);
  if (parsedPart.data.state === "output-available" && failedOutput.success) {
    return (
      <AiStatus
        key={key}
        state="error"
        label="Web search is unavailable"
      />
    );
  }
  if (parsedPart.data.state === "output-available" && output.success) {
    return (
      <WebSearch
        key={key}
        query={output.data.query}
        status="done"
        sources={output.data.results.map((result) => ({
          id: result.id,
          title: result.title,
          url: result.url,
          snippet: result.content,
          retrievedAt: result.retrievedAt,
        }))}
      />
    );
  }

  if (parsedPart.data.state === "output-error") {
    return <AiStatus key={key} state="error" label="Web search failed" />;
  }

  return (
    <WebSearch
      key={key}
      query={input.success ? input.data.query : undefined}
      status="searching"
      sources={[]}
    />
  );
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function chatErrorLabel(error: Error): string {
  if (error.message.includes("rate_limited") || error.message.includes("429")) {
    return "Too many messages. Try again in about a minute.";
  }
  if (/failed to fetch|network|load failed/i.test(error.message)) {
    return "Network unavailable. Check your connection and try again.";
  }
  return "The response failed. Please try again.";
}

function ChatSession({
  conversationId,
  onNewChat,
}: {
  conversationId: string;
  onNewChat: () => void;
}) {
  const [input, setInput] = useState("");
  const [historyStatus, setHistoryStatus] = useState<
    "loading" | "ready" | "unavailable"
  >("loading");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const latest = messages.at(-1);
          if (!latest || latest.role !== "user") {
            throw new Error("A user message is required");
          }

          return {
            body: {
              conversationId,
              message: messageText(latest),
              timezone: browserTimezone(),
            },
          };
        },
      }),
    [conversationId],
  );
  const { messages, sendMessage, setMessages, status, error, stop } = useChat({
    id: conversationId,
    transport,
  });

  useEffect(() => {
    const controller = new AbortController();

    void fetch(
      `/api/chat?conversationId=${encodeURIComponent(conversationId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (response.status === 404) {
          setHistoryStatus("ready");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load conversation");
        }

        const payload: unknown = await response.json();
        const history = chatHistoryResponseSchema.parse(payload);
        const validated = await safeValidateUIMessages({
          messages: history.messages,
        });
        if (!validated.success) {
          throw validated.error;
        }
        setMessages(validated.data);
        setHistoryStatus("ready");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setHistoryStatus("unavailable");
      });

    return () => controller.abort();
  }, [conversationId, setMessages]);

  const busy = status === "submitted" || status === "streaming";
  const started = historyStatus === "ready" && messages.length > 0;
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const [listTick, setListTick] = useState(0);
  const wasBusy = useRef(false);

  useEffect(() => {
    if (started) {
      composerInputRef.current?.focus({ preventScroll: true });
    }
  }, [started]);

  // refetch the sidebar list once a turn settles (new/renamed conversation)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      setListTick((tick) => tick + 1);
    }
    wasBusy.current = busy;
  }, [busy]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: status === "streaming" ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, status]);

  return (
    <SidebarProvider
      defaultOpen
      className="h-dvh min-h-0 overflow-hidden bg-background"
      style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}
    >
      <ClaudeSidebar
        activeId={conversationId}
        onSelectConversation={setActiveConversation}
        onNewChat={onNewChat}
        refreshKey={listTick}
      />
      <SidebarInset className="h-dvh min-w-0 overflow-hidden bg-background">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="rounded-md text-muted-foreground" />
            <div className="flex items-center gap-2 md:hidden">
              <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
                <Sparkles className="size-3" />
              </span>
              <span className="text-sm font-semibold">Hearth</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="mr-1 hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <LockKeyhole className="size-3" />
              <span>Private</span>
            </div>
            <ThemeToggle />
          </div>
        </header>

        <section
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="relative mx-auto flex min-h-full w-full max-w-[50rem] flex-col gap-8 px-4 py-8 sm:px-8 sm:py-10">
            {historyStatus === "loading" && (
              <div className="my-auto flex justify-center">
                <AiStatus state="thinking" label="Opening your space" />
              </div>
            )}
            {historyStatus === "unavailable" && (
              <div className="my-auto rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-center">
                <p className="text-sm font-medium">
                  This conversation could not be opened.
                </p>
                <button
                  type="button"
                  onClick={onNewChat}
                  className="mt-2 text-sm text-muted-foreground underline underline-offset-4"
                >
                  Start a fresh chat
                </button>
              </div>
            )}
            {historyStatus === "ready" && messages.length === 0 && (
              <AnimatePresence>
                <motion.div
                  key="aquarium"
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.35, ease: "easeIn" } }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="absolute inset-0 flex items-center justify-center px-3"
                >
                  <AquariumPrompt
                    title="What are we exploring?"
                    placeholder="Message Hearth…"
                    className="!h-[390px] !max-w-[780px] !rounded-[22px] !shadow-[0_1px_2px_rgba(15,23,42,.08),0_12px_32px_-24px_rgba(15,23,42,.3)] sm:!h-[420px]"
                    onSubmit={(text) => {
                      void sendMessage({ text });
                    }}
                  />
                </motion.div>
              </AnimatePresence>
            )}
            {messages.map((message) => {
              const sources = sourcesForMessage(message);
              return (
                <article
                  key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-secondary-foreground sm:max-w-[78%]"
                        : "w-full"
                    }
                >
                  <div className="flex flex-col gap-3">
                    {message.parts.map((part, index) =>
                      renderMessagePart(
                        part,
                        `${message.id}-${index}`,
                        sources,
                        message.role,
                      ),
                    )}
                  </div>
                </article>
              );
            })}
            {busy && (
              <AiStatus
                state={status === "submitted" ? "thinking" : "writing"}
              />
            )}
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AiStatus state="error" label={chatErrorLabel(error)} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        <AnimatePresence initial={false}>
          {started && (
            <motion.div
              key="composer"
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="shrink-0 bg-background px-3 pb-3 pt-2 sm:px-6 sm:pb-5"
            >
          <form
            className="mx-auto w-full max-w-[50rem] rounded-2xl border border-border bg-card p-2 shadow-[0_8px_30px_-22px_rgba(15,23,42,.35)] transition-colors focus-within:border-ring/70"
            onSubmit={(event) => {
              event.preventDefault();
              const message = input.trim();
              if (!message || busy || historyStatus !== "ready") {
                return;
              }
              setInput("");
              void sendMessage({ text: message });
            }}
          >
            <label htmlFor="chat-input" className="sr-only">
              Message
            </label>
            <textarea
              id="chat-input"
              ref={composerInputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              disabled={historyStatus !== "ready"}
              rows={2}
              placeholder="Message Hearth…"
              className="max-h-40 min-h-14 w-full resize-none bg-transparent px-2.5 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground/70 disabled:opacity-50"
            />
            <div className="flex items-center justify-between px-1">
              <span className="hidden text-xs text-muted-foreground/80 sm:block">
                Shift + Enter for a new line
              </span>
              <span className="sm:hidden" />
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  aria-label="Stop response"
                  onClick={() => void stop()}
                  className="rounded-full bg-muted text-foreground hover:bg-accent"
                >
                  <Square className="size-3 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={!input.trim() || historyStatus !== "ready"}
                  className="rounded-full"
                >
                  <ArrowUp />
                </Button>
              )}
            </div>
          </form>
          <p className="mx-auto mt-2 max-w-[50rem] text-center text-[11px] text-muted-foreground/80">
            Hearth can make mistakes. Check important information.
          </p>
            </motion.div>
          )}
        </AnimatePresence>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function Chat() {
  const conversationId = useSyncExternalStore(
    subscribeToActiveConversation,
    activeConversationSnapshot,
    () => "",
  );

  useEffect(() => {
    if (!window.localStorage.getItem(ACTIVE_CONVERSATION_KEY)) {
      setActiveConversation(crypto.randomUUID());
    }
  }, [conversationId]);

  if (!conversationId) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Opening chat…</p>
      </main>
    );
  }

  return (
    <ChatSession
      key={conversationId}
      conversationId={conversationId}
      onNewChat={() => {
        setActiveConversation(crypto.randomUUID());
      }}
    />
  );
}
