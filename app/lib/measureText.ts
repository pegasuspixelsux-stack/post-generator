import { canvasFontFamily, ensureCanvasFontsLoaded } from './canvasFonts';
import { TextSpan } from './types';

let measureCanvas: HTMLCanvasElement | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  return measureCanvas.getContext('2d');
}

/** Rendered width of a rich-text line, using the same fonts as the live
 * preview — used to compute center/right alignment for text.
 *
 * When `stacked` is false (spans render inline, left-to-right), this is the
 * sum of every span's width. When true (each span on its own row via
 * line_spacing), it's the widest single row instead — summing would badly
 * overestimate since the rows aren't laid out end-to-end. */
export async function measureLineWidth(spans: TextSpan[], stacked: boolean): Promise<number> {
  await ensureCanvasFontsLoaded();
  const ctx = getMeasureContext();
  if (!ctx) return 0;

  const widthOf = (span: TextSpan) => {
    if (!span.text) return 0;
    const family = canvasFontFamily(span.font_family);
    ctx.font = `${span.bold ? 'bold ' : ''}${span.font_size}px "${family}"`;
    return ctx.measureText(span.text).width;
  };

  if (stacked) {
    return spans.reduce((max, span) => Math.max(max, widthOf(span)), 0);
  }
  return spans.reduce((total, span) => total + widthOf(span), 0);
}
