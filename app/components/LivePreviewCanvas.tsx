'use client';

import { useEffect, useRef, useState } from 'react';
import { GraphicConfig, RichLine, TextSpan } from '../lib/types';
import { canvasFontFamily, ensureCanvasFontsLoaded } from '../lib/canvasFonts';

/** Mirrors the backend's _draw_wrapped_line: tokenize every span's text
 * into words (each keeping its own span's style) and pack them left-to-
 * right, wrapping to a new row whenever the next word would cross
 * line.x + max_width. */
function drawWrappedLine(ctx: CanvasRenderingContext2D, line: RichLine) {
  const words: { text: string; span: TextSpan }[] = [];
  for (const span of line.spans) {
    for (const word of span.text.split(' ')) {
      if (word) words.push({ text: word, span });
    }
  }
  if (words.length === 0) return;

  const rowHeight =
    line.line_spacing > 0 ? line.line_spacing : Math.round(Math.max(...line.spans.map((s) => s.font_size)) * 1.2);

  const fontOf = (span: TextSpan) => `${span.bold ? 'bold ' : ''}${span.font_size}px "${canvasFontFamily(span.font_family)}"`;

  let cursorX = line.x;
  let cursorY = line.y;
  let rowStart = true;

  for (const { text, span } of words) {
    ctx.font = fontOf(span);
    const wordWidth = ctx.measureText(text).width;

    if (!rowStart && cursorX + wordWidth > line.x + line.max_width) {
      cursorY += rowHeight;
      cursorX = line.x;
      rowStart = true;
    }

    ctx.fillStyle = span.color;
    ctx.fillText(text, cursorX, cursorY);
    const spaceWidth = ctx.measureText(' ').width;
    cursorX += wordWidth + spaceWidth;
    rowStart = false;
  }
}

// Approximate client-side mirror of backend/app/rendering.py, drawn on a
// <canvas> so edits show up instantly without a server round-trip. It's not
// pixel-perfect (canvas text metrics differ slightly from Pillow's, and the
// radial overlay is a circle here vs. an ellipse server-side) — good enough
// to check layout/colors/text before committing to a real render.

const imageCache = new Map<string, HTMLImageElement | 'error'>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const cached = imageCache.get(url);
    if (cached === 'error') {
      resolve(null);
      return;
    }
    if (cached) {
      resolve(cached);
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageCache.set(url, img);
      resolve(img);
    };
    img.onerror = () => {
      imageCache.set(url, 'error');
      resolve(null);
    };
    img.src = url;
  });
}

/** Cover-fit + center-crop, matching the backend's _cover_resize. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  if (w <= 0 || h <= 0 || img.width === 0 || img.height === 0) return;
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function hexToRgba(hex: string, opacity: number): string {
  const clean = (hex || '#000000').replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full || '000000', 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

function angleVector(deg: number): { dx: number; dy: number } {
  const theta = (deg * Math.PI) / 180;
  return { dx: Math.cos(theta), dy: Math.sin(theta) };
}

/** For a direction vector at `angleDeg` (0=right, 90=down, clockwise — same
 * convention as the backend and LineShape.angle), the two canvas corners
 * with the lowest and highest projection onto that vector. Used as gradient
 * line endpoints so an angled gradient/cut spans the full canvas correctly
 * even when it isn't square (mirrors the backend's `_corner_projected_norm`). */
function projectedLineEndpoints(angleDeg: number, width: number, height: number) {
  const { dx, dy } = angleVector(angleDeg);
  const corners: [number, number][] = [[0, 0], [width, 0], [0, height], [width, height]];
  let min = Infinity, max = -Infinity;
  let minPt = corners[0], maxPt = corners[0];
  for (const [x, y] of corners) {
    const p = x * dx + y * dy;
    if (p < min) { min = p; minPt = [x, y]; }
    if (p > max) { max = p; maxPt = [x, y]; }
  }
  return { x0: minPt[0], y0: minPt[1], x1: maxPt[0], y1: maxPt[1] };
}

