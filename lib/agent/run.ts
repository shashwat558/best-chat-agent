// TODO: streamText + tools + step cap. No framework imports in lib/agent.

export type AgentMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export async function runAgent(messages: AgentMessage[]) {
  void messages;
  throw new Error("Not implemented");
}
