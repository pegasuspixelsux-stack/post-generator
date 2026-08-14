import { GraphicConfig } from './types';
import { hexToRgb } from './color';

export type OutputFormat = 'jpeg' | 'png' | 'webp';

/** Shape matches the backend's GenerateGraphicRequest (backend/app/models.py). */
export function buildGenerateRequestBody(
  config: GraphicConfig,
  outputFormat: OutputFormat,
  persist: boolean,
) {
  return {
    canvas_width: Number(config.canvasWidth),
    canvas_height: Number(config.canvasHeight),
    background_image_url: config.backgroundImageUrl || null,
    background_color: hexToRgb(config.backgroundColor),
    overlay: {
      type: config.overlay.type,
      color: hexToRgb(config.overlay.color),
      opacity: Number(config.overlay.opacity),
      color2: hexToRgb(config.overlay.color2),
      opacity2: Number(config.overlay.opacity2),
      direction: config.overlay.direction,
    },
    logo: config.logo.url
      ? {
          url: config.logo.url,
          x: Number(config.logo.x),
          y: Number(config.logo.y),
          width: Number(config.logo.width),
          height: Number(config.logo.height),
        }
      : null,
    secondary_images: config.secondaryImages
      .filter((img) => img.url)
      .map((img) => ({
        url: img.url,
        x: Number(img.x),
        y: Number(img.y),
        width: Number(img.width),
        height: Number(img.height),
      })),
    lines: config.lines.map((line) => ({
      x: Number(line.x),
      y: Number(line.y),
      length: Number(line.length),
      thickness: Number(line.thickness),
      angle: Number(line.angle),
      color: hexToRgb(line.color),
      opacity: Number(line.opacity),
    })),
    rich_lines: config.richLines.map((line) => ({
      x: Number(line.x),
      y: Number(line.y),
      line_spacing: Number(line.line_spacing),
      max_width: Number(line.max_width),
      spans: line.spans.map((span) => ({
        text: span.text,
        font_size: Number(span.font_size),
        color: hexToRgb(span.color),
        bold: span.bold,
        font_family: span.font_family,
      })),
    })),
    wordart: config.wordart.url
      ? {
          url: config.wordart.url,
          x: Number(config.wordart.x),
          y: Number(config.wordart.y),
          width: Number(config.wordart.width),
          height: Number(config.wordart.height),
        }
      : null,
    output_format: outputFormat,
    persist,
  };
}
