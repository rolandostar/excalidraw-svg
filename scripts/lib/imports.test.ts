import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Structural checks over the import graph.
 *
 * Here rather than in ESLint because `import/no-cycle` does not fire under
 * ESLint 10's flat config - verified by planting a two-module cycle and
 * getting a clean run - and a check that cannot fail is worse than none.
 *
 * Runtime edges only. A `import type` edge is erased before anything executes,
 * so it cannot deadlock a module; `regions/primitives.ts` and
 * `regions/boolean.ts` legitimately reference each other's types.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const DIRS = ['src', 'scripts', 'vite'];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const dir of DIRS) walk(path.join(ROOT, dir));
  return out;
}

/** Resolves a relative specifier the way the bundler does, extension omitted. */
function resolve(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const IMPORT = /import\s+(type\s+)?(?:[\s\S]*?)\s*from\s*'([^']+)'/g;
const BARE = /import\s+'([^']+)'/g;

/**
 * Comments are stripped first. Without this, the note in `setupDom.ts` that
 * says to write `import './setupDom'` reads as a self-edge.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function runtimeGraph(): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const file of sourceFiles()) {
    const text = stripComments(fs.readFileSync(file, 'utf-8'));
    const edges: string[] = [];

    for (const m of text.matchAll(IMPORT)) {
      // `import type { X }` is erased; `import { type X }` still loads the
      // module for whatever else the clause names.
      if (m[1]) continue;
      const target = resolve(file, m[2]);
      if (target) edges.push(target);
    }
    for (const m of text.matchAll(BARE)) {
      const target = resolve(file, m[1]);
      if (target) edges.push(target);
    }

    graph.set(file, edges);
  }

  return graph;
}

/** Every cycle, each reported once, as repo-relative paths. */
function findCycles(graph: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 'open' | 'done'>();
  const stack: string[] = [];

  const visit = (node: string) => {
    const seen = state.get(node);
    if (seen === 'done') return;
    if (seen === 'open') {
      cycles.push([...stack.slice(stack.indexOf(node)), node]);
      return;
    }

    state.set(node, 'open');
    stack.push(node);
    for (const next of graph.get(node) ?? []) visit(next);
    stack.pop();
    state.set(node, 'done');
  };

  for (const node of graph.keys()) visit(node);
  return cycles.map(c => c.map(f => path.relative(ROOT, f).replace(/\\/g, '/')));
}

describe('import graph', () => {
  it('has no runtime cycles', () => {
    expect(findCycles(runtimeGraph())).toEqual([]);
  });

  /**
   * The barrels are gone: `types/index.ts`, `utils/pathRegions.ts` and
   * `utils/excalidrawGenerator.ts` were pure re-export files that hid which
   * module a call site actually depended on.
   */
  it('has no pure re-export module', () => {
    const barrels = sourceFiles().filter(file => {
      const body = fs
        .readFileSync(file, 'utf-8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .trim();
      if (!body) return false;
      const statements = body.split('\n').filter(l => l.trim());
      return statements.length > 2 && statements.every(l => /^\s*(export\s*\{|\}|[\w,\s]+\}?)/.test(l) && !/^\s*(function|const|class|interface|type)\b/.test(l)) && body.includes('export {') && body.includes('} from');
    });

    expect(barrels.map(f => path.relative(ROOT, f).replace(/\\/g, '/'))).toEqual([]);
  });
});
