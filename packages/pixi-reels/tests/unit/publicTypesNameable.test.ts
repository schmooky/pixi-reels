import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src').replace(/\\/g, '/');
const INDEX = `${SRC}/index.ts`;

/**
 * If a type appears in the signature of something `index.ts` exports on
 * purpose, a consumer must be able to name it. Otherwise they can hold the
 * value but never write it down: `const cb: ??? = (dt) => ...`.
 *
 * TypeDoc reports these as "referenced but not included in the
 * documentation" during the site build, which nothing gates on. This test
 * gates on it, by walking the real public surface with the TypeScript
 * compiler rather than grepping index.ts for a hand-kept list of names -- a
 * list only ever grows after someone has already shipped the regression.
 *
 * A type counts as "ours" when it is declared under `src/`. Anything from
 * pixi.js, gsap or the TS lib is a dependency's job to export, not ours.
 */

/**
 * Types that are deliberately internal: they appear in a public signature,
 * and we have decided a consumer does not get to name them. Every entry needs
 * a reason, because the default answer is "export it".
 *
 * The first five were hidden in 1.0.0 as a deliberate call (see the comment
 * above the Spin block in index.ts): they are engine wiring that `ReelSet` and
 * `ReelSetBuilder` construct for you. Naming one would make an internal
 * collaborator part of the semver contract.
 */
const DELIBERATELY_INTERNAL = new Set([
  'ReelMotion', // per-reel travel/wrapping; owned by Reel, never constructed by a consumer.
  'StopSequencer', // per-reel landing bookkeeping; owned by Reel.
  'SymbolFactory', // built by ReelSetBuilder from the SymbolRegistry.
  'RandomSymbolProvider', // filler-symbol source, wired by the builder.
  'ReelSetParams', // the builder's own output struct, not a consumer-authored shape.
  // Same call, one layer down: its own docstring says "Internal config
  // produced by HoldAndWinBuilder.build". A consumer builds the board through
  // HoldAndWinBuilder and never writes this struct by hand.
  'HoldAndWinBoardConfig',
]);

/** Build a program from the package tsconfig, so module resolution matches the real build. */
function createProgram(): ts.Program {
  const configPath = ts.findConfigFile(SRC, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('publicTypesNameable: no tsconfig.json above src/');
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  } as ts.ParseConfigFileHost);
  if (!parsed) throw new Error(`publicTypesNameable: could not parse ${configPath}`);
  return ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
}

/** A member a consumer can never reach, so the types in it are not surface. */
function isHidden(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const mods = ts.getModifiers(node);
    if (mods?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return true;
  }
  const name = (node as { name?: ts.Node }).name;
  if (name && ts.isPrivateIdentifier(name)) return true;
  if (name && ts.isIdentifier(name) && name.text.startsWith('_')) return true;
  return false;
}

/** Every type-reference name inside a type annotation or heritage clause. */
function collectTypeNames(root: ts.Node): ts.EntityName[] {
  const found: ts.EntityName[] = [];

  const fromTypeSubtree = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node)) found.push(node.typeName);
    else if (ts.isExpressionWithTypeArguments(node) && ts.isEntityName(node.expression)) {
      found.push(node.expression);
    }
    node.forEachChild(fromTypeSubtree);
  };

  const walk = (node: ts.Node): void => {
    // Implementation bodies are not signature. A local helper's types are
    // the author's business.
    if (ts.isBlock(node)) return;
    if (isHidden(node)) return;
    if (ts.isTypeNode(node) || ts.isHeritageClause(node)) {
      fromTypeSubtree(node);
      return;
    }
    node.forEachChild(walk);
  };

  walk(root);
  return found;
}

describe('public type surface', () => {
  const program = createProgram();
  const checker = program.getTypeChecker();

  const indexFile = program.getSourceFile(INDEX);
  if (!indexFile) throw new Error(`publicTypesNameable: ${INDEX} is not in the program`);
  const indexSymbol = checker.getSymbolAtLocation(indexFile);
  if (!indexSymbol) throw new Error('publicTypesNameable: index.ts is not a module');

  const resolveAlias = (s: ts.Symbol): ts.Symbol =>
    s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;

  const exported = checker.getExportsOfModule(indexSymbol).map(resolveAlias);
  const exportedSymbols = new Set(exported);

  // `export type RunCascadeResult = RunCascadeResultBase` re-publishes a type
  // under a second symbol. The name IS writable by a consumer, so match on the
  // declared type as well as on symbol identity, or every such alias reads as
  // a hole in the surface.
  const TYPE_LIKE =
    ts.SymbolFlags.Class | ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum;
  const exportedTypes = new Set<ts.Type>();
  for (const s of exported) {
    if (s.flags & TYPE_LIKE) exportedTypes.add(checker.getDeclaredTypeOfSymbol(s));
  }

  const ours = (decl: ts.Declaration): boolean => {
    const file = decl.getSourceFile();
    return !file.isDeclarationFile && file.fileName.replace(/\\/g, '/').startsWith(`${SRC}/`);
  };

  // name -> the exported declarations whose signature mentions it
  const unnameable = new Map<string, Set<string>>();

  for (const symbol of exported) {
    for (const decl of symbol.declarations ?? []) {
      if (!ours(decl) || decl.getSourceFile().fileName.replace(/\\/g, '/') === INDEX) continue;

      for (const entity of collectTypeNames(decl)) {
        let referenced = checker.getSymbolAtLocation(entity);
        if (!referenced) continue;
        referenced = resolveAlias(referenced);
        // A type parameter is named by the declaration itself, not imported.
        if (referenced.flags & ts.SymbolFlags.TypeParameter) continue;
        const decls = referenced.declarations ?? [];
        if (decls.length === 0 || !decls.some(ours)) continue; // pixi.js, gsap, lib.*
        if (exportedSymbols.has(referenced)) continue;
        if (referenced.flags & TYPE_LIKE && exportedTypes.has(checker.getDeclaredTypeOfSymbol(referenced)))
          continue;

        const name = referenced.getName();
        if (DELIBERATELY_INTERNAL.has(name)) continue;
        const users = unnameable.get(name) ?? new Set<string>();
        users.add(symbol.getName());
        unnameable.set(name, users);
      }
    }
  }

  it('re-exports every type a public signature mentions', () => {
    const report = [...unnameable]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, users]) => `${name} (used by ${[...users].sort().join(', ')})`);
    expect(
      report,
      'these types appear in the signature of something index.ts exports, but index.ts does not ' +
        'export them, so a consumer cannot write the type down. Export them, or add them to ' +
        'DELIBERATELY_INTERNAL with a reason',
    ).toEqual([]);
  });

  it('finds a public surface at all, so a resolution failure cannot pass silently', () => {
    // Without this, a broken program (zero exports, nothing resolving) would
    // report zero violations and look green.
    expect(exported.length).toBeGreaterThan(100);
  });

  it('re-exported names resolve in their defining module', () => {
    // index.ts can list a name that its source module declares module-local.
    // The re-export alone looks right; the alias resolves to nothing.
    const dangling = checker
      .getExportsOfModule(indexSymbol)
      .filter((s) => s.flags & ts.SymbolFlags.Alias)
      .filter((s) => (checker.getAliasedSymbol(s).declarations ?? []).length === 0)
      .map((s) => s.getName());
    expect(dangling, 'index.ts re-exports names their defining module does not export').toEqual([]);
  });
});
