import { describe, expect, it } from 'vitest';
import { normalizePath, stripBase, withBase } from './router';
import type { RoutePath } from './router';

const ROOT = '';
const SUB = '/excalidraw-svg';

const ROUTES: RoutePath[] = ['/', '/icons', '/methodology', '/icons/legacy-gcp'];

/**
 * The deploy base is applied at exactly one boundary, and getting it wrong
 * fails in a way nothing local catches: links still work, because the router
 * never leaves the page, and only a hard refresh or a pasted link 404s.
 */
describe('deploy base', () => {
  it('round-trips every route at the domain root', () => {
    for (const route of ROUTES) {
      expect(normalizePath(stripBase(withBase(route, ROOT), ROOT))).toBe(route);
    }
  });

  it('round-trips every route under a sub-path', () => {
    for (const route of ROUTES) {
      expect(normalizePath(stripBase(withBase(route, SUB), SUB))).toBe(route);
    }
  });

  it('builds real URLs under a sub-path', () => {
    expect(withBase('/', SUB)).toBe('/excalidraw-svg/');
    expect(withBase('/icons/legacy-gcp', SUB)).toBe('/excalidraw-svg/icons/legacy-gcp');
  });

  it('resolves a deep link pasted into the address bar', () => {
    expect(normalizePath(stripBase('/excalidraw-svg/icons/legacy-gcp', SUB))).toBe(
      '/icons/legacy-gcp'
    );
  });

  it('treats the bare base as the home route', () => {
    expect(stripBase('/excalidraw-svg', SUB)).toBe('/');
    expect(stripBase('/excalidraw-svg/', SUB)).toBe('/');
  });

  // A bare startsWith would slice this into '-old/icons' and route it home.
  it('does not strip a base that is only a prefix of another segment', () => {
    expect(stripBase('/excalidraw-svg-old/icons', SUB)).toBe('/excalidraw-svg-old/icons');
  });

  it('leaves pathnames alone when there is no base', () => {
    expect(stripBase('/icons', ROOT)).toBe('/icons');
  });
});
