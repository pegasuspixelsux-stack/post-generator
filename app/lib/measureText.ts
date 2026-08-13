import { canvasFontFamily, ensureCanvasFontsLoaded } from './canvasFonts';
import { TextSpan } from './types';

let measureCanvas: HTMLCanvasElement | null = null;

/** Total rendered width of a rich-text line's spans, using the same fonts
 * as the live preview — used to compute center/right alignment for text. */
export async function measureLineWidth(spans: TextSpan[]): Promise<number> {
  await ensureCanvasFontsLoaded();
  if (typeof document === 'undefined') return 0;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  if (!ctx) return 0;

  let total = 0;
  for (const span of spans) {
    if (!span.text) continue;
    const family = canvasFontFamily(span.font_family);
    ctx.font = `${span.bold ? 'bold ' : ''}${span.font_size}px "${family}"`;
    total += ctx.measureText(span.text).width;
  }
  return total;
}
