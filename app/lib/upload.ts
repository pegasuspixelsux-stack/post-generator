const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8080';

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || 'Upload failed');
  }
  const data = await res.json();
  return data.url as string;
}