/** Draws a solid overlay's hard-edged partial block: "circular" traces an
 * explicit curved boundary path (bulging toward the canvas center) and
 * fills it; "straight"/"angled" fake a hard edge with a near-instant
 * gradient color-stop, reusing the same angle-projection math as the
 * gradient overlay's "angle" direction — mirrors the backend's
 * `_solid_edge_mask`. */
function drawSolidBlock(
  ctx: CanvasRenderingContext2D,
  overlay: GraphicConfig['overlay'],
  color: string,
  width: number,
  height: number,
) {
  const coverage = Math.max(0, Math.min(100, overlay.solidCoverage)) / 100;
  const fromBottom = overlay.solidPosition === 'bottom';

  if (overlay.solidShape === 'circular') {
    const bulge = 0.12 * height;
    const baseY = fromBottom ? height * (1 - coverage) : height * coverage;
    const boundaryY = (x: number) => {
      const t = (x / width) * 2 - 1; // -1..1
      const curve = bulge * (1 - t * t); // 0 at edges, bulges toward the center column
      return fromBottom ? baseY - curve : baseY + curve;
    };
    const steps = 48;
    ctx.beginPath();
    ctx.moveTo(0, fromBottom ? height : 0);
    ctx.lineTo(0, boundaryY(0));
    for (let i = 1; i <= steps; i++) {
      const x = (i / steps) * width;
      ctx.lineTo(x, boundaryY(x));
    }
    ctx.lineTo(width, fromBottom ? height : 0);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    return;
  }

  // "straight" is just "angled" with a zero tilt: both cut along a base
  // angle pointing into the block (90=down for bottom, 270=up for top).
  const baseAngle = fromBottom ? 90 : 270;
  const tilt = overlay.solidShape === 'angled' ? overlay.solidAngle : 0;
  const { x0, y0, x1, y1 } = projectedLineEndpoints(baseAngle + tilt, width, height);
  const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
  const cut = Math.max(0, Math.min(1, 1 - coverage));
  const eps = 0.001;
  const transparent = 'rgba(0, 0, 0, 0)';
  gradient.addColorStop(0, transparent);
  gradient.addColorStop(Math.max(0, cut - eps), transparent);
  gradient.addColorStop(Math.min(1, cut + eps), color);
  gradient.addColorStop(1, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawOverlay(ctx: CanvasRenderingContext2D, overlay: GraphicConfig['overlay'], width: number, height: number) {
  const opacity = Math.max(0, Math.min(1, overlay.opacity));

  if (overlay.type === 'solid') {
    if (opacity <= 0) return;
    const color = hexToRgba(overlay.color, opacity);
    if (overlay.solidShape === 'full') {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, width, height);
    } else {
      drawSolidBlock(ctx, overlay, color, width, height);
    }
    return;
  }

  const opacity2 = Math.max(0, Math.min(1, overlay.opacity2));
  if (opacity <= 0 && opacity2 <= 0) return;

  const anchor = hexToRgba(overlay.color, opacity);
  const fade = hexToRgba(overlay.color2, opacity2);
  let gradient: CanvasGradient;

  if (overlay.direction === 'radial') {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);
    gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    gradient.addColorStop(0, anchor);
    gradient.addColorStop(1, fade);
  } else if (overlay.direction === 'angle') {
    const { x0, y0, x1, y1 } = projectedLineEndpoints(overlay.angle, width, height);
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, fade);
    gradient.addColorStop(1, anchor);
  } else {
    // (x0,y0) is always the fade end, (x1,y1) the anchor end.
    let x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    if (overlay.direction === 'bottom') {
      y1 = height;
    } else if (overlay.direction === 'top') {
      y0 = height;
    } else if (overlay.direction === 'left') {
      x0 = width;
    } else {
      x1 = width; // right
    }
    gradient = ctx.createLinearGradient(x0, y0, x1, y1);
    gradient.addColorStop(0, fade);
    gradient.addColorStop(1, anchor);
  }

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

