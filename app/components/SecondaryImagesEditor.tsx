'use client';

import { ImageBlock } from '../lib/types';
import { nextId } from '../lib/color';
import { AddButton, NumberField, RemoveButton } from './fields';
import { ImageUrlField } from './ImageUrlField';

export function SecondaryImagesEditor({
  images,
  onChange,
}: {
  images: ImageBlock[];
  onChange: (images: ImageBlock[]) => void;
}) {
  const update = (id: string, patch: Partial<ImageBlock>) => {
    onChange(images.map((img) => (img.id === id ? { ...img, ...patch } : img)));
  };

  const add = () => {
    onChange([...images, { id: nextId('img'), url: '', x: 100, y: 600, width: 300, height: 300 }]);
  };

  const remove = (id: string) => onChange(images.filter((img) => img.id !== id));

  return (
    <div className="flex flex-col gap-3">
      {images.map((img, idx) => (
        <div key={img.id} className="border border-zinc-800 rounded p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wide text-zinc-500">Image {idx + 1}</span>
            <RemoveButton onClick={() => remove(img.id)} />
          </div>
          <ImageUrlField
            value={img.url}
            placeholder="Image URL"
            onChange={(v) => update(img.id, { url: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Width" value={img.width} onChange={(v) => update(img.id, { width: v })} />
            <NumberField label="Height" value={img.height} onChange={(v) => update(img.id, { height: v })} />
            <NumberField label="X" value={img.x} onChange={(v) => update(img.id, { x: v })} />
            <NumberField label="Y" value={img.y} onChange={(v) => update(img.id, { y: v })} />
          </div>
        </div>
      ))}
      <AddButton label="Add secondary image" onClick={add} />
    </div>
  );
}
