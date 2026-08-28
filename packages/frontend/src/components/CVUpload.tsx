"use client";

import { useState } from "react";
import { Upload, FileText, Check, AlertCircle } from "lucide-react";
import { api } from "@/lib/api";

type Status = "idle" | "processing" | "complete" | "error";

export function CVUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleUpload() {
    if (!file) return;
    setStatus("processing");
    setMessage("");
    try {
      const { cv } = await api.uploadCV(file);
      setStatus("complete");
      setMessage(`Extracted ${cv.markdown.length.toLocaleString()} characters of CV text.`);
    } catch (err) {
      setStatus("error");
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 text-center">
      {(status === "idle" || status === "error") && (
        <>
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium">Upload your CV</h3>
          <p className="mt-1 text-sm text-gray-500">PDF, DOCX, or images — we convert it to Markdown.</p>
          <input
            id="cv-upload"
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="cv-upload"
            className="mt-4 inline-block cursor-pointer rounded-md bg-brand-600 px-4 py-2 text-white hover:bg-brand-700"
          >
            Choose file
          </label>
          {file && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              {file.name}
              <button
                onClick={handleUpload}
                className="rounded-md bg-green-600 px-4 py-1 text-white hover:bg-green-700"
              >
                Upload & Process
              </button>
            </div>
          )}
          {status === "error" && (
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" /> {message}
            </p>
          )}
        </>
      )}

      {status === "processing" && (
        <div>
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-brand-600" />
          <p className="mt-4 text-gray-600">Processing your CV…</p>
          <p className="text-sm text-gray-400">Converting to Markdown and extracting skills</p>
        </div>
      )}

      {status === "complete" && (
        <div>
          <Check className="mx-auto h-12 w-12 text-green-500" />
          <h3 className="mt-4 text-lg font-medium text-green-600">CV processed!</h3>
          <p className="mt-1 text-sm text-gray-500">{message}</p>
          <a href="/dashboard" className="mt-4 inline-block text-brand-600 underline">
            Go to dashboard →
          </a>
        </div>
      )}
    </div>
  );
}
