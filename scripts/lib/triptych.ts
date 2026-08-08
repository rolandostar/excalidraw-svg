import { PNG } from 'pngjs';
import { Raster } from './raster';

/** Horizontal strip: source | excalidraw | diff, separated by grey gutters. */
export function composeTriptych(panels: Raster[], gutter = 8): Buffer {
  const height = Math.max(...panels.map(p => p.height));
  const width = panels.reduce((sum, p) => sum + p.width, 0) + gutter * (panels.length - 1);
  const out = new PNG({ width, height });

  out.data.fill(0xff);
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 0xff;

  let offsetX = 0;
  for (const panel of panels) {
    for (let y = 0; y < panel.height; y++) {
      for (let x = 0; x < panel.width; x++) {
        const src = (y * panel.width + x) * 4;
        const dst = (y * width + (x + offsetX)) * 4;
        out.data[dst] = panel.data[src];
        out.data[dst + 1] = panel.data[src + 1];
        out.data[dst + 2] = panel.data[src + 2];
        out.data[dst + 3] = 0xff;
      }
    }
    offsetX += panel.width;
    if (offsetX < width) {
      for (let y = 0; y < height; y++) {
        for (let x = offsetX; x < Math.min(offsetX + gutter, width); x++) {
          const dst = (y * width + x) * 4;
          out.data[dst] = 0xda;
          out.data[dst + 1] = 0xdc;
          out.data[dst + 2] = 0xe0;
          out.data[dst + 3] = 0xff;
        }
      }
      offsetX += gutter;
    }
  }

  return PNG.sync.write(out);
}
