/**
 * Give every content heading a clickable permalink.
 *
 * Astro already puts an `id` on markdown headings, so the anchors existed -
 * they were just invisible. Sharing a link to one section of a 20-demo umbrella
 * page meant reading the slug out of the page source, or scrolling until the URL
 * bar happened to be right.
 *
 * The trickier half is WHICH id to link. Recipe pages carry hand-written
 * anchors, `<a id="reel-groups"></a>` immediately before a heading, and those
 * are the canonical ones: `astro.config.mjs` redirects every retired
 * `/recipes/<slug>/` URL to `umbrella#<that id>`, and `llms.txt` cites them. The
 * heading's own generated slug ("groups-reels-that-stop-and-skip-together") is a
 * second, unshared name for the same place. So when a heading is preceded by a
 * bare anchor, the permalink points at the anchor's id and the two stay in
 * agreement; the generated id is left alone, so old links keep working either
 * way.
 *
 * The hast nodes are written out rather than pulling in
 * `rehype-autolink-headings` + `hastscript` for six lines of object literal.
 *
 * Ordering matters: Astro applies its own heading-id plugin AFTER user rehype
 * plugins, so a plugin that reads `properties.id` sees nothing. `astro.config`
 * therefore runs `rehypeHeadingIds` explicitly ahead of this one - the pattern
 * Astro documents for exactly this - and Astro's later pass is a no-op on
 * headings that already have an id.
 */

/** Headings that get a permalink. `h1` is the page title and has nowhere to go. */
const ANCHORED = new Set(['h2', 'h3', 'h4']);

/**
 * An `<a id="x"></a>` sitting on its own, i.e. a hand-placed anchor target.
 *
 * Two node shapes, because the pages are MDX: plain markdown leaves raw HTML as
 * a hast `element`, while MDX parses the very same tag as JSX and hands back an
 * `mdxJsxFlowElement` whose id lives in `attributes` rather than `properties`.
 * Only handling the first is why this silently matched nothing at first.
 */
function bareAnchorId(node) {
  if (!node) return null;
  if (node.children?.length) return null;

  if (node.type === 'element' && node.tagName === 'a') {
    const id = node.properties?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
  if (
    (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') &&
    node.name === 'a'
  ) {
    const attr = node.attributes?.find(
      (a) => a.type === 'mdxJsxAttribute' && a.name === 'id',
    );
    return typeof attr?.value === 'string' && attr.value.length > 0 ? attr.value : null;
  }
  return null;
}

/** The previous sibling node, ignoring whitespace-only text between them. */
function previousElement(children, index) {
  for (let i = index - 1; i >= 0; i--) {
    const node = children[i];
    if (node.type === 'text' && node.value.trim() === '') continue;
    return node;
  }
  return null;
}

function alreadyAnchored(heading) {
  return heading.children?.some(
    (c) =>
      c.type === 'element' &&
      c.tagName === 'a' &&
      []
        .concat(c.properties?.className ?? [])
        .includes('heading-anchor'),
  );
}

function permalink(href, text) {
  return {
    type: 'element',
    tagName: 'a',
    properties: {
      className: ['heading-anchor'],
      href: `#${href}`,
      // The heading text is already the accessible name of the section, so the
      // link needs one of its own or a screen reader reads "link, hash".
      'aria-label': `Permalink to "${text}"`,
    },
    children: [{ type: 'text', value: '#' }],
  };
}

function headingText(node) {
  let out = '';
  const walk = (n) => {
    if (n.type === 'text') out += n.value;
    if (n.children) n.children.forEach(walk);
  };
  walk(node);
  return out.trim();
}

export function rehypeHeadingAnchors() {
  return (tree) => {
    const visit = (parent) => {
      const children = parent.children;
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        const node = children[i];
        if (node.type !== 'element') continue;
        if (ANCHORED.has(node.tagName) && !alreadyAnchored(node)) {
          // Prefer the hand-placed anchor before this heading; fall back to the
          // heading's own generated id. The lookback skips whitespace-only text
          // nodes, which is what the newline between `<a id></a>` and `##`
          // becomes and what made a naive `children[i - 1]` never match.
          const manual = bareAnchorId(previousElement(children, i));
          const target = manual ?? node.properties?.id;
          if (typeof target === 'string' && target.length > 0) {
            node.children.push(permalink(target, headingText(node)));
          }
        }
        visit(node);
      }
    };
    visit(tree);
  };
}

export default rehypeHeadingAnchors;
