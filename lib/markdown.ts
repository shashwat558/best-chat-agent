const CITATION_MARKER = /[\[【](s\d+)[\]】]/gi;

export const CITATION_LINK_PATTERN = /^#src-(s\d+)$/i;

const FENCE_LINE = /^[ \t]*(`{3,}|~{3,})(.*)$/;

function fenceState(marker: string): string {
  return marker[0] + String(marker.length);
}

/**
 * Rewrites citation markers ("[s1]", "【s12】") in assistant text into
 * fragment links so the markdown renderer can swap them for citation
 * chips without embedding React inside markdown. Markers inside fenced
 * code blocks are left alone.
 */
export function citationLinksToMarkdown(text: string): string {
  let openFence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const fence = FENCE_LINE.exec(line);
      if (fence) {
        const marker = fence[1];
        const state = fenceState(marker);
        if (!openFence) {
          openFence = state;
        } else if (
          state[0] === openFence[0] &&
          marker.length >= Number(openFence.slice(1)) &&
          fence[2].trim() === ""
        ) {
          openFence = null;
        }
        return line;
      }
      if (openFence) {
        return line;
      }
      return line.replace(CITATION_MARKER, (_match, id: string) => {
        const index = Number.parseInt(id.slice(1), 10);
        return `[${index}](#src-${id.toLowerCase()})`;
      });
    })
    .join("\n");
}

/**
 * During streaming a code fence can arrive before its closing fence,
 * which renders as stray backticks. Appends the missing fence so
 * partial code blocks render as (unhighlighted) code instead. Follows
 * CommonMark: fences do not nest, and a closing fence is a bare marker
 * run of the same character that is at least as long as the opener.
 */
export function balanceStreamingFences(text: string): string {
  const lines = text.split("\n");
  let open: { char: string; length: number } | null = null;
  for (const line of lines) {
    const match = FENCE_LINE.exec(line);
    if (!match) continue;
    const marker = match[1];
    if (
      open &&
      marker[0] === open.char &&
      marker.length >= open.length &&
      match[2].trim() === ""
    ) {
      open = null;
    } else if (!open) {
      open = { char: marker[0], length: marker.length };
    }
  }
  if (!open) {
    return text;
  }
  const closing = open.char.repeat(open.length);
  return text.endsWith("\n") ? `${text}${closing}\n` : `${text}\n${closing}`;
}

/**
 * Prepares assistant text for markdown rendering: balances streaming
 * fences and rewrites citation markers into fragment links.
 */
export function prepareMarkdownText(text: string): string {
  return citationLinksToMarkdown(balanceStreamingFences(text));
}
