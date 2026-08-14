// Loads the same bundled font files the backend uses (copied into
// public/fonts/) as browser FontFaces, so the client-side live preview can
// render text in the same families as the real server-rendered output.

const FONT_FILES: Record<string, { regular: string; bold?: string }> = {
  Poppins: { regular: '/fonts/Poppins-Regular.ttf', bold: '/fonts/Poppins-Bold.ttf' },
  Barlow: { regular: '/fonts/Barlow-Regular.ttf', bold: '/fonts/Barlow-Bold.ttf' },
  PTSerif: { regular: '/fonts/PTSerif-Regular.ttf', bold: '/fonts/PTSerif-Bold.ttf' },
  BebasNeue: { regular: '/fonts/BebasNeue-Regular.ttf' },
  Anton: { regular: '/fonts/Anton-Regular.ttf' },
  Lobster: { regular: '/fonts/Lobster-Regular.ttf' },
  BubblegumSans: { regular: '/fonts/BubblegumSans-Regular.ttf' },
};

let loadPromise: Promise<void> | null = null;

/** Registers every bundled font family with the document once. Safe to call
 * repeatedly — subsequent calls reuse the same in-flight/resolved promise. */
export function ensureCanvasFontsLoaded(): Promise<void> {
  if (loadPromise) return loadPromise;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve();
  }

  const loads: Promise<unknown>[] = [];
  for (const [family, files] of Object.entries(FONT_FILES)) {
    const regular = new FontFace(family, `url(${files.regular})`, { weight: '400' });
    loads.push(regular.load().then((f) => document.fonts.add(f)).catch(() => undefined));
    if (files.bold) {
      const bold = new FontFace(family, `url(${files.bold})`, { weight: '700' });
      loads.push(bold.load().then((f) => document.fonts.add(f)).catch(() => undefined));
    }
  }
  loadPromise = Promise.all(loads).then(() => undefined);
  return loadPromise;
}

/** Falls back to a generic sans-serif for families we don't bundle (e.g. the
 * backend's "System Default" — canvas can't reach the server's OS fonts). */
export function canvasFontFamily(id: string): string {
  return id in FONT_FILES ? id : 'sans-serif';
}
