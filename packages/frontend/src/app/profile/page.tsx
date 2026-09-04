"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import {
  Wand2,
  MapPin,
  Briefcase,
  GraduationCap,
  Languages,
  Lock,
  BadgeCheck,
  Radar,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Availability, Profile } from "@/lib/types";

const AVAIL_BADGE: Record<Availability, { label: string; cls: string }> = {
  looking: { label: "Actively looking", cls: "bg-green-100 text-green-700" },
  open: { label: "Open to offers", cls: "bg-amber-100 text-amber-700" },
  not_looking: { label: "Not looking", cls: "bg-gray-100 text-gray-500" },
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const authed = status === "authenticated";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filling, setFilling] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "loading") return;
    if (!authed) {
      setLoading(false);
      return;
    }
    api
      .getProfile()
      .then((r) => setProfile(r.profile))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [status, authed]);

  async function autofill() {
    setFilling(true);
    setError("");
    try {
      const { profile } = await api.autofillProfile();
      setProfile(profile);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFilling(false);
    }
  }

  if (!authed && status !== "loading") {
    return (
      <div className="glass mx-auto max-w-md rounded-2xl p-8 text-center">
        <Lock className="mx-auto h-8 w-8 text-brand-600" />
        <h1 className="mt-2 text-xl font-bold">Your profile</h1>
        <p className="mt-1 text-gray-600">Sign in to build your professional profile.</p>
        <button
          onClick={() => signIn("google")}
          className="mt-4 rounded-full bg-brand-600 px-4 py-2 text-sm text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (loading || !profile) return <p className="text-gray-500">Loading…</p>;

  const avail = AVAIL_BADGE[profile.availability];
  const name = profile.name || session?.user?.name || "Your name";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <button
          onClick={autofill}
          disabled={filling}
          className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-600 to-violet-600 px-4 py-2 text-sm text-white shadow-md disabled:opacity-60"
        >
          <Wand2 className={`h-4 w-4 ${filling ? "animate-pulse" : ""}`} />
          {filling ? "Reading your CV…" : "Auto-fill from CV"}
        </button>
      </div>

      {error && <div className="rounded-2xl bg-red-50/80 p-3 text-sm text-red-700">{error}</div>}

      {/* Resume card */}
      <div className="glass-strong overflow-hidden rounded-3xl">
        <div className="flex items-center gap-4 bg-gradient-to-r from-brand-600 to-violet-600 p-6 text-white">
          {session?.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-20 w-20 rounded-full border-4 border-white/40"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
              {name.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-2xl font-extrabold">{name}</h2>
            <p className="truncate text-white/90">{profile.headline || "Add a headline"}</p>
            <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${avail.cls}`}>
              <BadgeCheck className="h-3 w-3" /> {avail.label}
            </span>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <Field icon={Radar} label="Sector" value={profile.sector} />
          <Field icon={MapPin} label="Location" value={profile.location} />
          <Field
            icon={Briefcase}
            label="Experience"
            value={profile.yearsExperience ? `${profile.yearsExperience} years` : undefined}
          />
          <Field icon={GraduationCap} label="Education" value={profile.education} />
          <Field
            icon={Languages}
            label="Languages"
            value={profile.languages?.length ? profile.languages.join(", ") : undefined}
          />
        </div>

        {profile.skills && profile.skills.length > 0 && (
          <div className="border-t border-white/40 p-6">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Skills</p>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((s) => (
                <span key={s} className="rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-center text-xs text-gray-400">
        Set availability and headline in <a href="/settings" className="underline">Settings</a>. Your
        Google photo is used as your avatar.
      </p>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value?: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-sm text-gray-700">{value || <span className="text-gray-400">—</span>}</p>
      </div>
    </div>
  );
}
