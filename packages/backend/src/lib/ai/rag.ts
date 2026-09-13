import type { Env } from "../../types";
import { chat } from "./provider";

// Cloudflare Workers AI text-embedding model (768-dim).
const EMB_MODEL = "@cf/baai/bge-base-en-v1.5";
const MAX_DOC_CHARS = 1600; // cap text sent to the embedder per candidate

export interface RagDoc {
  id: string;
  name: string;
  headline?: string;
  sector?: string;
  location?: string;
  skills?: string[];
  source: "platform" | "mine";
  text: string;
}

export interface RagMatch extends Omit<RagDoc, "text"> {
  score: number; // 0..1 relevance
  reason: string;
  locked: boolean; // platform candidates hide contact until unlocked
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const res = (await env.AI.run(EMB_MODEL, { text: texts })) as { data?: number[][] };
  return res.data ?? [];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

/** Vector for a doc, cached in KV (invalidated when its text length changes). */
async function vectorFor(env: Env, doc: RagDoc, cache: Map<string, number[]>): Promise<number[] | null> {
  const key = `emb:${doc.id}:${doc.text.length}`;
  const hit = await env.JOBS_CACHE.get<number[]>(key, "json");
  if (hit) return hit;
  cache.set(doc.id, []); // placeholder — filled by the batch embed
  return null;
}

/**
 * Retrieve-and-generate over candidate docs: embed the query + any uncached
 * candidate docs (one batched call), rank by cosine similarity, then ask the LLM
 * for a short per-candidate fit reason. Purely additive — no external vector DB.
 */
export async function rankCandidates(
  env: Env,
  query: string,
  docs: RagDoc[],
  topK: number,
): Promise<{ answer: string; matches: RagMatch[] }> {
  if (!docs.length) return { answer: "No candidates match those filters yet.", matches: [] };

  // 1) resolve/refresh embeddings (batch the uncached ones in a single call)
  const vecById = new Map<string, number[]>();
  const uncached: RagDoc[] = [];
  for (const d of docs) {
    const key = `emb:${d.id}:${d.text.length}`;
    const hit = await env.JOBS_CACHE.get<number[]>(key, "json");
    if (hit) vecById.set(d.id, hit);
    else uncached.push(d);
  }
  if (uncached.length) {
    const vecs = await embed(env, uncached.map((d) => d.text.slice(0, MAX_DOC_CHARS)));
    await Promise.all(
      uncached.map(async (d, i) => {
        const v = vecs[i];
        if (v && v.length) {
          vecById.set(d.id, v);
          await env.JOBS_CACHE.put(`emb:${d.id}:${d.text.length}`, JSON.stringify(v), {
            expirationTtl: 60 * 60 * 24 * 30,
          });
        }
      }),
    );
  }

  // 2) rank by cosine to the query embedding
  const [qVec] = await embed(env, [query.slice(0, 512)]);
  if (!qVec) return { answer: "Couldn’t process that query — try again.", matches: [] };
  const ranked = docs
    .map((d) => ({ d, score: cosine(qVec, vecById.get(d.id) ?? []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // 3) generate concise fit reasons for the top candidates
  const reasons = await explainMatches(env, query, ranked.map((r) => r.d));

  const matches: RagMatch[] = ranked.map(({ d, score }) => ({
    id: d.id,
    name: d.name,
    headline: d.headline,
    sector: d.sector,
    location: d.location,
    skills: d.skills,
    source: d.source,
    score: Math.round(Math.max(0, Math.min(1, score)) * 100) / 100,
    reason: reasons.byId[d.id] ?? "Relevant to your query.",
    locked: d.source === "platform",
  }));

  const answer =
    reasons.summary ||
    `Found ${matches.length} candidate${matches.length === 1 ? "" : "s"} ranked by fit for “${query}”.`;
  return { answer, matches };
}

async function explainMatches(
  env: Env,
  query: string,
  docs: RagDoc[],
): Promise<{ summary: string; byId: Record<string, string> }> {
  const list = docs
    .slice(0, 8)
    .map(
      (d, i) =>
        `${i + 1}. id=${d.id} | ${d.name} — ${d.headline ?? ""} | skills: ${(d.skills ?? []).join(", ")} | ${d.text.slice(0, 300)}`,
    )
    .join("\n");
  const prompt = [
    {
      role: "system" as const,
      content:
        'You are a recruiting assistant. Given a role query and candidate summaries, write one concise sentence per candidate on why they fit (or only partially fit) the role. Return ONLY minified JSON: {"summary":"one line overview","candidates":[{"id":"<id>","reason":"<one sentence>"}]}.',
    },
    { role: "user" as const, content: `Role query: ${query}\n\nCandidates:\n${list}` },
  ];
  try {
    const raw = await chat(env, prompt, 600);
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { summary?: string; candidates?: { id: string; reason: string }[] };
    const byId: Record<string, string> = {};
    for (const c of parsed.candidates ?? []) if (c.id) byId[c.id] = c.reason;
    return { summary: parsed.summary ?? "", byId };
  } catch {
    return { summary: "", byId: {} };
  }
}
