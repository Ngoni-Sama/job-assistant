import type { Env, StoredCV } from "../../types";

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
  const key = `cvs/${userId}/${Date.now()}-${sanitize(file.name)}`;

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

  const stored: StoredCV = {
    key,
    fileName: file.name,
    markdown,
    uploadedAt: new Date().toISOString(),
  };

  // Cache the processed markdown as the user's active CV.
  await env.JOBS_CACHE.put(`cv:${userId}`, JSON.stringify(stored));
  return stored;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}
