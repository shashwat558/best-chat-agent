"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  safeValidateUIMessages,
  type UIMessage,
} from "ai";
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
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  WebSearch,
  WebSearchCitation,
  type WebSource,
} from "@/components/ui/web-search";
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

function renderTextWithCitations(
  text: string,
  sources: ReadonlyMap<string, WebSource>,
): ReactNode[] {
  const output: ReactNode[] = [];
  let previousIndex = 0;
  for (const match of text.matchAll(/\[(s\d+)\]/gi)) {
    const index = match.index;
    output.push(text.slice(previousIndex, index));
    const source = sources.get(match[1].toLowerCase());
    output.push(
      source ? (
        <WebSearchCitation
          key={`${index}-${match[1]}`}
          source={source}
          index={Number(match[1].slice(1))}
          className="mx-0.5"
        />
      ) : (
        match[0]
      ),
    );
    previousIndex = index + match[0].length;
  }
  output.push(text.slice(previousIndex));
  return output;
}

function renderMessagePart(
  part: UIMessage["parts"][number],
  key: string,
  sources: ReadonlyMap<string, WebSource>,
): ReactNode {
  if (part.type === "text") {
    return (
      <p key={key} className="whitespace-pre-wrap text-[15px] leading-7">
        {renderTextWithCitations(part.text, sources)}
      </p>
    );
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
  const firstUserMessage = messages.find((message) => message.role === "user");
  const currentTitle = firstUserMessage
    ? messageText(firstUserMessage).slice(0, 48)
    : "";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: status === "streaming" ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, status]);

  return (
    <SidebarProvider
      defaultOpen
      className="h-dvh min-h-0 overflow-hidden bg-sidebar"
      style={{ "--sidebar-width": "17rem" } as React.CSSProperties}
    >
      <ClaudeSidebar
        currentTitle={currentTitle || undefined}
        onNewChat={onNewChat}
      />
      <SidebarInset className="h-dvh min-w-0 overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-[22px] md:border md:border-border/70 md:shadow-[0_12px_40px_-30px_rgba(46,37,27,0.45)]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/60 px-3 sm:px-5">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="rounded-xl text-muted-foreground" />
            <div className="flex items-center gap-2 md:hidden">
              <span className="grid size-6 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Sparkles className="size-3" />
              </span>
              <span className="text-sm font-semibold">Hearth</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
            <LockKeyhole className="size-3" />
            <span>Private</span>
          </div>
        </header>

        <section
          aria-live="polite"
          className="min-h-0 flex-1 overflow-y-auto scroll-smooth"
        >
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-8 sm:py-10">
            {historyStatus === "loading" && (
              <div className="my-auto flex justify-center">
                <AiStatus state="thinking" label="Opening your space" />
              </div>
            )}
            {historyStatus === "unavailable" && (
              <div className="my-auto rounded-2xl border border-destructive/20 bg-destructive/5 p-5 text-center">
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
              <div className="my-auto flex flex-col items-center py-12 text-center">
                <div className="mb-5 grid size-12 place-items-center rounded-[18px] bg-[linear-gradient(145deg,#f2c995,#d99a62)] text-[#5b321c] shadow-[0_12px_30px_-16px_rgba(147,90,43,0.75)]">
                  <Sparkles className="size-5" />
                </div>
                <h1 className="text-2xl font-semibold tracking-[-0.03em] sm:text-[28px]">
                  What are we exploring?
                </h1>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
                  Ask a question, unpack an idea, or pick up where you left off.
                </p>
                <div className="mt-7 flex max-w-lg flex-wrap justify-center gap-2">
                  {[
                    "Help me think through a decision",
                    "Explain something complex simply",
                    "Plan a calm, productive week",
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setInput(suggestion)}
                      className="rounded-full border border-border/70 bg-card/70 px-3.5 py-2 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-card hover:text-foreground"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => {
              const sources = sourcesForMessage(message);
              return (
                <article
                  key={message.id}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[88%] rounded-[20px] rounded-br-md bg-secondary px-4 py-3 text-secondary-foreground sm:max-w-[78%]"
                      : "w-full"
                  }
                >
                  <div className="flex flex-col gap-3">
                    {message.parts.map((part, index) =>
                      renderMessagePart(
                        part,
                        `${message.id}-${index}`,
                        sources,
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
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3">
                <AiStatus state="error" label="The response failed" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </section>

        <div className="shrink-0 bg-gradient-to-t from-background via-background to-background/0 px-3 pb-3 pt-2 sm:px-6 sm:pb-5">
          <form
            className="mx-auto w-full max-w-3xl rounded-[22px] border border-border/80 bg-card p-2 shadow-[0_16px_40px_-24px_rgba(69,52,34,0.55),0_2px_8px_rgba(69,52,34,0.06)] focus-within:border-ring/60"
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
              <span className="hidden text-[10px] text-muted-foreground/70 sm:block">
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
                  className="rounded-full"
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
          <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground/65">
            Hearth can make mistakes. Check important information.
          </p>
        </div>
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
