import type { Env, StoredCV } from "../../types";
import { cleanCvMarkdown } from "../cvclean";

/**
 * Converts an uploaded CV to Markdown using Workers AI's document conversion
 * (`env.AI.toMarkdown`), which natively handles PDF and common doc formats.
 * Falls back to storing an empty markdown body if conversion is unavailable.
 */
export async function processCV(
  file: File,
  env: Env,
  userId: string,
): Promise<StoredCV> {
  const buffer = await file.arrayBuffer();
  const id = `cv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const key = `cvs/${userId}/${id}-${sanitize(file.name)}`;

  // Persist the raw upload to R2 when the bucket is bound (R2 is optional).
  if (env.CV_BUCKET) {
    await env.CV_BUCKET.put(key, buffer, {
      httpMetadata: { contentType: file.type || "application/pdf" },
    });
  }

  let markdown = "";
  try {
    const results = await env.AI.toMarkdown([
      {
        name: file.name,
        blob: new Blob([buffer], { type: file.type || "application/pdf" }),
      },
    ]);
    const first = results?.[0];
    markdown = first && "data" in first ? first.data : "";
  } catch (err) {
    console.error("toMarkdown failed", err);
  }

  markdown = cleanCvMarkdown(markdown);

  const stored: StoredCV = {
    id,
    key,
    fileName: file.name,
    markdown,
    uploadedAt: new Date().toISOString(),
  };

  // Append to the user's CV list and make the new upload the active/primary CV.
  const list = (await env.JOBS_CACHE.get<StoredCV[]>(`cvs:${userId}`, "json")) ?? [];
  list.push(stored);
  await env.JOBS_CACHE.put(`cvs:${userId}`, JSON.stringify(list));
  await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(stored));

  // Keep the ORIGINAL uploaded file (base64) — per-CV and as the primary.
  const fileRec = JSON.stringify({
    name: file.name,
    type: file.type || "application/octet-stream",
    data: toBase64(buffer),
  });
  await env.JOBS_CACHE.put(`cvfile:${userId}:${id}`, fileRec);
  await env.JOBS_CACHE.put(`cvfile:${userId}`, fileRec);
  return stored;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
