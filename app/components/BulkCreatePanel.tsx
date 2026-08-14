'use client';

import { useRef, useState } from 'react';
import { RichLine } from '../lib/types';
import { uploadImage } from '../lib/upload';

function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export type TargetField = [number, number]; // [lineIndex, spanIndex]

export function BulkCreatePanel({
  richLines,
  loading,
  error,
  zipUrl,
  onGenerate,
}: {
  richLines: RichLine[];
  loading: boolean;
  error: string | null;
  zipUrl: string | null;
  onGenerate: (images: string[], itemTexts: string[][], targetFields: TargetField[]) => void;
}) {
  const [imagesText, setImagesText] = useState('');
  const [textsText, setTextsText] = useState('');
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);

  const allFields: { field: TargetField; label: string }[] = richLines.flatMap((line, li) =>
    line.spans.map((span, si) => ({
      field: [li, si] as TargetField,
      label: `Line ${li + 1} · Span ${si + 1}: "${span.text.slice(0, 20)}"`,
    })),
  );
  const fieldKey = (f: TargetField) => `${f[0]}:${f[1]}`;

  // Every field is included by default — a bulk run's whole point is
  // "same logo/styles, only the text changes", so nothing is opted out
  // unless the user deliberately unchecks it.
  const [uncheckedKeys, setUncheckedKeys] = useState<Set<string>>(new Set());
  const selectedFields = allFields.filter((f) => !uncheckedKeys.has(fieldKey(f.field))).map((f) => f.field);
  const toggleField = (key: string) =>
    setUncheckedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const images = parseLines(imagesText);
  const rows = parseLines(textsText);
  // Each row is one item; when more than one field is selected, its columns
  // are "|"-delimited in field order (Line 1 Span 1 | Line 2 Span 1 | ...).
  const itemTexts = rows.map((row) => row.split('|').map((cell) => cell.trim()));

  const handleImageFiles = async (files: FileList) => {
    setUploading(true);
    setLocalError(null);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        urls.push(await uploadImage(file));
      }
      setImagesText((prev) => (prev ? `${prev}\n${urls.join('\n')}` : urls.join('\n')));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleTextFile = async (file: File) => {
    const content = await file.text();
    setTextsText((prev) => (prev ? `${prev}\n${content}` : content));
  };

  const handleSubmit = () => {
    setLocalError(null);
    if (images.length === 0 && itemTexts.length === 0) {
      setLocalError('Add at least one image URL or one line of text.');
      return;
    }
    onGenerate(images, itemTexts, selectedFields);
  };

  return (
    <div className="flex flex-col gap-3 border border-zinc-800 rounded p-3">
      <p className="text-xs text-zinc-500">
        Uses the current form above as the template — logo, images, colors, and positions stay identical for every
        item; only the text changes. Provide images and/or one row of text per graphic — rows are paired by order
        to produce one output per row, all zipped together.
      </p>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Background images (one URL per line)</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-2 py-1 rounded transition"
          >
            {uploading ? 'Uploading…' : 'Upload images'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) void handleImageFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          className="bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm h-24 font-mono"
          placeholder={'https://example.com/1.jpg\nhttps://example.com/2.jpg'}
          value={imagesText}
          onChange={(e) => setImagesText(e.target.value)}
        />
      </div>

      {allFields.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-zinc-400">Text fields to override (unchecked ones keep the preset text)</span>
          <div className="flex flex-col gap-1 bg-zinc-950 border border-zinc-800 rounded p-2">
            {allFields.map(({ field, label }) => {
              const key = fieldKey(field);
              return (
                <label key={key} className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    type="checkbox"
                    checked={!uncheckedKeys.has(key)}
                    onChange={() => toggleField(key)}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">
            Text rows (one per graphic{selectedFields.length > 1 ? `, "|"-separated per field above` : ''})
          </span>
          <button
            type="button"
            onClick={() => txtInputRef.current?.click()}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-2 py-1 rounded transition"
          >
            Upload .txt
          </button>
          <input
            ref={txtInputRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleTextFile(file);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          className="bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm h-24 font-mono"
          placeholder={
            selectedFields.length > 1
              ? 'Almuerzo Lunes|Desde $9.99\nAlmuerzo Martes|Desde $10.99'
              : 'Almuerzo Lunes\nAlmuerzo Martes\nAlmuerzo Miércoles'
          }
          value={textsText}
          onChange={(e) => setTextsText(e.target.value)}
        />
      </div>

      <div className="text-xs text-zinc-500">
        {images.length} image{images.length === 1 ? '' : 's'} · {rows.length} text row{rows.length === 1 ? '' : 's'} ·{' '}
        {selectedFields.length} field{selectedFields.length === 1 ? '' : 's'} per row →{' '}
        {Math.max(images.length, rows.length)} graphic{Math.max(images.length, rows.length) === 1 ? '' : 's'}
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-black font-bold p-3 rounded transition"
      >
        {loading ? 'Generating bulk…' : 'Generate Bulk (zip)'}
      </button>

      {(localError || error) && (
        <p className="text-red-400 text-sm border border-red-900 bg-red-950/40 rounded p-2">
          {localError || error}
        </p>
      )}

      {zipUrl && (
        <a
          href={zipUrl}
          download="bulk-graphics.zip"
          className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-semibold px-4 py-2 rounded transition text-center"
        >
          Download bulk-graphics.zip
        </a>
      )}
    </div>
  );
}
