/**
 * Digital Asset Links for the VacancyPal Android app (served at
 * /.well-known/assetlinks.json via a rewrite in next.config.mjs). Proves the app
 * and the website belong together, so the app opens full-screen with no
 * browser address bar.
 *
 * Override on the server with ANDROID_PACKAGE_NAME / ANDROID_SHA256_CERT_FINGERPRINTS
 * (comma-separated) if the signing keys ever change.
 */

const PACKAGE = "zw.co.vacancypal.app";

/** Upload key (ours) + app signing key (Google Play's). Both must be listed. */
const FINGERPRINTS: string[] = [
  // Upload key — vacancypal-android/keys/vacancypal-upload.jks
  "8A:46:55:AA:1F:80:67:1D:13:04:55:DD:48:E8:1C:44:32:B9:7A:05:09:0F:A1:8C:3E:54:5F:09:7D:58:F6:F3",
  // App signing key (Google Play) — added once Play Console shows it
];

export const dynamic = "force-dynamic"; // read the server settings at request time

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME?.trim() || PACKAGE;
  const fromEnv = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
  const fingerprints = fromEnv.length ? fromEnv : FINGERPRINTS;
  return Response.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fingerprints },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
