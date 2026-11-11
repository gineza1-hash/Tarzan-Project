param(
  [string]$OutputDirectory = ".\backups"
)


$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set. Load it in the environment without putting it in this script."
}


New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path $OutputDirectory "tarzan-$stamp.dump"
& pg_dump --format=custom --no-owner --file=$output $env:DATABASE_URL
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE."
}
Write-Output "Backup created: $output"