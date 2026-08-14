import { GraphicConfig } from './types';
import { nextId } from './color';

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => GraphicConfig;
}

export const presets: Preset[] = [
  {
    id: 'daily-menu',
    name: 'Daily Menu',
    description: 'Bold headline top-left over a food photo, logo badge in the corner.',
    build: () => ({
      canvasWidth: 1080,
      canvasHeight: 1920,
      backgroundImageUrl: 'https://picsum.photos/seed/dailymenu/1080/1920',
      backgroundColor: '#18181b',
      overlay: { type: 'solid', color: '#000000', opacity: 0.35, color2: '#000000', opacity2: 0, direction: 'bottom' },
      logo: { url: 'https://placehold.co/200x100/png?text=LOGO', x: 80, y: 80, width: 200, height: 100 },
      secondaryImages: [],
      lines: [],
      wordart: { url: '', x: 340, y: 700, width: 400, height: 400 },
      richLines: [
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 350,
          spans: [
            { id: nextId('span'), text: 'ALMUERZO ', font_size: 52, color: '#ffffff', bold: true, font_family: 'Poppins' },
            { id: nextId('span'), text: 'DEL DÍA', font_size: 52, color: '#ffcc00', bold: true, font_family: 'Poppins' },
          ],
        },
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 430,
          spans: [
            { id: nextId('span'), text: 'Desde $9.99', font_size: 36, color: '#ffffff', bold: false, font_family: 'Poppins' },
          ],
        },
      ],
    }),
  },
  {
    id: 'service-announcement',
    name: 'Service Announcement',
    description: 'Centered, high-contrast text over a darker overlay for notices and updates.',
    build: () => ({
      canvasWidth: 1080,
      canvasHeight: 1920,
      backgroundImageUrl: 'https://picsum.photos/seed/announcement/1080/1920',
      backgroundColor: '#0f172a',
      overlay: { type: 'solid', color: '#000000', opacity: 0.55, color2: '#000000', opacity2: 0, direction: 'bottom' },
      logo: { url: 'https://placehold.co/200x100/png?text=LOGO', x: 80, y: 80, width: 200, height: 100 },
      secondaryImages: [],
      lines: [],
      wordart: { url: '', x: 340, y: 700, width: 400, height: 400 },
      richLines: [
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 800,
          spans: [
            { id: nextId('span'), text: 'HORARIO ', font_size: 56, color: '#ffffff', bold: true, font_family: 'Barlow' },
            { id: nextId('span'), text: 'ESPECIAL', font_size: 56, color: '#38bdf8', bold: true, font_family: 'Barlow' },
          ],
        },
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 890,
          spans: [
            { id: nextId('span'), text: 'Abierto todos los días 8am–10pm', font_size: 32, color: '#e2e8f0', bold: false, font_family: 'Barlow' },
          ],
        },
      ],
    }),
  },
  {
    id: 'event-flyer',
    name: 'Event Flyer',
    description: 'Bottom-aligned title and date/time band, suited for events and promos.',
    build: () => ({
      canvasWidth: 1080,
      canvasHeight: 1920,
      backgroundImageUrl: 'https://picsum.photos/seed/eventflyer/1080/1920',
      backgroundColor: '#1c1917',
      overlay: { type: 'gradient', color: '#000000', opacity: 0.75, color2: '#000000', opacity2: 0, direction: 'bottom' },
      logo: { url: 'https://placehold.co/200x100/png?text=LOGO', x: 80, y: 80, width: 200, height: 100 },
      secondaryImages: [],
      lines: [],
      wordart: { url: '', x: 340, y: 700, width: 400, height: 400 },
      richLines: [
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 1550,
          spans: [
            { id: nextId('span'), text: 'NOCHE DE ', font_size: 60, color: '#ffffff', bold: false, font_family: 'Anton' },
            { id: nextId('span'), text: 'TRIVIA', font_size: 60, color: '#f97316', bold: false, font_family: 'Anton' },
          ],
        },
        {
          id: nextId('line'),
          line_spacing: 0,
          max_width: 0,
          x: 80,
          y: 1650,
          spans: [
            { id: nextId('span'), text: 'Viernes 21 · 8:00 PM', font_size: 34, color: '#ffffff', bold: false, font_family: 'Poppins' },
          ],
        },
      ],
    }),
  },
];
