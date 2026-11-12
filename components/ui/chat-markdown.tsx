"use client";

import { memo, useCallback, useMemo, useState, isValidElement, Children, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { CITATION_LINK_PATTERN, prepareMarkdownText } from "@/lib/markdown";
import { WebSearchCitation, type WebSource } from "@/components/ui/web-search";

// ─── helpers ───────────────────────────────────────────────────────────────────

function nodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join("");
  }
  if (isValidElement(node)) {
    return nodeToText(
      (node.props as { children?: ReactNode }).children,
    );
  }
  return "";
}

function languageOf(className: string | undefined): string {
  const match = /language-([\w+-]+)/.exec(className ?? "");
  return match?.[1] ?? "";
}

// ─── code block ────────────────────────────────────────────────────────────────

function CodeBlock({
  language,
  codeClassName,
  children,
}: {
  language: string;
  codeClassName?: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard
      .writeText(nodeToText(children))
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => {});
  }, [children]);

  return (
    <div className="my-4 overflow-hidden rounded-lg border border-border/70 bg-muted/40">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied code" : "Copy code"}
          className="flex items-center gap-1 text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[13px] leading-[1.65]">
        <code className={cn("hljs font-mono", codeClassName)}>{children}</code>
      </pre>
    </div>
  );
}

// ─── element mappings ──────────────────────────────────────────────────────────

const HEADINGS: Array<[keyof Components, string]> = [
  ["h1", "mb-3 mt-6 text-[1.35em] font-semibold tracking-tight"],
  ["h2", "mb-2.5 mt-6 text-[1.2em] font-semibold tracking-tight"],
  ["h3", "mb-2 mt-5 text-[1.08em] font-semibold"],
  ["h4", "mb-2 mt-5 text-[1em] font-semibold"],
  ["h5", "mb-2 mt-5 text-[1em] font-semibold"],
  ["h6", "mb-2 mt-5 text-[0.92em] font-semibold uppercase tracking-wide"],
];

function buildComponents(
  sources: ReadonlyMap<string, WebSource>,
): Components {
  const headings = Object.fromEntries(
    HEADINGS.map(([tag, className]) => [
      tag,
      function Heading({ children }: ComponentPropsWithoutRef<"h2">) {
        const Tag = tag;
        return <Tag className={className}>{children}</Tag>;
      },
    ]),
  );
  return {
  ...headings,
  p: ({ children }: ComponentPropsWithoutRef<"p">) => (
    <p className="my-3 first:mt-0 last:mb-0">{children}</p>
  ),
  ul: ({ children }: ComponentPropsWithoutRef<"ul">) => (
    <ul className="my-3 list-disc space-y-1 pl-6 marker:text-muted-foreground/70 [&_ol]:list-decimal [&_ul]:list-[circle]">
      {children}
    </ul>
  ),
  ol: ({ children }: ComponentPropsWithoutRef<"ol">) => (
    <ol className="my-3 list-decimal space-y-1 pl-6 marker:text-muted-foreground/70">
      {children}
    </ol>
  ),
  li: ({ children, className }: ComponentPropsWithoutRef<"li">) => (
    <li className={cn("leading-[1.7] pl-1", className)}>{children}</li>
  ),
  blockquote: ({ children }: ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote className="my-4 border-l-2 border-border pl-4 text-muted-foreground [&_p]:my-2">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-border" />,
  a: function MarkdownLink({
    href,
    children,
  }: ComponentPropsWithoutRef<"a">) {
    const citation =
      typeof href === "string" ? CITATION_LINK_PATTERN.exec(href) : null;
    if (citation) {
      const source = sources.get(citation[1].toLowerCase());
      if (source) {
        return (
          <WebSearchCitation
            source={source}
            index={Number.parseInt(citation[1].slice(1), 10)}
            className="mx-0.5"
          />
        );
      }
    }
    const external = typeof href === "string" && /^https?:\/\//i.test(href);
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="font-medium underline decoration-border underline-offset-[3px] break-all hover:decoration-foreground"
      >
        {children}
      </a>
    );
  },
  table: ({ children }: ComponentPropsWithoutRef<"table">) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full border-collapse text-[13.5px]">
        {children}
      </table>
    </div>
  ),
  th: ({ children }: ComponentPropsWithoutRef<"th">) => (
    <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }: ComponentPropsWithoutRef<"td">) => (
    <td className="border-b border-border/50 px-3 py-2 align-top">{children}</td>
  ),
  img: ({ src, alt }: ComponentPropsWithoutRef<"img">) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} loading="lazy" className="my-4 max-w-full h-auto rounded-lg border border-border/60" />
  ),
  strong: ({ children }: ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  del: ({ children }: ComponentPropsWithoutRef<"del">) => (
    <del className="text-muted-foreground">{children}</del>
  ),
  code: function InlineCode({
    className,
    children,
  }: ComponentPropsWithoutRef<"code">) {
    if (languageOf(className)) {
      // fenced code is rendered by the pre override below
      return (
        <code className={cn("hljs font-mono", className)}>{children}</code>
      );
    }
    return (
      <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
        {children}
      </code>
    );
  },
  pre: ({ children }: ComponentPropsWithoutRef<"pre">) => {
    // with the code mapping registered, the child element's type is the
    // mapping function, so detect block code by its language class instead
    const child = Children.toArray(children).find(isValidElement);
    if (child) {
      const { className, children: codeChildren } = child.props as {
        className?: string;
        children?: ReactNode;
      };
      if (child.type === "code" || languageOf(className)) {
        return (
          <CodeBlock language={languageOf(className)} codeClassName={className}>
            {codeChildren}
          </CodeBlock>
        );
      }
    }
    return (
      <pre className="my-4 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-3.5 font-mono text-[13px] leading-[1.65]">
        {children}
      </pre>
    );
  },
  };
}

// ─── component ─────────────────────────────────────────────────────────────────

export type ChatMarkdownProps = {
  text: string;
  /** web sources keyed by citation id (lowercase "s1", "s2", …) */
  sources?: ReadonlyMap<string, WebSource>;
  className?: string;
};

/**
 * Renders assistant markdown with ChatGPT-era typography: comfortable line
 * height, subtle inline code, chrome'd code blocks with highlighting, clean
 * tables and GFM task lists. Citations ("[s1]") render as existing
 * WebSearchCitation chips. HTML in the markdown is escaped, scripts are never
 * executed, and link URLs are restricted to safe protocols by react-markdown's
 * default URL transform.
 */
export const ChatMarkdown = memo(function ChatMarkdown({
  text,
  sources,
  className,
}: ChatMarkdownProps) {
  const prepared = useMemo(() => prepareMarkdownText(text), [text]);
  const components = useMemo(
    () => buildComponents(sources ?? new Map()),
    [sources],
  );
  return (
    <div
      className={cn(
        "break-words text-[15px] leading-[1.75] text-foreground/90",
        "[&_.task-list-item]:-ml-6 [&_.task-list-item]:list-none [&_.task-list-item>input]:mr-2 [&_.task-list-item>input]:mt-[3px] [&_.task-list-item>input]:align-middle [&_.task-list-item>input]:accent-current",
        "[&_a]:break-all",
        "[&_code]:font-mono",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { ignoreMissing: true }]]}
        components={components}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
});
