#!/usr/bin/env bash
# Build + restart VacancyPal (Next.js frontend) on nivacity — cPanel "Setup Node.js App".
#
# Layout on the server:  ~/vacancypal            ← git clone of the repo (monorepo)
#                        ~/vacancypal/packages/frontend  ← cPanel "Application root"
#
# Run from packages/frontend:
#   bash deploy.sh              # pull, install, build, restart
#   bash deploy.sh --no-build   # use the prebuilt vacancypal-next.tar.gz from git (recommended)
#
# CloudLinux caps processes/threads (NPROC), which can kill `next build` with
# EAGAIN/SIGABRT. If that happens, build locally with scripts/pack-nivacity.ps1,
# upload the .next tarball, and run with --no-build.
set -euo pipefail

BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
  esac
done

cd "$(dirname "$0")"
echo "==> VacancyPal deploy starting ($(date))"

# Auto-activate the cPanel Node virtualenv when npm isn't on PATH.
if ! command -v npm >/dev/null 2>&1; then
  for act in "$HOME"/nodevenv/vacancypal/packages/frontend/*/bin/activate "$HOME"/nodevenv/*/*/bin/activate; do
    if [ -f "$act" ]; then
      echo "==> activating Node virtualenv: $act"
      set +u
      # shellcheck disable=SC1090
      source "$act"
      set -u
      break
    fi
  done
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm not found. Copy the 'Enter to the virtual environment' command from cPanel first." >&2
  exit 1
fi

if [ -d ../../.git ]; then
  echo "==> git pull (fast-forward only)"
  (cd ../.. && git pull --ff-only) || echo "   (skipped: not a fast-forward / no remote)"
fi

if [ ! -f .env.production ] && [ -z "${AUTH_SECRET:-}" ]; then
  echo "WARNING: no .env.production and AUTH_SECRET not set — sign-in will fail." >&2
  echo "         Copy .env.example → .env.production and fill it in, or set vars in cPanel." >&2
fi

# This is an npm workspace: install ONLY the frontend's deps (from the repo
# root, using the lockfile) — skips the backend's heavy wrangler/workerd.
# cPanel sets NODE_ENV=production, which skips devDependencies — the build needs them.
echo "==> installing frontend dependencies (incl. dev)"
(cd ../.. && npm install --include=dev --workspace=packages/frontend)

if [ "$BUILD" = "1" ]; then
  echo "==> building Next.js (thread-limited for CloudLinux LVE)"
  export UV_THREADPOOL_SIZE=1
  export NODE_OPTIONS="--max-old-space-size=768 --v8-pool-size=0"
  export LOW_RESOURCE_BUILD=1
  npm run build
  unset NODE_OPTIONS LOW_RESOURCE_BUILD
else
  # The build is made on Windows (scripts/pack-nivacity.ps1) and shipped through
  # git as vacancypal-next.tar.gz — unpack the freshly pulled one.
  if [ -f vacancypal-next.tar.gz ]; then
    echo "==> unpacking prebuilt vacancypal-next.tar.gz"
    rm -rf .next
    tar -xzf vacancypal-next.tar.gz
  fi
  echo "==> skipping build (--no-build); using prebuilt .next"
  if [ ! -d .next ]; then
    echo "ERROR: --no-build but no .next directory. Upload a locally-built .next first." >&2
    exit 1
  fi
fi

# A default cPanel index.html in the domain's public_html shadows the Node app.
for f in "$HOME"/domains/vacancypal.co.zw/public_html/index.html "$HOME"/public_html/vacancypal.co.zw/index.html; do
  if [ -f "$f" ]; then
    echo "WARNING: $f exists and will shadow the app — rename or delete it."
  fi
done

echo "==> triggering Passenger restart"
mkdir -p tmp && touch tmp/restart.txt
echo "==> done. If it didn't restart, click Restart in the cPanel Node.js App screen."
