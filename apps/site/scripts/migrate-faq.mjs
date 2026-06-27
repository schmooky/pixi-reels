import { stringify } from 'yaml';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const SITE = '/Users/user/GitHub/pixi-reels/apps/site';
const { FAQ } = await import(resolve(SITE, 'src/content/faq.ts'));

const groupsDir = resolve(SITE, 'src/content/faq-groups');
const faqDir = resolve(SITE, 'src/content/faq');
for (const d of [groupsDir, faqDir]) {
  rmSync(d, { recursive: true, force: true });
  mkdirSync(d, { recursive: true });
}

let qCount = 0;
FAQ.forEach((group, gi) => {
  // group meta — slug (id) is the filename, omitted from body.
  writeFileSync(
    resolve(groupsDir, `${group.id}.yaml`),
    stringify({ title: group.title.en, blurb: group.blurb.en, order: gi }),
  );

  for (const q of group.questions) {
    const data = { group: group.id, question: q.en };
    if (q.answer?.en) data.answer = q.answer.en;
    if (q.recipe) data.recipe = q.recipe;
    if (q.links?.length) data.links = q.links.map((l) => ({ label: l.label, href: l.href }));
    else data.links = [];
    // id is the filename (slugField), not stored in the body.
    writeFileSync(resolve(faqDir, `${q.id}.yaml`), stringify(data));
    qCount++;
  }
});

console.log(`Wrote ${FAQ.length} groups, ${qCount} questions.`);
