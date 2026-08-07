/**
 * `createExcalidrawItem` stamps every element with `Math.random()` ids/seeds and
 * `Date.now()`. That is correct for a real export - Excalidraw needs unique
 * ids - but it means the harness would rewrite all 216 `.excalidraw` fixtures
 * with a fresh diff on every run, drowning any real change in noise.
 *
 * These helpers produce a deterministic projection for on-disk snapshots only:
 * `id`, `seed`, `versionNonce`, `updated`, `created` and `fileId` are all
 * replaced with stable values. Nothing here is used by the shipped export path.
 */
function stableId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(6, '0')}`;
}

export function stabiliseElements(elements: any[], prefix = 'el'): any[] {
  const fileIds = new Map<string, string>();
  let fileCounter = 0;

  return elements.map((element, index) => {
    const next: Record<string, unknown> = { ...element };

    next.id = stableId(prefix, index);
    next.seed = 1;
    next.versionNonce = 1;
    next.updated = 0;

    if (typeof element.fileId === 'string') {
      if (!fileIds.has(element.fileId)) {
        fileIds.set(element.fileId, stableId('file', fileCounter++));
      }
      next.fileId = fileIds.get(element.fileId);
    }

    if (Array.isArray(element.groupIds)) {
      next.groupIds = element.groupIds.map((_: string, i: number) => `${prefix}-group-${i}`);
    }

    return next;
  });
}

export function stabiliseFiles(
  files: Record<string, any>,
  elements: any[],
  prefix = 'el'
): Record<string, any> {
  const stabilised = stabiliseElements(elements, prefix);
  const out: Record<string, any> = {};

  elements.forEach((element, index) => {
    if (typeof element.fileId !== 'string') return;
    const original = files[element.fileId];
    if (!original) return;
    const id = stabilised[index].fileId as string;
    out[id] = { ...original, id, created: 0 };
  });

  return out;
}

