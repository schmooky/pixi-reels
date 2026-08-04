/**
 * Guard: no public member may be typed with a `src/` type the package does not
 * export.
 *
 * The failure this exists for is silent. `RandomSymbolProvider`, `StopSequencer`
 * and `ReelMotion` were deliberately hidden from the package entry in 1.0.0
 * (PR #140), and then re-exposed anyway by public members typed with them --
 * `Reel.motion`, `Reel.stopSequencer`, `FrameBuilder.randomProvider`. The type
 * lands in `dist/core/Reel.d.ts`, semver-locking a class the changelog says is
 * internal. Nothing failed; the surface just quietly grew.
 *
 * Members tagged `@internal` are skipped: `stripInternal` is on in the root
 * tsconfig, so those never reach the published `.d.ts`.
 *
 * CONSTRUCTORS ARE REPORTED BUT NOT FIXABLE WITH `@internal`. Tagging a
 * constructor strips the whole signature from the emitted class, which leaves
 * consumers an implicit zero-arg `new Reel()` that typechecks and then explodes
 * -- strictly worse than the leak. Builder-constructed classes (`Reel`,
 * `ReelSet`, `FrameBuilder`) are listed in ALLOWED_CONSTRUCTOR_LEAKS with that
 * reasoning; a NEW constructor leak still fails the build so it gets a decision.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as presolve } from 'node:path';

// typescript is a devDependency of the library package, not hoisted to the
// workspace root, so resolve it from there.
const require = createRequire(
  presolve(dirname(fileURLToPath(import.meta.url)), '../packages/pixi-reels/package.json'),
);
const ts = require('typescript');


const ROOT = presolve(dirname(fileURLToPath(import.meta.url)), '../packages/pixi-reels');
const ENTRIES = ['src/index.ts', 'src/spine/index.ts', 'src/testing/index.ts'];
const program = ts.createProgram(ENTRIES.map(e => `${ROOT}/${e}`), {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler, strict: true, skipLibCheck: true,
});
const checker = program.getTypeChecker();

const resolve = (s) => (s.flags & ts.SymbolFlags.Alias) ? checker.getAliasedSymbol(s) : s;

// The public name set = everything any published entry point exports.
const publicNames = new Set();
const roots = [];
for (const e of ENTRIES) {
  const sf = program.getSourceFile(`${ROOT}/${e}`);
  const sym = checker.getSymbolAtLocation(sf);
  for (const ex of checker.getExportsOfModule(sym)) {
    publicNames.add(ex.getName());
    roots.push({ entry: e, sym: ex });
  }
}

const findings = [];
const isInternalTagged = (sym) => sym.getJsDocTags(checker).some(t => t.name === 'internal');

function namedTypeLeaks(type, out, seen = new Set(), depth = 0) {
  if (!type || depth > 4) return;
  const key = checker.typeToString(type);
  if (seen.has(key)) return;
  seen.add(key);
  const s = type.aliasSymbol ?? type.getSymbol();
  if (s) {
    const sd = s.declarations?.[0];
    const file = sd?.getSourceFile()?.fileName ?? '';
    const declared = sd && (ts.isClassDeclaration(sd) || ts.isInterfaceDeclaration(sd) || ts.isTypeAliasDeclaration(sd) || ts.isEnumDeclaration(sd));
    if (file.startsWith(`${ROOT}/src/`) && declared && !publicNames.has(s.getName())) {
      out.add(`${s.getName()}|${file.replace(ROOT + '/', '')}`);
    }
  }
  for (const arg of checker.getTypeArguments?.(type) ?? []) namedTypeLeaks(arg, out, seen, depth + 1);
  if (type.isUnionOrIntersection?.()) for (const t of type.types) namedTypeLeaks(t, out, seen, depth + 1);
  for (const sig of [...type.getCallSignatures(), ...type.getConstructSignatures()]) {
    namedTypeLeaks(sig.getReturnType(), out, seen, depth + 1);
    for (const p of sig.getParameters()) {
      const pd = p.declarations?.[0];
      if (pd) namedTypeLeaks(checker.getTypeOfSymbolAtLocation(p, pd), out, seen, depth + 1);
    }
  }
}

for (const { entry, sym: rawSym } of roots) {
  const sym = resolve(rawSym);
  const decl = sym.declarations?.[0];
  if (!decl) continue;
  const isClass = ts.isClassDeclaration(decl);
  const isIface = ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl);
  if (!isClass && !isIface) continue;

  const type = checker.getDeclaredTypeOfSymbol(sym);

  // Constructor + static side. A public `new Reel(...)` whose parameters name
  // hidden classes is the same leak as a getter, and walking instance
  // properties alone never sees it.
  if (isClass) {
    const staticType = checker.getTypeOfSymbolAtLocation(sym, decl);
    for (const sig of staticType.getConstructSignatures()) {
      for (const p of sig.getParameters()) {
        const pd = p.declarations?.[0];
        if (!pd) continue;
        const out = new Set();
        namedTypeLeaks(checker.getTypeOfSymbolAtLocation(p, pd), out);
        for (const leak of out) {
          const [name, file] = leak.split('|');
          findings.push({ entry, owner: rawSym.getName(), member: `constructor(${p.getName()})`, leak: name, file });
        }
      }
    }
  }

  const props = checker.getPropertiesOfType(type);
  for (const m of props) {
    const md = m.declarations?.[0];
    if (!md) continue;
    const mods = ts.getCombinedModifierFlags(md);
    if (mods & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
    if (m.getName().startsWith('_')) continue;
    if (isInternalTagged(m)) continue;   // stripInternal removes these from the .d.ts
    const out = new Set();
    namedTypeLeaks(checker.getTypeOfSymbolAtLocation(m, md), out);
    for (const leak of out) {
      const [name, file] = leak.split('|');
      findings.push({ entry, owner: rawSym.getName(), member: m.getName(), leak: name, file });
    }
  }
}

// Builder-constructed classes: see the note at the top of this file for why
// `@internal` is not the fix here.
const ALLOWED_CONSTRUCTOR_LEAKS = new Set([
  'Reel.constructor(symbolFactory)->SymbolFactory',
  'Reel.constructor(randomProvider)->RandomSymbolProvider',
  'ReelSet.constructor(params)->ReelSetParams',
  'FrameBuilder.constructor(_randomProvider)->RandomSymbolProvider',
  'HoldAndWinBoard.constructor(cfg)->HoldAndWinBoardConfig',
]);

const uniq = new Map();
for (const f of findings) uniq.set(`${f.owner}.${f.member}->${f.leak}`, f);
const rows = [...uniq.values()].sort((a, b) => (a.owner + a.member).localeCompare(b.owner + b.member));
const failures = rows.filter((r) => !ALLOWED_CONSTRUCTOR_LEAKS.has(`${r.owner}.${r.member}->${r.leak}`));
const waived = rows.length - failures.length;

if (failures.length === 0) {
  console.log(`check-api-surface: public surface clean (${publicNames.size} exported names, ${waived} waived constructor params).`);
  process.exit(0);
}
console.error(`check-api-surface: ${failures.length} public member(s) typed with non-exported src types:\n`);
for (const r of failures) console.error(`  ${r.owner}.${r.member}  ->  ${r.leak}   (${r.file})`);
console.error('\nEither export the type from the matching entry point, or tag the member `@internal`');
console.error('(stripInternal removes it from the published .d.ts). See the header of this script.');
process.exit(1);
