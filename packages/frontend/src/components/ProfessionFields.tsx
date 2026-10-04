"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { Profile } from "@/lib/types";

/** A candidate has ONE main profession plus up to this many other roles. */
export const MAX_OTHER_ROLES = 5;

/** Suggestions only — candidates can type anything. */
const COMMON_ROLES = [
  "Accountant",
  "Administrator",
  "Bookkeeper",
  "Call Centre Agent",
  "Civil Engineer",
  "Customer Service Representative",
  "Data Analyst",
  "Driver",
  "Electrician",
  "Finance Manager",
  "Graduate Trainee",
  "HR Officer",
  "IT Technician",
  "Lab Technician",
  "Marketing Officer",
  "Mechanic",
  "Pharmacist",
  "Procurement Officer",
  "Project Manager",
  "Receptionist",
  "Registered Nurse",
  "Sales Representative",
  "Security Officer",
  "Software Developer",
  "Teacher",
];

/**
 * Main profession (the one role you're known for) and up to five other roles
 * you'd also take. Used for the profile badge, employer search and job alerts.
 */
export function ProfessionFields({
  profile,
  save,
}: {
  profile: Profile | null;
  save: (patch: Partial<Profile>) => void;
}) {
  const [main, setMain] = useState<string | null>(null); // null = not edited yet
  const [draft, setDraft] = useState("");
  const others = profile?.otherRoles ?? [];
  const mainValue = main ?? profile?.mainProfession ?? "";
  const full = others.length >= MAX_OTHER_ROLES;

  function commitMain() {
    const value = mainValue.replace(/\s+/g, " ").trim();
    if (value !== (profile?.mainProfession ?? "")) save({ mainProfession: value });
    setMain(null);
  }

  function addRole() {
    const value = draft.replace(/\s+/g, " ").trim();
    setDraft("");
    if (!value || full) return;
    const exists = [profile?.mainProfession ?? "", ...others].some((r) => r.toLowerCase() === value.toLowerCase());
    if (!exists) save({ otherRoles: [...others, value] });
  }

  return (
    <div className="mt-4 space-y-4">
      <datalist id="common-roles">
        {COMMON_ROLES.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <div>
        <label htmlFor="main-profession" className="text-xs font-medium text-gray-500">
          Main profession
        </label>
        <input
          id="main-profession"
          list="common-roles"
          value={mainValue}
          onChange={(e) => setMain(e.target.value)}
          onBlur={commitMain}
          onKeyDown={(e) => e.key === "Enter" && commitMain()}
          maxLength={60}
          placeholder="e.g. Registered Nurse"
          className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <p className="mt-1 text-xs text-gray-400">
          The one role you&apos;re known for. Employers see it as a badge and can filter by it, and you hear about
          matching jobs first.
        </p>
      </div>

      <div>
        <label htmlFor="other-roles" className="text-xs font-medium text-gray-500">
          Other roles you&apos;d take{" "}
          <span className="text-brand-600">
            ({others.length}/{MAX_OTHER_ROLES})
          </span>
        </label>
        {others.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {others.map((r) => (
              <span key={r} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">
                {r}
                <button
                  type="button"
                  onClick={() => save({ otherRoles: others.filter((x) => x !== r) })}
                  aria-label={`Remove ${r}`}
                  className="rounded-full hover:bg-brand-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-1.5 flex gap-2">
          <input
            id="other-roles"
            list="common-roles"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRole();
              }
            }}
            disabled={full}
            maxLength={60}
            placeholder={full ? "Remove one to add another" : "e.g. Bookkeeper"}
            className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-50"
          />
          <button
            type="button"
            onClick={addRole}
            disabled={full || !draft.trim()}
            className="rounded-md border px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
