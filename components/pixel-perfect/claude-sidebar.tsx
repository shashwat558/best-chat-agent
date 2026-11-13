"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { MessageSquare, Plus, Search } from "lucide-react";
import { z } from "zod";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { conversationListResponseSchema } from "@/lib/schemas";
import { MemoryPanel } from "@/components/memory-panel";

type ConversationSummary = z.infer<
  typeof conversationListResponseSchema
>["conversations"][number];

type ClaudeSidebarProps = Readonly<{
  activeId: string;
  onSelectConversation: (conversationId: string) => void;
  onNewChat: () => void;
  /** bumped by the chat session whenever the list may have changed */
  refreshKey: number;
}>;

const GROUP_ORDER = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
] as const;

function groupFor(iso: string): (typeof GROUP_ORDER)[number] {
  const updated = DateTime.fromISO(iso);
  const now = DateTime.now();
  const days = now.startOf("day").diff(updated.startOf("day"), "days").days;
  if (days <= 0) return "Today";
  if (days <= 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return "Older";
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export default function ClaudeSidebar({
  activeId,
  onSelectConversation,
  onNewChat,
  refreshKey,
}: ClaudeSidebarProps) {
  const { setOpenMobile } = useSidebar();
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const debouncedQuery = useDebouncedValue(query, 250);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = debouncedQuery
      ? `/api/conversations?q=${encodeURIComponent(debouncedQuery)}`
      : "/api/conversations";
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load conversations");
        }
        const payload: unknown = await response.json();
        const validated = conversationListResponseSchema.parse(payload);
        setConversations(validated.conversations);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        setStatus("unavailable");
      });
    return () => controller.abort();
  }, [debouncedQuery, refreshKey]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, ConversationSummary[]>();
    for (const conversation of conversations) {
      const group = groupFor(conversation.updatedAt);
      const list = byGroup.get(group) ?? [];
      list.push(conversation);
      byGroup.set(group, list);
    }
    return GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({
      label: group,
      items: byGroup.get(group)!,
    }));
  }, [conversations]);

  const selectConversation = (conversationId: string) => {
    if (conversationId !== activeId) {
      onSelectConversation(conversationId);
    }
    setOpenMobile(false);
  };

  const startNewChat = () => {
    onNewChat();
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 pb-3 pt-4">
        <div className="flex h-9 items-center gap-2 overflow-hidden px-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">

          <p className="truncate text-md font-semibold tracking-[-0.01em] group-data-[collapsible=icon]:hidden">
            Hearth
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="New chat"
                  onClick={startNewChat}
                  className="h-9 rounded-lg border border-sidebar-border bg-card text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                >
                  <Plus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <label
              htmlFor="conversation-search"
              className="sr-only"
            >
              Search conversations
            </label>
            <div className="group relative flex h-9 items-center gap-2 rounded-lg border border-transparent bg-transparent px-2.5 transition-colors hover:bg-sidebar-accent/60 focus-within:border-sidebar-border focus-within:bg-card">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                id="conversation-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search chats"
                autoComplete="off"
                className="h-full w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    inputRef.current?.focus();
                  }}
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        {status === "ready" && conversations.length === 0 && (
          <p className="px-3 pt-6 text-[13px] leading-6 text-muted-foreground">
            {debouncedQuery
              ? `No chats match “${debouncedQuery}”.`
              : "No conversations yet."}
          </p>
        )}
        {status === "unavailable" && (
          <p className="px-3 pt-6 text-[13px] leading-6 text-muted-foreground">
            Could not load conversations.
          </p>
        )}

        {groups.map((group) => (
          <SidebarGroup className="mt-3 p-0" key={group.label}>
            <SidebarGroupLabel className="px-2 text-[11px] font-medium text-muted-foreground">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((conversation) => (
                  <SidebarMenuItem key={conversation.id}>
                    <SidebarMenuButton
                      isActive={conversation.id === activeId}
                      tooltip={conversation.title || "Untitled chat"}
                      onClick={() => selectConversation(conversation.id)}
                      className="h-auto min-h-8 items-center rounded-lg py-1.5"
                    >
                      <MessageSquare className="size-3.5 shrink-0 opacity-60" />
                      <span className="truncate text-[13px] leading-5">
                        {conversation.title || "Untitled chat"}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="border-t border-sidebar-border/70 pt-2.5 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:pt-0">
          <MemoryPanel />
          <p className="min-w-0 truncate text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            Private memory · scoped to this browser
          </p>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
