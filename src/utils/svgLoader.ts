import { GCPIcon } from '../types';
import { categorizeIcon, formatTitle } from './categorizer';
import { optimizeSvgString } from './svgOptimizer';

export function loadAllGCPIcons(): GCPIcon[] {
  const svgModules = import.meta.glob(['/svg/*.svg', '../../svg/*.svg'], { query: '?raw', eager: true }) as Record<
    string,
    { default?: string } | string
  >;

  const icons: GCPIcon[] = [];
  const seenNames = new Set<string>();

  for (const path in svgModules) {
    const rawSvg = typeof svgModules[path] === 'string'
      ? (svgModules[path] as string)
      : (svgModules[path] as { default: string }).default || '';

    if (!rawSvg) continue;

    const match = path.match(/(?:^|\/|\\)(?:svg[\/\\])?([^\/\\]+)\.svg$/i);
    if (!match) continue;

    const name = match[1];
    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const title = formatTitle(name);
    const category = categorizeIcon(name);
    const optimizedSvg = optimizeSvgString(rawSvg);

    let width = 48;
    let height = 48;

    const viewBoxMatch = optimizedSvg.match(/viewBox=["']\d+\s+\d+\s+(\d+)\s+(\d+)["']/i);
    if (viewBoxMatch) {
      width = parseFloat(viewBoxMatch[1]) || 48;
      height = parseFloat(viewBoxMatch[2]) || 48;
    } else {
      const widthMatch = optimizedSvg.match(/width=["'](\d+)(?:px)?["']/i);
      const heightMatch = optimizedSvg.match(/height=["'](\d+)(?:px)?["']/i);
      if (widthMatch && heightMatch) {
        width = parseFloat(widthMatch[1]) || 48;
        height = parseFloat(heightMatch[2]) || 48;
      }
    }

    const encodedSvg = encodeURIComponent(optimizedSvg).replace(/'/g, '%27').replace(/"/g, '%22');
    const dataUrl = `data:image/svg+xml,${encodedSvg}`;

    const tags = Array.from(
      new Set([
        ...name.toLowerCase().split('-'),
        ...title.toLowerCase().split(' '),
        category,
        'gcp',
        'google cloud',
      ])
    ).filter(t => t.length > 1);

    icons.push({
      id: name,
      name,
      title,
      category,
      tags,
      rawSvg: optimizedSvg,
      optimizedSvg,
      dataUrl,
      width,
      height,
    });
  }

  return icons.sort((a, b) => a.title.localeCompare(b.title));
}
