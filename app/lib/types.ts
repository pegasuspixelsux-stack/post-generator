// Mirrors the backend's Pydantic models in backend/app/models.py.

// Entrance animation for a video export (POST /generate-video); ignored for
// static image generation. "none" means the element is always at rest.
export type AnimationType = 'none' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'fade';

export interface AnimationFields {
  animation: AnimationType;
  animation_duration: number; // seconds; smaller = faster
  animation_delay: number; // seconds after video start before this element begins animating
}

export const DEFAULT_ANIMATION: AnimationFields = {
  animation: 'none',
  animation_duration: 0.6,
  animation_delay: 0,
};

export interface LogoConfig extends AnimationFields {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageBlock {
  id: string; // client-side only, for React keys / add-remove
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextSpan {
  id: string; // client-side only
  text: string;
  font_size: number;
  color: string; // hex, e.g. "#ffffff" — converted to RGB tuple before sending
  bold: boolean;
  font_family: string; // id from GET /fonts, e.g. "Poppins"
}

export interface FontFamily {
  id: string;
  name: string;
  has_bold: boolean;
}

export interface RichLine extends AnimationFields {
  id: string; // client-side only
  x: number;
  y: number;
  spans: TextSpan[];
  line_spacing: number; // 0 = spans render inline (default); >0 = stacked, one span per row, this many px apart
  max_width: number; // 0 = no wrap (default); >0 = word-wrap all spans' text within this px width, flowing onto new rows
}

export type OverlayDirection = 'top' | 'bottom' | 'left' | 'right' | 'radial';

export interface OverlayConfig {
  type: 'solid' | 'gradient';
  color: string; // hex — solid fill, or gradient's anchor-end color
  opacity: number; // 0..1
  color2: string; // hex — gradient's fade-end color (ignored for solid)
  opacity2: number; // 0..1 (ignored for solid)
  direction: OverlayDirection; // gradient only; anchor placement
}

// A second, independent overlay layer composited directly on top of
// `overlay` (same z-order slot). Off by default so it's a no-op until
// the user turns it on.
export const DEFAULT_OVERLAY2: OverlayConfig = {
  type: 'gradient',
  color: '#000000',
  opacity: 0,
  color2: '#000000',
  opacity2: 0,
  direction: 'bottom',
};

export interface WordArtConfig extends AnimationFields {
  url: string; // optional — omitted (empty) means no word art is rendered
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LineShape {
  id: string; // client-side only
  x: number;
  y: number;
  length: number;
  thickness: number;
  angle: number; // degrees; 0 = horizontal, 90 = vertical, clockwise
  color: string; // hex
  opacity: number; // 0..1
}

export interface GraphicConfig {
  canvasWidth: number;
  canvasHeight: number;
  backgroundImageUrl: string;
  backgroundColor: string; // hex
  overlay: OverlayConfig;
  overlay2: OverlayConfig;
  logo: LogoConfig;
  secondaryImages: ImageBlock[];
  lines: LineShape[];
  richLines: RichLine[];
  wordart: WordArtConfig;
}
