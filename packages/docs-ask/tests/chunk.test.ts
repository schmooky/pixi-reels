import { describe, expect, it } from 'vitest';
import { chunkCorpus, splitLong } from '../src/chunk.js';
import { approxTokens } from '../src/tokens.js';

const SITE = 'https://docs.example';

function corpus(parts: string[]): string {
  return parts.join('\n');
}

describe('chunkCorpus', () => {
  it('reads section, page title and URL from the llms.txt grammar', () => {
    const text = corpus([
      '# site',
      '',
      '## Guides',
      '',
      '### Nudge',
      `URL: ${SITE}/guides/nudge/`,
      'A nudge shoves one reel after it lands.',
      '',
    ]);
    const [c] = chunkCorpus(text, { siteUrl: SITE, minTokens: 1 });
    expect(c).toMatchObject({
      id: '/guides/nudge/#0',
      url: `${SITE}/guides/nudge/`,
      section: 'Guides',
      title: 'Nudge',
      text: 'A nudge shoves one reel after it lands.',
    });
    expect(c!.heading).toBeUndefined();
  });

  it('splits on #### headings and lets a heading override the URL', () => {
    const text = corpus([
      '## FAQ',
      '',
      '### Cascades',
      `URL: ${SITE}/faq/#cascades`,
      'Group blurb.',
      '',
      '#### Q: How do refills work?',
      `URL: ${SITE}/faq/cascade-refill/`,
      'A: From above, by default.',
      '',
      '#### Q: Can I skip a cascade?',
      `URL: ${SITE}/faq/cascade-skip/`,
      'A: Yes, requestSkip.',
      '',
    ]);
    const chunks = chunkCorpus(text, { siteUrl: SITE });
    expect(chunks.map((c) => c.url)).toEqual([
      `${SITE}/faq/#cascades`,
      `${SITE}/faq/cascade-refill/`,
      `${SITE}/faq/cascade-skip/`,
    ]);
    expect(chunks[1]).toMatchObject({ heading: 'Q: How do refills work?', id: '/faq/cascade-refill/#0' });
    // Short runs with different URLs never merge.
    expect(chunks).toHaveLength(3);
  });

  it('merges short runs of one page up to minTokens and keeps the heading text', () => {
    const para = 'word '.repeat(100).trim(); // ~125 tokens
    const text = corpus([
      '## Guides',
      '### Pins',
      `URL: ${SITE}/guides/pins/`,
      para,
      '',
      '#### Sticky',
      para,
      '',
      '#### Walking',
      para,
      '',
      '#### Expanding',
      para,
      '',
    ]);
    const chunks = chunkCorpus(text, { siteUrl: SITE, minTokens: 300, maxTokens: 600 });
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.text).toContain('Sticky');
    expect(chunks[0]!.text).toContain('Walking');
    expect(chunks[1]!.heading).toBe('Expanding');
    for (const c of chunks) expect(c.tokens).toBeLessThanOrEqual(600);
  });

  it('ignores heading-like lines inside fenced code and splits long code by lines', () => {
    const code = Array.from({ length: 400 }, (_, i) => `const line${i} = ${i}; // ## not a heading`).join('\n');
    const text = corpus(['## Recipe source code', '### nudge', `URL: ${SITE}/recipes/nudge/`, '```ts', code, '```', '']);
    const chunks = chunkCorpus(text, { siteUrl: SITE, maxTokens: 600 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.section).toBe('Recipe source code');
      expect(c.title).toBe('nudge');
      expect(approxTokens(c.text)).toBeLessThanOrEqual(600);
    }
    expect(chunks.map((c) => c.text).join('\n')).toContain('const line399');
  });

  it('attributes text before the first page to the site root', () => {
    const text = corpus(['# site', '', 'Intro line.', '', '## Quick start', '', 'npm install thing', '']);
    const chunks = chunkCorpus(text, { siteUrl: SITE, minTokens: 1 });
    expect(chunks.every((c) => c.url === `${SITE}/`)).toBe(true);
    expect(chunks.at(-1)).toMatchObject({ section: 'Quick start', title: 'Quick start' });
  });
});

describe('splitLong', () => {
  it('keeps a fenced block whole when it fits', () => {
    const block = ['```ts', 'a();', 'b();', '```'].join('\n');
    const para = 'p '.repeat(1000).trim(); // ~500 tokens
    const pieces = splitLong(`${para}\n\n${para}\n\n${block}`, 600);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toBe(para);
    expect(pieces[1]).toBe(`${para}\n\n${block}`);
  });
});
