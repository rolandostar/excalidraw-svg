/**
 * Builds a prefilled "this SVG converted badly" GitHub issue.
 *
 * A bare "open an issue" link produces reports with no reproduction case. The
 * useful part of a report is the file plus what the converter already knew was
 * risky about it, so all of that is filled in and the human only has to attach
 * the SVG and say what looks wrong.
 *
 * The source is deliberately NOT embedded. GitHub truncates long URLs, an SVG
 * pasted into a URL is unreadable in the issue body, and attaching the actual
 * file is what makes it usable as a fixture.
 */
import { REPO_URL } from '../site';
import type { ConversionResult } from './convertSvg';

/** GitHub starts failing on very long URLs; stay well inside that. */
const MAX_URL_LENGTH = 6000;

function describeWarnings(result: ConversionResult): string {
  if (result.warnings.length === 0) return '_none detected_';
  return result.warnings
    .map(w => `- \`${w.feature}\` x${w.count} — **${w.severity}** — ${w.detail}`)
    .join('\n');
}

function describeAudit(result: ConversionResult): string {
  if (result.auditIssues.length === 0) return '_none_';
  return result.auditIssues
    .slice(0, 10)
    .map(i => `- element #${i.elementIndex} (${i.elementType}) \`${i.kind}\`: ${i.detail}`)
    .join('\n');
}

export function buildIssueUrl(fileName: string, result: ConversionResult): string {
  const title = `Bad conversion: ${fileName}.svg`;

  const body = `<!--
Thanks for reporting. Edge cases are how this converter gets better: an
accepted report becomes a permanent fixture in the torture suite, so the
same bug can never come back silently.

Please ATTACH THE SVG FILE by dragging it into this box. Everything below
was filled in automatically.
-->

## What looks wrong

<!-- e.g. "the inner cutout is filled in", "the logo lost its text",
     "the whole thing is one solid rectangle" -->


## The file

<!-- Drag the .svg in here. Without it this cannot be turned into a test. -->


## Automatic detail

| | |
|---|---|
| source dimensions | ${result.dimensions.width} x ${result.dimensions.height} (from ${result.dimensions.source}) |
| converted to | ${result.width} x ${result.height} |
| elements produced | ${result.counts.total} (${result.counts.lines} line, ${result.counts.ellipses} ellipse) |

### Features the converter flagged

${describeWarnings(result)}

### Scene audit issues

${describeAudit(result)}

---
<sub>Reported from the web converter. Testing methodology: ${REPO_URL}/blob/main/docs/TESTING.md</sub>
`;

  const url = new URL(`${REPO_URL}/issues/new`);
  url.searchParams.set('title', title);
  url.searchParams.set('labels', 'edge-case');
  url.searchParams.set('body', body);

  const full = url.toString();
  if (full.length <= MAX_URL_LENGTH) return full;

  // Fall back to title-only rather than producing a URL GitHub will reject.
  const short = new URL(`${REPO_URL}/issues/new`);
  short.searchParams.set('title', title);
  short.searchParams.set('labels', 'edge-case');
  return short.toString();
}
