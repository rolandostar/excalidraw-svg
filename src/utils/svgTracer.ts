import ImageTracer from 'imagetracerjs/imagetracer_v1.2.6.js';

/**
 * High-Precision Client-Side Image-to-SVG Vector Tracer Engine
 * 
 * 1. Renders any complex SVG onto an HTML5 Canvas.
 * 2. Extracts 2D RGBA pixel buffer.
 * 3. Vectorizes color contours using ImageTracer into clean, flat polygonal SVG paths.
 * 4. Yields a simplified, normalized SVG string perfectly suited for Excalidraw native element translation.
 */
export async function traceSvgStringToCleanSvg(
  svgString: string,
  width: number = 256,
  height: number = 256,
  numberOfColors: number = 16
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return resolve(svgString);
    }

    try {
      const img = new Image();
      const encoded = encodeURIComponent(svgString)
        .replace(/'/g, '%27')
        .replace(/"/g, '%22');
      const dataUrl = `data:image/svg+xml,${encoded}`;

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(svgString);

          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const imgData = ctx.getImageData(0, 0, width, height);

          const options = {
            layering: 1, // 1 = Inkscape-style sequential stacked color layers (no edge gaps between shapes!)
            numberofcolors: numberOfColors,
            ltres: 0.5,
            qtres: 0.5,
            pathomit: 4,
            rightangleenhance: true,
            roundcoords: 2,
            scale: 1,
            strokewidth: 0,
          };

          const tracedSvg = ImageTracer.imagedataToSVG(imgData, options);
          resolve(tracedSvg || svgString);
        } catch (err) {
          console.warn('Canvas tracing warning:', err);
          resolve(svgString);
        }
      };

      img.onerror = () => resolve(svgString);
      img.src = dataUrl;
    } catch (err) {
      console.warn('SVG Tracer fallback:', err);
      resolve(svgString);
    }
  });
}
