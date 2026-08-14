'use client';

import { useState } from 'react';
import { DEFAULT_ANIMATION, FontFamily, RichLine } from '../lib/types';
import { nextId } from '../lib/color';
import { alignedX, Align } from '../lib/align';
import { measureLineWidth } from '../lib/measureText';
import { AddButton, AlignRow, AnimationFieldsRow, CheckboxField, ColorField, NumberField, RemoveButton, SelectField, TextField } from './fields';

const FALLBACK_FONTS: FontFamily[] = [{ id: 'Poppins', name: 'Poppins', has_bold: true }];
const DEFAULT_PADDING = 80;

export function RichLinesEditor({
  lines,
  onChange,
  fonts,
  canvasWidth,
}: {
  lines: RichLine[];
  onChange: (lines: RichLine[]) => void;
  fonts?: FontFamily[];
  canvasWidth: number;
}) {
  const fontOptions = (fonts && fonts.length > 0 ? fonts : FALLBACK_FONTS).map((f) => ({
    value: f.id,
    label: f.name,
  }));
  const defaultFont = fontOptions[0]?.value ?? 'Poppins';
  const [paddingByLine, setPaddingByLine] = useState<Record<string, number>>({});

  const updateLine = (id: string, patch: Partial<RichLine>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleAlign = async (line: RichLine, align: Align) => {
    const padding = paddingByLine[line.id] ?? DEFAULT_PADDING;
    // Wrapping aligns the paragraph box itself (max_width); otherwise the
    // actual measured text width (summed if inline, widest row if stacked).
    const width =
      line.max_width > 0 ? line.max_width : await measureLineWidth(line.spans, line.line_spacing > 0);
    updateLine(line.id, { x: alignedX(align, canvasWidth, width, padding) });
  };

  type Layout = 'inline' | 'stacked' | 'wrap';
  const layoutOf = (line: RichLine): Layout => (line.max_width > 0 ? 'wrap' : line.line_spacing > 0 ? 'stacked' : 'inline');
  const setLayout = (line: RichLine, layout: Layout) => {
    const maxSize = Math.max(40, ...line.spans.map((s) => s.font_size));
    const defaultSpacing = Math.round(maxSize * 1.2);
    if (layout === 'inline') {
      updateLine(line.id, { max_width: 0, line_spacing: 0 });
    } else if (layout === 'stacked') {
      updateLine(line.id, { max_width: 0, line_spacing: line.line_spacing > 0 ? line.line_spacing : defaultSpacing });
    } else {
      updateLine(line.id, {
        max_width: line.max_width > 0 ? line.max_width : Math.round(canvasWidth * 0.8),
        line_spacing: line.line_spacing > 0 ? line.line_spacing : defaultSpacing,
      });
    }
  };

  const addLine = () => {
    onChange([
      ...lines,
      {
        id: nextId('line'),
        x: 80,
        y: 350 + lines.length * 80,
        line_spacing: 0,
        max_width: 0,
        ...DEFAULT_ANIMATION,
        spans: [{ id: nextId('span'), text: 'New text', font_size: 44, color: '#ffffff', bold: true, font_family: defaultFont }],
      },
    ]);
  };

  const removeLine = (id: string) => onChange(lines.filter((l) => l.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, idx) => (
        <div key={line.id} className="border border-zinc-800 rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Line {idx + 1}</span>
            <RemoveButton onClick={() => removeLine(line.id)} label="Remove line" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="X" value={line.x} onChange={(v) => updateLine(line.id, { x: v })} />
            <NumberField label="Y" value={line.y} onChange={(v) => updateLine(line.id, { y: v })} />
          </div>
          <AlignRow
            padding={paddingByLine[line.id] ?? DEFAULT_PADDING}
            onPaddingChange={(v) => setPaddingByLine((prev) => ({ ...prev, [line.id]: v }))}
            onAlign={(align) => void handleAlign(line, align)}
          />
          <AnimationFieldsRow
            animation={line.animation}
            duration={line.animation_duration}
            delay={line.animation_delay}
            onChange={(patch) => updateLine(line.id, patch)}
          />

          <div className="flex flex-col gap-2">
            <div className="flex gap-1">
              {(
                [
                  ['inline', 'Inline'],
                  ['stacked', 'Stacked'],
                  ['wrap', 'Wrap'],
                ] as [Layout, string][]
              ).map(([layout, label]) => (
                <button
                  key={layout}
                  type="button"
                  onClick={() => setLayout(line, layout)}
                  className={`text-xs rounded px-2 py-2 transition ${
                    layoutOf(line) === layout
                      ? 'bg-amber-500 text-black font-semibold'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500 hover:text-amber-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {layoutOf(line) === 'wrap' && (
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Max width (px)"
                  value={line.max_width}
                  onChange={(v) => updateLine(line.id, { max_width: v })}
                />
                <NumberField
                  label="Row spacing (px)"
                  value={line.line_spacing}
                  onChange={(v) => updateLine(line.id, { line_spacing: v })}
                />
              </div>
            )}
            {layoutOf(line) === 'stacked' && (
              <NumberField
                label="Row spacing (px)"
                value={line.line_spacing}
                onChange={(v) => updateLine(line.id, { line_spacing: v })}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            {line.spans.map((span, spanIdx) => (
              <div key={span.id} className="bg-zinc-950 border border-zinc-800 rounded p-2 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wide text-zinc-600">Span {spanIdx + 1}</span>
                  {line.spans.length > 1 && (
                    <RemoveButton
                      label="Remove span"
                      onClick={() =>
                        updateLine(line.id, { spans: line.spans.filter((s) => s.id !== span.id) })
                      }
                    />
                  )}
                </div>
                <TextField
                  value={span.text}
                  onChange={(v) =>
                    updateLine(line.id, {
                      spans: line.spans.map((s) => (s.id === span.id ? { ...s, text: v } : s)),
                    })
                  }
                  placeholder="Text"
                />
                <div className="grid grid-cols-2 gap-2 items-end">
                  <SelectField
                    label="Font"
                    value={span.font_family}
                    options={fontOptions}
                    onChange={(v) =>
                      updateLine(line.id, {
                        spans: line.spans.map((s) => (s.id === span.id ? { ...s, font_family: v } : s)),
                      })
                    }
                  />
                  <NumberField
                    label="Font size"
                    value={span.font_size}
                    onChange={(v) =>
                      updateLine(line.id, {
                        spans: line.spans.map((s) => (s.id === span.id ? { ...s, font_size: v } : s)),
                      })
                    }
                  />
                  <ColorField
                    label="Color"
                    value={span.color}
                    onChange={(v) =>
                      updateLine(line.id, {
                        spans: line.spans.map((s) => (s.id === span.id ? { ...s, color: v } : s)),
                      })
                    }
                  />
                  <CheckboxField
                    label="Bold"
                    checked={span.bold}
                    onChange={(v) =>
                      updateLine(line.id, {
                        spans: line.spans.map((s) => (s.id === span.id ? { ...s, bold: v } : s)),
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <AddButton
              label="Add span"
              onClick={() =>
                updateLine(line.id, {
                  spans: [
                    ...line.spans,
                    { id: nextId('span'), text: ' more text', font_size: 44, color: '#ffffff', bold: false, font_family: defaultFont },
                  ],
                })
              }
            />
          </div>
        </div>
      ))}
      <AddButton label="Add text line" onClick={addLine} />
    </div>
  );
}
