param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile
)

$ErrorActionPreference = "Stop"
if (-not $env:DATABASE_URL) {
  throw "DATABASE_URL is not set. Load it in the environment without putting it in this script."
}
if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
  throw "Backup file was not found: $BackupFile"
}

Write-Warning "Restore will overwrite objects in the target database."
$confirmation = Read-Host "Type RESTORE to continue"
if ($confirmation -ne "RESTORE") {
  throw "Restore cancelled."
}

& pg_restore --clean --if-exists --no-owner --dbname=$env:DATABASE_URL $BackupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE."
}
Write-Output "Restore completed from: $BackupFile"
