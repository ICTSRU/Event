# SRU Event Attendance & Management Platform - one-step update (v4.7)
# Uploads ALL files in apps-script/ to the Apps Script project and updates BOTH deployments
# (A = visitors "Anyone", B = admin console "Anyone within Sulaiman Al Rajhi University").
# Needs Node.js LTS. Uses Google's official clasp tool (pinned version).
$ErrorActionPreference = 'Stop'
$PUBLIC_ID = 'AKfycbwA4OA3paT4lDZ3T953kYuUyOCwwtU7ZZJDSMTcKztg19rfFtJNKmONZfxgFMvVpYCr'   # deployment A (Anyone)
$SECURE_ID = 'AKfycbz60Cf78S2Sr-kqqNytnZ51T4d-KA9jOjfLi05juL3gkk7K8-LDdbdSPSWmpkz78Y5x'   # deployment B (SRU only)

function clasp { & npx --yes '@google/clasp@2.4.2' @args; if ($LASTEXITCODE -ne 0) { throw "clasp $args failed" } }

$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'apps-script'
$ver  = (Select-String -Path (Join-Path $src 'Code.gs') -Pattern "APP_VERSION = '([\d.]+)'").Matches[0].Groups[1].Value
Write-Host "== SRU Events platform v$ver ==" -ForegroundColor Magenta

# 1) Sign in to Google once (opens the browser - use your @sr.edu.sa account)
if (-not (Test-Path (Join-Path $env:USERPROFILE '.clasprc.json'))) { clasp login }

# 2) Script ID - asked once, then remembered on this computer
$idFile = Join-Path $env:USERPROFILE '.sru-event-script-id'
if (-not (Test-Path $idFile)) {
  $id = Read-Host 'Script ID (Apps Script > Project Settings > IDs > Script ID)'
  Set-Content -Path $idFile -Value $id.Trim()
}
$scriptId = (Get-Content $idFile -Raw).Trim()

# 3) Work on a temporary copy so the package folder stays clean
$work = Join-Path $env:TEMP 'sru-event-deploy'
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $work | Out-Null
Copy-Item (Join-Path $src '*') $work
Set-Content -Path (Join-Path $work '.clasp.json') -Value ('{"scriptId":"' + $scriptId + '","rootDir":"."}')

Push-Location $work
try {
  Write-Host '-> Uploading all files...' -ForegroundColor Cyan
  clasp push --force
  Write-Host '-> Updating deployment A (visitors - Anyone)...' -ForegroundColor Cyan
  clasp deploy --deploymentId $PUBLIC_ID --description "v$ver - visitors (Anyone)"

  Write-Host '-> Updating deployment B (admin - SRU only)...' -ForegroundColor Cyan
  Copy-Item (Join-Path $PSScriptRoot 'appsscript.domain.json') (Join-Path $work 'appsscript.json') -Force
  clasp push --force
  clasp deploy --deploymentId $SECURE_ID --description "v$ver - admin (SRU only)"

  # leave the editor with the standard manifest
  Copy-Item (Join-Path $src 'appsscript.json') (Join-Path $work 'appsscript.json') -Force
  clasp push --force
  Write-Host "Done: v$ver uploaded and both deployments updated." -ForegroundColor Green
} finally { Pop-Location }
