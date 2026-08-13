'use client';

import { FontFamily, RichLine } from '../lib/types';
import { nextId } from '../lib/color';
import { AddButton, CheckboxField, ColorField, NumberField, RemoveButton, SelectField, TextField } from './fields';

const FALLBACK_FONTS: FontFamily[] = [{ id: 'Poppins', name: 'Poppins', has_bold: true }];

export function RichLinesEditor({
  lines,
  onChange,
  fonts,
}: {
  lines: RichLine[];
  onChange: (lines: RichLine[]) => void;
  fonts?: FontFamily[];
}) {
  const fontOptions = (fonts && fonts.length > 0 ? fonts : FALLBACK_FONTS).map((f) => ({
    value: f.id,
    label: f.name,
  }));
  const defaultFont = fontOptions[0]?.value ?? 'Poppins';
  const updateLine = (id: string, patch: Partial<RichLine>) => {
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLine = () => {
    onChange([
      ...lines,
      {
        id: nextId('line'),
        x: 80,
        y: 350 + lines.length * 80,
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
