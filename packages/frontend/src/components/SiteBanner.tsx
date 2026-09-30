"use client";

import { useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { api } from "@/lib/api";

/** Site-wide maintenance notice, toggled from Admin → Site. */
export function SiteBanner() {
  const [on, setOn] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    api
      .getSite()
      .then((s) => {
        setOn(s.site.maintenanceMode);
        setEmail(s.site.supportEmail);
      })
      .catch(() => {});
  }, []);

  if (!on) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      <Wrench className="h-4 w-4 shrink-0" />
      <span>
        We’re doing some maintenance — a few features may be unavailable for a short while.
        {email && (
          <>
            {" "}Questions? <a href={`mailto:${email}`} className="underline">{email}</a>
          </>
        )}
      </span>
    </div>
  );
}
