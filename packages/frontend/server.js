// Passenger / cPanel "Setup Node.js App" startup file for nivacity (production).
// Boots Next.js in production mode on the port Passenger provides.
// Env vars come from the cPanel Node.js App UI, or a .env.production file in
// this folder (Next.js loads it automatically — never commit it).
process.chdir(__dirname);

const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

// One address for search engines and users: www.vacancypal.co.zw → vacancypal.co.zw.
// (LiteSpeed already sends http → https before requests reach this server.)
const CANONICAL_HOST = (() => {
  try {
    return new URL(process.env.APP_URL || process.env.AUTH_URL || "https://vacancypal.co.zw").host;
  } catch {
    return "vacancypal.co.zw";
  }
})();

app.prepare().then(() => {
  createServer((req, res) => {
    const host = (req.headers["x-forwarded-host"] || req.headers.host || "").toString().split(",")[0].trim().toLowerCase();
    if (host === `www.${CANONICAL_HOST}`) {
      res.writeHead(301, { Location: `https://${CANONICAL_HOST}${req.url || "/"}` });
      res.end();
      return;
    }
    // Browsers remember to use HTTPS for a year (ignored on plain http, so it's safe).
    res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    handle(req, res);
  }).listen(port, () => {
    console.log(`VacancyPal ready on port ${port}`);
  });
});
