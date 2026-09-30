# Build the VacancyPal frontend LOCALLY for nivacity and pack .next into a tarball.
# Use when `next build` dies on the server (CloudLinux NPROC limits).
#
#   powershell -File scripts\pack-nivacity.ps1
#
# Requires packages\frontend\.env.production (NEXT_PUBLIC_API_URL is baked in at
# build time, so it must point at the PRODUCTION Worker). Then upload
# vacancypal-next.tar.gz to ~/vacancypal/packages/frontend/, and on the server:
#   tar -xzf vacancypal-next.tar.gz && bash deploy.sh --no-build
$ErrorActionPreference = "Stop"
$fe = Join-Path $PSScriptRoot "..\packages\frontend" | Resolve-Path
Push-Location $fe
try {
  if (-not (Test-Path ".env.production")) {
    throw "packages\frontend\.env.production is missing (copy .env.example and fill in prod values)."
  }
  $api = (Select-String -Path ".env.production" -Pattern '^NEXT_PUBLIC_API_URL=(.+)$').Matches.Groups[1].Value
  Write-Host "==> Building with NEXT_PUBLIC_API_URL=$api"
  $env:NODE_ENV = "production"
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "next build failed" }
  if (Test-Path "vacancypal-next.tar.gz") { Remove-Item "vacancypal-next.tar.gz" }
  tar -czf vacancypal-next.tar.gz --exclude=.next/cache .next
  Write-Host "==> Wrote $fe\vacancypal-next.tar.gz — upload it to ~/vacancypal/packages/frontend/"
} finally {
  Pop-Location
}
