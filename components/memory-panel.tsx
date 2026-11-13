"use client";

import { Brain, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { memoryListResponseSchema } from "@/lib/schemas";

type MemoryFact = z.infer<typeof memoryListResponseSchema>["facts"][number];
type MemoryClaim = z.infer<typeof memoryListResponseSchema>["claims"][number];

export function MemoryPanel() {
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [claims, setClaims] = useState<MemoryClaim[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [deletingId, setDeletingId] = useState<string>();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/memories", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load memories");
        const payload: unknown = await response.json();
        const memory = memoryListResponseSchema.parse(payload);
        setFacts(memory.facts);
        setClaims(memory.claims);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [open]);

  async function deleteFact(factId: string) {
    setDeletingId(factId);
    try {
      const response = await fetch("/api/memories", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factId }),
      });
      if (!response.ok) throw new Error("Unable to delete memory");
      setFacts((current) => current.filter((fact) => fact.id !== factId));
    } catch {
      setStatus("error");
    } finally {
      setDeletingId(undefined);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) setStatus("loading");
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
        >
          <Brain className="size-4 shrink-0 opacity-70" />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            Memory
          </span>
        </button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b border-border/70 px-5 py-5">
          <SheetTitle>What Hearth remembers</SheetTitle>
          <SheetDescription>
            Personal facts and sourced web claims available across conversations.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {status === "loading" && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading memory
            </div>
          )}
          {status === "error" && (
            <p className="py-8 text-sm text-destructive">
              Memory could not be updated. Please try again.
            </p>
          )}
          {status === "ready" && facts.length === 0 && claims.length === 0 && (
            <p className="py-8 text-sm leading-6 text-muted-foreground">
              Nothing saved for this browser identity yet. Facts and sourced
              claims will appear here after conversations.
            </p>
          )}
          {facts.length > 0 && (
            <section className="pt-5">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                About you
              </h3>
              <ul className="mt-2 divide-y divide-border/60">
                {facts.map((fact) => (
                  <li key={fact.id} className="flex gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-6">{fact.factText}</p>
                      <p className="mt-1 text-xs capitalize text-muted-foreground">
                        {fact.category}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete memory: ${fact.factText}`}
                      disabled={deletingId === fact.id}
                      onClick={() => void deleteFact(fact.id)}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                    >
                      {deletingId === fact.id ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <Trash2 />
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {claims.length > 0 && (
            <section className="pt-6">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Remembered from the web
              </h3>
              <ul className="mt-2 divide-y divide-border/60">
                {claims.map((claim) => (
                  <li key={claim.id} className="py-4">
                    <p className="text-sm leading-6">{claim.claimText}</p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className={
                          claim.status === "current"
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-300"
                            : "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300"
                        }
                      >
                        {claim.status}
                      </span>
                      <span>{new Date(claim.observedAt).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
