"use client";

import { useEffect, useState } from "react";
import { FileText, RotateCcw, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { AppConfig, PromptKey } from "@/lib/types";

const TASKS: { key: PromptKey; title: string; body: string }[] = [
  {
    key: "cvWriter",
    title: "CV & cover note writer (AI Apply)",
    body: "Writes the tailored professional summary added to the top of the CV (used in the PDF/Word CV) and the cover note.",
  },
  { key: "matcher", title: "Job match scoring", body: "Scores how well a CV fits one job and lists matched / missing skills." },
  { key: "quickMatch", title: "Quick Match", body: "Picks the jobs a candidate is a strong fit for out of all listings." },
  { key: "profile", title: "Profile from CV", body: "Fills in the candidate profile (name, headline, skills…) from their CV." },
  {
    key: "atsCv",
    title: "ATS CV Creator",
    body: "Writes the headline, summary, achievement bullets and skill order for the CV Creator. Invented numbers, employers or skills are removed by the app regardless of this prompt.",
  },
];

/**
 * Admin → AI → instructions for each AI task. Only the instructions are
 * editable; the output format each task needs is added automatically, so an
 * edit can change tone and rules but can't break the app.
 */
export function AdminPrompts({
  config,
  save,
  saving,
}: {
  config: AppConfig;
  save: (patch: Partial<AppConfig>, okMsg?: string) => Promise<void>;
  saving: boolean;
}) {
  const [defaults, setDefaults] = useState<Record<PromptKey, string> | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<PromptKey, string>>>({});

  useEffect(() => {
    api
      .getDefaultPrompts()
      .then((r) => setDefaults(r.prompts))
      .catch(() => {});
  }, []);

  if (!defaults) return null;

  const current = (k: PromptKey) => drafts[k] ?? config.prompts?.[k] ?? defaults[k];

  return (
    <section className="glass space-y-4 rounded-2xl p-6">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <FileText className="h-4 w-4" /> AI instructions (system prompts)
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Change how each AI task behaves — tone, length, language, rules. The output format the app needs is added
          automatically, so you can&apos;t break anything. Uses OpenAI when a key is set above, otherwise Workers AI.
        </p>
      </div>

      {TASKS.map((t) => {
        const custom = !!config.prompts?.[t.key];
        const changed = drafts[t.key] !== undefined && drafts[t.key] !== (config.prompts?.[t.key] ?? defaults[t.key]);
        return (
          <div key={t.key} className="space-y-2 rounded-xl bg-white/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {t.title}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${custom ? "bg-accent-100 text-accent-800" : "bg-gray-100 text-gray-500"}`}>
                    {custom ? "Custom" : "Default"}
                  </span>
                </p>
                <p className="text-xs text-gray-500">{t.body}</p>
              </div>
            </div>
            <textarea
              value={current(t.key)}
              onChange={(e) => setDrafts({ ...drafts, [t.key]: e.target.value })}
              rows={4}
              maxLength={4000}
              className="input text-sm"
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  await save({ prompts: { ...config.prompts, [t.key]: current(t.key) } }, `${t.title} instructions saved.`);
                  setDrafts((d) => ({ ...d, [t.key]: undefined }));
                }}
                disabled={saving || !changed}
                className="flex items-center gap-1 rounded-full bg-brand-600 px-3 py-1.5 text-xs text-white disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" /> Save
              </button>
              {custom && (
                <button
                  onClick={async () => {
                    await save({ prompts: { ...config.prompts, [t.key]: "" } }, `${t.title} reset to default.`);
                    setDrafts((d) => ({ ...d, [t.key]: undefined }));
                  }}
                  disabled={saving}
                  className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs text-gray-600 hover:bg-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to default
                </button>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
