/**
 * FAQ answers are plain prose: blank lines split paragraphs, backtick spans
 * are inline code. Shared by the question pages and the Questions section of
 * a topic page.
 */
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderAnswer(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => {
      const html = escapeHtml(p).replace(
        /`([^`]+)`/g,
        '<code class="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">$1</code>',
      );
      return `<p class="leading-7 text-foreground/85">${html}</p>`;
    })
    .join('');
}

/** The answer with its backticks dropped, for meta descriptions and JSON-LD. */
export const plainAnswer = (s: string) => s.replace(/`/g, '');
