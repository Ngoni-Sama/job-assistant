import { jsonLdString } from "@/lib/seo";

/** Structured data (schema.org) for search engines. Server-rendered into the page HTML. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