async function draw(canvas: HTMLCanvasElement, config: GraphicConfig, isCancelled: () => boolean) {
  const width = Math.max(1, Number(config.canvasWidth) || 1080);
  const height = Math.max(1, Number(config.canvasHeight) || 1920);
  const scale = Math.min(1, 800 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.save();
  ctx.scale(scale, scale);

  ctx.fillStyle = config.backgroundColor || '#000000';
  ctx.fillRect(0, 0, width, height);

  if (config.backgroundImageUrl) {
    const img = await loadImage(config.backgroundImageUrl);
    if (isCancelled()) return;
    if (img) drawCover(ctx, img, 0, 0, width, height);
  }

  drawOverlay(ctx, config.overlay, width, height);
  drawOverlay(ctx, config.overlay2, width, height);

  if (config.logo.url) {
    const img = await loadImage(config.logo.url);
    if (isCancelled()) return;
    if (img) drawCover(ctx, img, config.logo.x, config.logo.y, config.logo.width, config.logo.height);
  }

  for (const block of config.secondaryImages) {
    if (!block.url) continue;
    const img = await loadImage(block.url);
    if (isCancelled()) return;
    if (img) drawCover(ctx, img, block.x, block.y, block.width, block.height);
  }

  for (const line of config.lines) {
    if (line.length <= 0 || line.thickness <= 0 || line.opacity <= 0) continue;
    const rad = (line.angle * Math.PI) / 180;
    const ex = line.x + line.length * Math.cos(rad);
    const ey = line.y + line.length * Math.sin(rad);
    ctx.strokeStyle = hexToRgba(line.color, line.opacity);
    ctx.lineWidth = line.thickness;
    ctx.beginPath();
    ctx.moveTo(line.x, line.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.textBaseline = 'top';
  for (const line of config.richLines) {
    if (line.max_width > 0) {
      drawWrappedLine(ctx, line);
      continue;
    }
    if (line.line_spacing > 0) {
      // Vertical stack: each span on its own row, left-aligned at line.x.
      line.spans.forEach((span, i) => {
        if (!span.text) return;
        const family = canvasFontFamily(span.font_family);
        ctx.font = `${span.bold ? 'bold ' : ''}${span.font_size}px "${family}"`;
        ctx.fillStyle = span.color;
        ctx.fillText(span.text, line.x, line.y + i * line.line_spacing);
      });
      continue;
    }
    let cursorX = line.x;
    for (const span of line.spans) {
      if (!span.text) continue;
      const family = canvasFontFamily(span.font_family);
      ctx.font = `${span.bold ? 'bold ' : ''}${span.font_size}px "${family}"`;
      ctx.fillStyle = span.color;
      ctx.fillText(span.text, cursorX, line.y);
      cursorX += ctx.measureText(span.text).width;
    }
  }

  // Word art renders last so it sits on top, matching the backend.
  if (config.wordart.url) {
    const img = await loadImage(config.wordart.url);
    if (isCancelled()) return;
    if (img) drawCover(ctx, img, config.wordart.x, config.wordart.y, config.wordart.width, config.wordart.height);
  }

  ctx.restore();
}

export function LivePreviewCanvas({ config }: { config: GraphicConfig }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureCanvasFontsLoaded().then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    void draw(canvas, config, () => cancelled);
    return () => {
      cancelled = true;
    };
    // Redraw on every config edit (live preview) and once fonts finish loading.
  }, [config, fontsReady]);

  return (
    <canvas
      ref={canvasRef}
      className="max-h-[70vh] lg:max-h-[750px] max-w-full rounded shadow-lg"
      style={{ aspectRatio: `${config.canvasWidth} / ${config.canvasHeight}` }}
    />
  );
}
