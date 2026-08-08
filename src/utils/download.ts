/**
 * Saving generated JSON to the user's disk.
 *
 * The toolbar's library export and the convert page's scene download had
 * byte-identical Blob / createObjectURL / synthetic-anchor / revoke bodies.
 * The sequence is easy to write and easy to write *almost* right - forgetting
 * the revoke leaks the blob for the lifetime of the document - so it lives
 * here once rather than being retyped per call site.
 */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
