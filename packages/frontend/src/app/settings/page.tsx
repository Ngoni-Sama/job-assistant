export default function SettingsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">Backend</h2>
        <p className="mt-1 text-sm text-gray-600">
          API endpoint: <code className="rounded bg-gray-100 px-1.5 py-0.5">{apiUrl}</code>
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Configure via <code>NEXT_PUBLIC_API_URL</code> in <code>.env.local</code>.
        </p>
      </div>
      <div className="rounded-lg border bg-white p-6">
        <h2 className="font-semibold">Search preferences</h2>
        <p className="mt-1 text-sm text-gray-500">
          Keyword & location preferences and user auth (NextAuth) are planned — the demo uses a
          single shared user id.
        </p>
      </div>
    </div>
  );
}
