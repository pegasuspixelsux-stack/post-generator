'use client';

import { useRef, useState } from 'react';
import { uploadImage } from '../lib/upload';

export function ImageUrlField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const url = await uploadImage(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-sm text-zinc-400">{label}</span>}
      <div className="flex gap-2">
        <input
          className="bg-zinc-900 border border-zinc-800 p-2 rounded w-full text-sm"
          value={value}
          placeholder={placeholder ?? 'Image URL'}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 text-sm bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-3 rounded transition"
        >
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
