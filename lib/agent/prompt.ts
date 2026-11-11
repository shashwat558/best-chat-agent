// TODO: build the system prompt (persona + profile + recalled memories).

export type PromptContext = {
  memories?: string[];
};

export function buildSystemPrompt(context: PromptContext): string {
  void context;
  return "You are a helpful assistant with long-term memory.";
}
