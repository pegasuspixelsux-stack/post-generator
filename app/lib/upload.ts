import { apiUrl } from './api';

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(apiUrl('/upload'), { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Upload failed');
  }
  const data = await res.json();
  return data.url as string;
}
