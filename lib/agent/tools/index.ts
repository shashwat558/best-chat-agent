import type { SearchProvider } from "../search-provider";
import type { TurnState } from "../turn-state";
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
  };
}
