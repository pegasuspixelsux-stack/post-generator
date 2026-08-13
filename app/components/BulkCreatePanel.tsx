'use client';

import { useRef, useState } from 'react';
import { RichLine } from '../lib/types';
import { uploadImage } from '../lib/upload';
import { SelectField } from './fields';

function parseLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

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
  onGenerate: (images: string[], texts: string[], targetLine: number, targetSpan: number) => void;
}) {
  const [imagesText, setImagesText] = useState('');
  const [textsText, setTextsText] = useState('');
  const [target, setTarget] = useState('0:0');
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);

  const targetOptions = richLines.flatMap((line, li) =>
    line.spans.map((span, si) => ({
      value: `${li}:${si}`,
      label: `Line ${li + 1} · Span ${si + 1}: "${span.text.slice(0, 24)}"`,
    })),
  );

  const images = parseLines(imagesText);
  const texts = parseLines(textsText);

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
    if (images.length === 0 && texts.length === 0) {
      setLocalError('Add at least one image URL or one line of text.');
      return;
    }
    if (targetOptions.length > 0 && texts.length > 0) {
      const [li, si] = target.split(':').map(Number);
      onGenerate(images, texts, li, si);
    } else {
      onGenerate(images, texts, 0, 0);
    }
  };

  return (
    <div className="flex flex-col gap-3 border border-zinc-800 rounded p-3">
      <p className="text-xs text-zinc-500">
        Uses the current form above as the template. Provide images and/or a line of text per
        graphic — they&rsquo;re paired by order to produce one output per row, all zipped together.
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

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Text lines (one per graphic)</span>
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
          placeholder={'Almuerzo Lunes\nAlmuerzo Martes\nAlmuerzo Miércoles'}
          value={textsText}
          onChange={(e) => setTextsText(e.target.value)}
        />
      </div>

      {targetOptions.length > 0 && (
        <SelectField
          label="Replace text in"
          value={target}
          options={targetOptions}
          onChange={setTarget}
        />
      )}

      <div className="text-xs text-zinc-500">
        {images.length} image{images.length === 1 ? '' : 's'} · {texts.length} text line
        {texts.length === 1 ? '' : 's'} → {Math.max(images.length, texts.length)} graphic
        {Math.max(images.length, texts.length) === 1 ? '' : 's'}
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
