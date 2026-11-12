import { randomUUID } from "node:crypto";
import {
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { after } from "next/server";
import { ZodError } from "zod";
import { buildAgentContext } from "@/lib/agent/context";
import { runAgent } from "@/lib/agent/run";
import { createExaSearchProvider } from "@/lib/agent/search-provider";
import { createTools } from "@/lib/agent/tools";
import {
  citedSourceIds,
  createTurnState,
  sourceIds,
} from "@/lib/agent/turn-state";
import {
  authorizeOrCreateConversation,
  loadConversationMessages,
  ownsConversation,
  saveAssistantMessage,
  saveUserMessage,
  upsertUserTimezone,
} from "@/lib/chat-store";
import { config } from "@/lib/config";
import { getUserId } from "@/lib/identity";
import { hashUserId, logStructured } from "@/lib/logger";
import { runMemoryWriter } from "@/lib/memory/writer";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  chatHistoryQuerySchema,
  chatRequestSchema,
  storedMessagePartsSchema,
} from "@/lib/schemas";

export const maxDuration = 120;

const REQUEST_TIMEOUT_MS = 90_000;

function notFoundResponse(): Response {
  return Response.json({ error: "conversation_not_found" }, { status: 404 });
}

function invalidRequestResponse(error: ZodError): Response {
  return Response.json(
    { error: "invalid_request", issues: error.issues },
    { status: 400 },
  );
}

function textFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export async function GET(request: Request): Promise<Response> {
  const parsed = chatHistoryQuerySchema.safeParse({
    conversationId: new URL(request.url).searchParams.get("conversationId"),
  });

  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  const userId = await getUserId();
  const { conversationId } = parsed.data;
  if (!(await ownsConversation(conversationId, userId))) {
    return notFoundResponse();
  }

  const history = await loadConversationMessages(conversationId, userId);
  return Response.json({
    conversationId,
    messages: history.map((message) => ({
      id: message.id,
      role: message.role,
      parts: storedMessagePartsSchema.safeParse(message.parts).success
        ? message.parts
        : [{ type: "text" as const, text: message.content }],
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  const userId = await getUserId();
  const userHash = hashUserId(userId);
  const rateLimit = checkRateLimit(userId);
  if (!rateLimit.allowed) {
    logStructured("warn", "chat_rate_limited", { userHash });
    return Response.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-RateLimit-Limit": String(rateLimit.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  const { conversationId, message, timezone } = parsed.data;
  const authorized = await authorizeOrCreateConversation({
    conversationId,
    userId,
    firstMessage: message,
  });

  if (!authorized) {
    return notFoundResponse();
  }

  await saveUserMessage({ conversationId, userId, content: message });
  await upsertUserTimezone(userId, timezone);
  const context = await buildAgentContext({
    userId,
    conversationId,
    latestMessage: message,
    timezone,
  });
  const assistantMessageId = randomUUID();
  const turnState = createTurnState();
  const tools = createTools({
    userId,
    timezone,
    searchProvider: createExaSearchProvider(config.EXA_API_KEY),
    turnState,
  });
  const result = runAgent(
    context.history,
    {
      timezone,
      tools,
      now: context.now,
      renderedNow: context.renderedNow,
      profile: context.profile,
      facts: context.facts,
      abortSignal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ]),
    },
  );
  type WriterInput = Parameters<typeof runMemoryWriter>[0];
  let resolveWriterInput: (input: WriterInput | null) => void = () => {};
  let writerSettled = false;
  const writerInput = new Promise<WriterInput | null>((resolve) => {
    resolveWriterInput = resolve;
  });
  const settleWriter = (input: WriterInput | null) => {
    if (writerSettled) return;
    writerSettled = true;
    resolveWriterInput(input);
  };
  after(async () => {
    const input = await writerInput;
    if (input) await runMemoryWriter(input);
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools,
      generateMessageId: () => assistantMessageId,
      sendReasoning: false,
      onError: (error) => {
        logStructured("error", "chat_stream_error", {
          conversationId,
          userHash,
          error,
        });
        return "The assistant could not complete this response.";
      },
      onEnd: async ({ responseMessage, outcome }) => {
        if (outcome.status !== "completed") {
          settleWriter(null);
          return;
        }

        try {
          const content = textFromMessage(responseMessage);
          const serializedParts: unknown = JSON.parse(
            JSON.stringify(responseMessage.parts),
          );
          await saveAssistantMessage({
            id: assistantMessageId,
            conversationId,
            userId,
            content,
            parts: storedMessagePartsSchema.parse(serializedParts),
          });

          const [steps, usage] = await Promise.all([
            result.steps,
            result.usage,
          ]);
          const availableSources = sourceIds(turnState);
          const citations = citedSourceIds(content);
          const invalidCitations = [
            ...new Set(
              citations.filter((citation) => !availableSources.has(citation)),
            ),
          ];
          logStructured("info", "chat_turn", {
            conversationId,
            userHash,
            steps: steps.length,
            toolCalls: [
              ...turnState.searchCalls.map((call) => ({
                name: "webSearch",
                query: call.query,
                durationMs: call.durationMs,
                attempts: call.attempts,
                resultCount: call.results.length,
                ...(call.error ? { error: call.error } : {}),
              })),
              ...turnState.recallCalls.map((call) => ({
                name: "recall",
                query: call.query,
                durationMs: call.durationMs,
                resultCount: call.results.length,
                ...(call.error ? { error: call.error } : {}),
              })),
            ],
            searchLatencyMs: turnState.searchCalls.reduce(
              (total, call) => total + call.durationMs,
              0,
            ),
            usage: {
              input: usage.inputTokens,
              output: usage.outputTokens,
              total: usage.totalTokens,
            },
            citationCount: citations.length,
            invalidCitations,
            errors: [
              ...turnState.searchCalls
                .filter((call) => call.error)
                .map((call) => call.error),
              ...turnState.recallCalls
                .filter((call) => call.error)
                .map((call) => call.error),
            ],
          });
          settleWriter({
            userId,
            conversationId,
            assistantMessageId,
          });
        } catch (error) {
          settleWriter(null);
          logStructured("error", "assistant_message_persist_failed", {
            conversationId,
            userHash,
            error,
          });
        }
      },
    }),
  });
}
