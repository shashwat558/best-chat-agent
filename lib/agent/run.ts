import { stepCountIs, streamText } from "ai";
import { models } from "../models";
import { formatCurrentTime } from "../time";
import { buildSystemPrompt } from "./prompt";
import type { createTools } from "./tools";

export type AgentMessage = Readonly<{
  role: "user" | "assistant";
  content: string;
}>;

export type AgentTools = ReturnType<typeof createTools>;

export function runAgent(
  messages: AgentMessage[],
  options: Readonly<{
    timezone: string;
    tools: AgentTools;
    now?: Date;
    abortSignal?: AbortSignal;
  }>,
) {
  const now = options.now ?? new Date();
  return streamText({
    model: models.chat,
    instructions: buildSystemPrompt({
      now: formatCurrentTime(now, options.timezone),
      timezone: options.timezone,
    }),
    messages,
    tools: options.tools,
    stopWhen: stepCountIs(5),
    abortSignal: options.abortSignal,
  });
}
