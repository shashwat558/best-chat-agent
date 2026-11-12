import type { SearchProvider } from "../search-provider";
import type { TurnState } from "../turn-state";
import { createRecallTool } from "./recall";
import { createWebSearchTool } from "./web-search";

export type CreateToolsOptions = Readonly<{
  userId: string;
  timezone: string;
  searchProvider: SearchProvider;
  turnState: TurnState;
}>;

export function createTools(options: CreateToolsOptions) {
  void options.userId;
  void options.timezone;
  return {
    webSearch: createWebSearchTool(options.searchProvider, options.turnState),
    recall: createRecallTool({
      userId: options.userId,
      timezone: options.timezone,
      turnState: options.turnState,
    }),
  };
}
