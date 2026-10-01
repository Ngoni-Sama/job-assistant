/** Shared, readable layout for the Privacy Policy and Terms pages. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="glass mx-auto max-w-3xl space-y-6 rounded-3xl p-6 text-gray-700 sm:p-10">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-500">Last updated: {updated}</p>
      </header>
      {children}
    </article>
  );
}

export function H({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-2 text-lg font-bold text-gray-900">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="leading-relaxed">{children}</p>;
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 leading-relaxed">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
