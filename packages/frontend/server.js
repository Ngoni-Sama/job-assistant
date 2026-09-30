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

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port, () => {
    console.log(`VacancyPal ready on port ${port}`);
  });
});
