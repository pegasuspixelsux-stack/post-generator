export type Align = 'left' | 'center' | 'right';

/** Computes the x that places an element of `elementWidth` at the given
 * horizontal alignment within `canvasWidth`, `paddingPx` in from the edge
 * (ignored for 'center'). */
export function alignedX(align: Align, canvasWidth: number, elementWidth: number, paddingPx: number): number {
  if (align === 'left') return paddingPx;
  if (align === 'right') return canvasWidth - elementWidth - paddingPx;
  return Math.round((canvasWidth - elementWidth) / 2);
}
