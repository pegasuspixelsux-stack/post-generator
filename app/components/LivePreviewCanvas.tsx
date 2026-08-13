'use client';

import { useEffect, useRef, useState } from 'react';
import { GraphicConfig } from '../lib/types';
import { canvasFontFamily, ensureCanvasFontsLoaded } from '../lib/canvasFonts';

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

function drawOverlay(ctx: CanvasRenderingContext2D, config: GraphicConfig, width: number, height: number) {
  const overlay = config.overlay;
  const opacity = Math.max(0, Math.min(1, overlay.opacity));

  if (overlay.type === 'solid') {
    if (opacity <= 0) return;
    ctx.fillStyle = hexToRgba(overlay.color, opacity);
    ctx.fillRect(0, 0, width, height);
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

  drawOverlay(ctx, config, width, height);

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
      className="max-h-[750px] max-w-full rounded shadow-lg"
      style={{ aspectRatio: `${config.canvasWidth} / ${config.canvasHeight}` }}
    />
  );
}
