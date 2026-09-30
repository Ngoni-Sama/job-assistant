# Build the VacancyPal frontend LOCALLY for nivacity and pack .next into a tarball.
# Use this instead of building on the server (CloudLinux NPROC limits kill next build).
#
#   powershell -ExecutionPolicy Bypass -File scripts\pack-nivacity.ps1
#
# Requires packages\frontend\.env.production. NEXT_PUBLIC_* values are baked in at
# build time, and Next.js lets .env.local (dev values) override .env.production,
# so this script exports the production NEXT_PUBLIC_* values explicitly.
# Then upload vacancypal-next.tar.gz to ~/vacancypal/packages/frontend/ and run:
#   tar -xzf vacancypal-next.tar.gz && bash deploy.sh --no-build
$ErrorActionPreference = "Stop"
$fe = Join-Path $PSScriptRoot "..\packages\frontend" | Resolve-Path
Push-Location $fe
try {
  if (-not (Test-Path ".env.production")) {
    throw "packages\frontend\.env.production is missing (copy .env.example and fill in prod values)."
  }

  # Export production NEXT_PUBLIC_* so they win over .env.local.
  Get-Content ".env.production" | Where-Object { $_ -match '^(NEXT_PUBLIC_[A-Z0-9_]+)=(.*)$' } | ForEach-Object {
    Set-Item -Path ("Env:" + $Matches[1]) -Value $Matches[2]
    Write-Host ("==> " + $Matches[1] + "=" + $Matches[2])
  }
  if (-not $env:NEXT_PUBLIC_API_URL) { throw "NEXT_PUBLIC_API_URL missing from .env.production" }

  # Clean build: drop dev-server output (.next/dev) and caches.
  if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force }
  $env:NODE_ENV = "production"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "next build failed" }

  # Guard: the production API URL must be what got baked into the client bundle.
  $baked = Get-ChildItem ".next\static" -Recurse -Filter *.js | Select-String -SimpleMatch $env:NEXT_PUBLIC_API_URL -List | Select-Object -First 1
  if (-not $baked) { throw "Build does not contain $env:NEXT_PUBLIC_API_URL - refusing to pack." }

  if (Test-Path "vacancypal-next.tar.gz") { Remove-Item "vacancypal-next.tar.gz" }
  tar -czf vacancypal-next.tar.gz --exclude=".next/cache" --exclude=".next/dev" .next
  $mb = [math]::Round((Get-Item "vacancypal-next.tar.gz").Length / 1MB, 1)
  Write-Host "==> Wrote $fe\vacancypal-next.tar.gz ($mb MB) - upload it to ~/vacancypal/packages/frontend/"
} finally {
  Remove-Item Env:NEXT_PUBLIC_API_URL -ErrorAction SilentlyContinue
  Pop-Location
}
