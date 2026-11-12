"use client";

import { Brain, MessageSquareText, Plus, Search, Sparkles } from "lucide-react";
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

type ClaudeSidebarProps = Readonly<{
  currentTitle?: string;
  onNewChat: () => void;
}>;

export default function ClaudeSidebar({
  currentTitle,
  onNewChat,
}: ClaudeSidebarProps) {
  const { setOpenMobile } = useSidebar();

  const startNewChat = () => {
    onNewChat();
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pb-2 pt-4">
        <div className="flex h-9 items-center gap-2 overflow-hidden px-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <span className="grid size-7 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">
              Hearth
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              research companion
            </p>
          </div>
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
                  className="h-9 rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground"
                >
                  <Plus />
                  <span>New chat</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Search conversations"
                  disabled
                  className="h-9 rounded-xl opacity-60"
                >
                  <Search />
                  <span>Search</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-5 p-0">
          <SidebarGroupLabel className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em]">
            This space
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive
                  tooltip={currentTitle ?? "Current conversation"}
                  className="h-auto min-h-9 items-start rounded-xl py-2"
                >
                  <MessageSquareText className="mt-0.5" />
                  <span className="line-clamp-2 leading-5">
                    {currentTitle ?? "Current conversation"}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center gap-2 rounded-2xl border border-sidebar-border/70 bg-background/55 p-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-1">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <Brain className="size-3.5" />
          </span>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium">Private memory</p>
            <p className="truncate text-[10px] text-muted-foreground">
              scoped to this browser
            </p>
          </div>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
