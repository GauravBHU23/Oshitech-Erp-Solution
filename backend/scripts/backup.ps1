# Oshitech ERP - daily backup (PostgreSQL database + media files)
# Chalana:  powershell -ExecutionPolicy Bypass -File backend\scripts\backup.ps1
# .env se padhta hai: DATABASE_URL, BACKUP_DIR (optional), BACKUP_KEEP_DAYS (optional, default 14)

$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backendDir ".env"

function Read-DotEnv([string]$path) {
    $values = @{}
    if (Test-Path $path) {
        foreach ($line in Get-Content -Path $path -Encoding UTF8) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
                $values[$Matches[1]] = $Matches[2].Trim('"').Trim("'")
            }
        }
    }
    return $values
}

$cfg = Read-DotEnv $envFile
$backupDir = if ($cfg["BACKUP_DIR"]) { $cfg["BACKUP_DIR"] } else { Join-Path $env:USERPROFILE "OshitechBackups" }
$keepDays = if ($cfg["BACKUP_KEEP_DAYS"]) { [int]$cfg["BACKUP_KEEP_DAYS"] } else { 14 }
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$logFile = Join-Path $backupDir "backup.log"
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"

function Write-Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
    Write-Output $line
}

try {
    $url = $cfg["DATABASE_URL"]
    if (-not $url -or $url -notmatch '^postgres(ql)?://([^:]+):([^@]*)@([^:/]+)(:(\d+))?/(.+)$') {
        throw "DATABASE_URL (postgres://user:password@host:port/db) not found in $envFile"
    }
    $dbUser = $Matches[2]; $dbPass = [uri]::UnescapeDataString($Matches[3]); $dbHost = $Matches[4]
    $dbPort = if ($Matches[6]) { $Matches[6] } else { "5432" }; $dbName = $Matches[7]

    $pgDump = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $pgDump) { throw "pg_dump.exe not found (install PostgreSQL client tools)" }

    # 1) Database: custom format (compressed, pg_restore se wapas aata hai)
    $dbFile = Join-Path $backupDir "db_$($dbName)_$stamp.dump"
    $env:PGPASSWORD = $dbPass
    & $pgDump.FullName -h $dbHost -p $dbPort -U $dbUser -d $dbName -F c -Z 6 --no-owner -f $dbFile
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    if ((Get-Item $dbFile).Length -lt 1024) { throw "Database backup looks empty: $dbFile" }
    Write-Log ("Database backup OK: {0} ({1:N0} KB)" -f (Split-Path $dbFile -Leaf), ((Get-Item $dbFile).Length / 1KB))

    # 2) Media: photos, signatures, notice PDFs
    $mediaDir = Join-Path $backendDir "media"
    if (Test-Path $mediaDir) {
        $mediaFile = Join-Path $backupDir "media_$stamp.zip"
        Compress-Archive -Path (Join-Path $mediaDir "*") -DestinationPath $mediaFile -CompressionLevel Optimal -Force
        Write-Log ("Media backup OK: {0} ({1:N0} KB)" -f (Split-Path $mediaFile -Leaf), ((Get-Item $mediaFile).Length / 1KB))
    }

    # 3) Purane backup hatao
    $cutoff = (Get-Date).AddDays(-$keepDays)
    $old = Get-ChildItem $backupDir -File | Where-Object { ($_.Name -like "db_*.dump" -or $_.Name -like "media_*.zip") -and $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) { Remove-Item $f.FullName -Force }
    if ($old) { Write-Log "Removed $($old.Count) backup file(s) older than $keepDays days" }
    exit 0
}
catch {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    Write-Log "BACKUP FAILED: $($_.Exception.Message)"
    exit 1
}
