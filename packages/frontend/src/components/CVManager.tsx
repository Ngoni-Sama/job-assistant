"use client";

import { useEffect, useState, useCallback } from "react";
import { FileText, Star, Pencil, Trash2, Check, X, Save } from "lucide-react";
import { api } from "@/lib/api";
import type { StoredCV } from "@/lib/types";
import { RichCVEditor } from "./RichCVEditor";

/**
 * Lists the user's uploaded CVs and lets them set a primary, rename, edit the
 * extracted markdown, or delete. `refreshKey` bumps to re-fetch after an upload.
 */
export function CVManager({ refreshKey }: { refreshKey?: number }) {
  const [cvs, setCvs] = useState<StoredCV[]>([]);
  const [primaryId, setPrimaryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  // rename + edit modal state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editing, setEditing] = useState<StoredCV | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .getCvs()
      .then((r) => {
        setCvs(r.cvs);
        setPrimaryId(r.primaryId);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function setPrimary(id: string) {
    setBusyId(id);
    try {
      const r = await api.setPrimaryCv(id);
      setCvs(r.cvs);
      setPrimaryId(r.primaryId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveRename(id: string) {
    const name = renameValue.trim();
    if (!name) return setRenamingId(null);
    setBusyId(id);
    try {
      const r = await api.renameCv(id, name);
      setCvs(r.cvs);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
      setRenamingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this CV? This can’t be undone.")) return;
    setBusyId(id);
    try {
      await api.deleteCv(id);
      load(); // re-fetch so the primary badge reflects the server's re-pointing
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await api.updateCv(editing.id, editValue);
      setCvs(r.cvs);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="glass rounded-2xl p-6 text-sm text-gray-500">Loading your CVs…</div>;
  }
  if (cvs.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Your CVs</h2>
        <span className="text-xs text-gray-500">{cvs.length} saved</span>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {cvs.map((cv) => {
          const isPrimary = cv.id === primaryId;
          const busy = busyId === cv.id;
          return (
            <div key={cv.id} className="glass flex flex-wrap items-center gap-3 rounded-xl p-3">
              <FileText className="h-5 w-5 shrink-0 text-brand-600" />

              {renamingId === cv.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRename(cv.id)}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button onClick={() => saveRename(cv.id)} className="text-green-600" title="Save">
                    <Check className="h-4 w-4" />
                  </button>
                  <button onClick={() => setRenamingId(null)} className="text-gray-400" title="Cancel">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {cv.fileName}
                    {isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Primary
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(cv.uploadedAt).toLocaleDateString()} · {cv.markdown.length.toLocaleString()} chars
                  </p>
                </div>
              )}

              <div className="ml-auto flex shrink-0 items-center gap-1">
                {!isPrimary && (
                  <button
                    onClick={() => setPrimary(cv.id)}
                    disabled={busy}
                    title="Make primary"
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-white/60 hover:text-amber-600 disabled:opacity-50"
                  >
                    <Star className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => {
                    setRenamingId(cv.id);
                    setRenameValue(cv.fileName);
                  }}
                  title="Rename"
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-white/60 hover:text-brand-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setEditing(cv);
                    setEditValue(cv.markdown);
                  }}
                  title="Edit content"
                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-white/60 hover:text-brand-600"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(cv.id)}
                  disabled={busy}
                  title="Delete"
                  className="rounded-lg p-1.5 text-gray-500 hover:bg-white/60 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal — markdown editor for the extracted CV */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="glass-strong flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="truncate font-semibold">Edit — {editing.fileName}</h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <RichCVEditor initialMarkdown={editing.markdown} onChange={setEditValue} />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-full px-4 py-2 text-sm text-gray-600 hover:bg-white/60"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
