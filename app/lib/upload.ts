import { apiUrl } from './api';

/** Shared by uploadImage/uploadVideo — both hit the same generic backend
 * /upload endpoint, which dispatches on the file's content-type. */
async function uploadFile(file: File): Promise<string> {
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

export function uploadImage(file: File): Promise<string> {
  return uploadFile(file);
}

/** Uploads an MP4 for use as a video export's background_video_url. */
export function uploadVideo(file: File): Promise<string> {
  return uploadFile(file);
}
