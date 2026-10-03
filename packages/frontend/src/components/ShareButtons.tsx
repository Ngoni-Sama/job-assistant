"use client";

import { useEffect, useState } from "react";
import { Check, Facebook, Link2, Linkedin, Mail, Send, Share2 } from "lucide-react";

/** WhatsApp glyph (speech bubble with handset) — drawn here because the icon set has no WhatsApp. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Z" />
      <path d="M16.6 14.3c-.3-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.8-1.4.1-.2 0-.3 0-.5l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 2.9 2.9 0 0 0-.9 2.2 5 5 0 0 0 1 2.7 11.6 11.6 0 0 0 4.5 3.9c1.7.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.6-.3Z" />
    </svg>
  );
}

/** X (formerly Twitter) logo. */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.9 1.2h3.7l-8 9.2L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.2h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2H4.3l13.3 17.5Z" />
    </svg>
  );
}

/**
 * Shared links always point at the public site (also when shared from a dev or
 * preview deployment), and the server and browser render the same href.
 */
const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://vacancypal.co.zw";

/** Absolute URL for a path, tagged with where it was shared (shows up in analytics). */
function shareUrl(path: string, source?: string): string {
  const url = new URL(path, PUBLIC_ORIGIN);
  if (source) {
    url.searchParams.set("utm_source", source);
    url.searchParams.set("utm_medium", "share");
  }
  return url.toString();
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure context: fall back to a hidden textarea.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Copy the link; if the browser won't allow it, show it so they can copy it by hand. */
async function copyOrShow(url: string): Promise<boolean> {
  if (await copyText(url)) return true;
  window.prompt("Copy this link:", url);
  return false;
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, setCopied] as const;
}

const NETWORKS = [
  {
    id: "whatsapp",
    label: "WhatsApp",
    Icon: WhatsAppIcon,
    className: "bg-[#25D366] text-white",
    href: (url: string, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
  },
  {
    id: "facebook",
    label: "Facebook",
    Icon: Facebook,
    className: "bg-[#1877F2] text-white",
    href: (url: string) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    Icon: Linkedin,
    className: "bg-[#0A66C2] text-white",
    href: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
  },
  {
    id: "x",
    label: "X",
    Icon: XIcon,
    className: "bg-black text-white",
    href: (url: string, text: string) =>
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  },
  {
    id: "telegram",
    label: "Telegram",
    Icon: Send,
    className: "bg-[#229ED9] text-white",
    href: (url: string, text: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
  },
  {
    id: "email",
    label: "Email",
    Icon: Mail,
    className: "bg-gray-700 text-white",
    href: (url: string, text: string) =>
      `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
  },
];

/**
 * Share a page: WhatsApp, Facebook, LinkedIn, X, Telegram, email, the phone's
 * own share sheet (where supported) and Copy link.
 */
export function ShareButtons({ path, text, label = "Share" }: { path: string; text: string; label?: string }) {
  const [copied, setCopied] = useCopied();
  const [canNative, setCanNative] = useState(false);
  useEffect(() => setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      {NETWORKS.map(({ id, label: name, Icon, className, href }) => (
        <a
          key={id}
          href={href(shareUrl(path, id), text)}
          // Open networks in a small window (email goes to the mail app).
          onClick={(e) => {
            if (id === "email") return;
            e.preventDefault();
            window.open(href(shareUrl(path, id), text), "_blank", "noopener,noreferrer,width=640,height=560");
          }}
          target="_blank"
          rel="noopener noreferrer"
          title={`Share on ${name}`}
          aria-label={`Share on ${name}`}
          className={`flex h-9 w-9 items-center justify-center rounded-full shadow-sm transition-transform hover:scale-110 ${className}`}
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
      {canNative && (
        <button
          type="button"
          onClick={() => navigator.share({ title: text, text, url: shareUrl(path, "native") }).catch(() => {})}
          title="More ways to share"
          aria-label="More ways to share"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm transition-transform hover:scale-110"
        >
          <Share2 className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={async () => setCopied(await copyOrShow(shareUrl(path)))}
        className="flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3 py-2 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
      >
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4" />}
        <span aria-live="polite">{copied ? "Link copied" : "Copy link"}</span>
      </button>
    </div>
  );
}

/** One small button for cards: the phone's share sheet when available, otherwise copies the link. */
export function ShareIconButton({ path, text, compact = false }: { path: string; text: string; compact?: boolean }) {
  const [copied, setCopied] = useCopied();
  async function share() {
    const url = shareUrl(path, "native");
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (e) {
        if ((e as Error).name === "AbortError") return; // they closed the sheet
      }
    }
    setCopied(await copyOrShow(shareUrl(path)));
  }
  return (
    <button
      type="button"
      onClick={share}
      title={copied ? "Link copied" : "Share or copy link"}
      aria-label={copied ? "Link copied" : `Share ${text}`}
      className={
        compact
          ? "-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-brand-50 hover:text-brand-700"
          : "flex items-center gap-1 rounded-full border border-white/50 bg-white/50 px-3 py-2 text-sm text-gray-700 hover:bg-white/70"
      }
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
      {!compact && <span className="sr-only sm:not-sr-only">{copied ? "Copied" : "Share"}</span>}
    </button>
  );
}
