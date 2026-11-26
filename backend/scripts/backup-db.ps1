# Oshitech ERP - database + media ka encrypted backup banao
# Chalana (manual):  powershell -ExecutionPolicy Bypass -File backend\scripts\backup-db.ps1
# Chalana (scheduled task, har raat 2 baje):
#   schtasks /Create /SC DAILY /ST 02:00 /TN "OshitechErpBackup" ^
#     /TR "powershell.exe -ExecutionPolicy Bypass -File \"E:\Oshitech-Erp-Solution-main\backend\scripts\backup-db.ps1\""
#   (upar diya command register karega, lekin khud se register NAHI hota - admin isse chalaye tab hi set hoga)
#
# Kya banta hai, backend\backups\ me:
#   db_erp_<timestamp>.dump.enc      - PostgreSQL custom-format dump, AES-256 se encrypted
#   media_<timestamp>.zip.enc        - backend/media/ (photos, signatures, notices) ka zip, encrypted
# Dono purane (-RetentionDays se zyada purane) backups khud delete ho jaate hain.
#
# Passphrase: -Passphrase se do, ya BACKUP_PASSPHRASE environment variable me rakho (scheduled
# task ke liye recommended), warna script interactively maangega. Passphrase kahin file me save
# nahi hoti - bina usske backup wapas decrypt nahi ho sakta, isliye ise kisi surakshit jagah
# (password manager) likh kar rakho.
#
# Wapas laane ke liye restore.ps1 use karo (woh is script ke .enc output ko khud decrypt kar leta hai).

param(
    [string]$Passphrase = $env:BACKUP_PASSPHRASE,
    [string]$OutDir = "",
    [int]$RetentionDays = 14,
    [switch]$SkipMedia
)

$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $PSScriptRoot
if (-not $OutDir) { $OutDir = Join-Path $backendDir "backups" }

function Get-OpenSsl {
    $cmd = Get-Command openssl -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "openssl not found on PATH. Install Git for Windows, OpenSSL, or add it to PATH before running this script." }
    return $cmd.Source
}

function Get-PgTool($name) {
    $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
    if (-not $found) { throw "$name.exe not found under C:\Program Files\PostgreSQL\*\bin. Is PostgreSQL client tools installed?" }
    return $found.FullName
}

if (-not $Passphrase) {
    $secure = Read-Host "Backup encryption passphrase (min 12 chars - write it down, it is never saved anywhere)" -AsSecureString
    $Passphrase = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
if ($Passphrase.Length -lt 12) { throw "Passphrase must be at least 12 characters." }

# .env se DATABASE_URL nikalo (restore.ps1 jaisa hi parsing, consistency ke liye)
$cfg = @{}
foreach ($envFile in @(".env.local", ".env")) {
    $path = Join-Path $backendDir $envFile
    if (Test-Path $path) {
        foreach ($line in Get-Content -Path $path -Encoding UTF8) {
            if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
                $key = $Matches[1]
                if (-not $cfg.ContainsKey($key)) { $cfg[$key] = $Matches[2].Trim('"').Trim("'") }
            }
        }
    }
}
if ($cfg["DATABASE_URL"] -notmatch '^postgres(ql)?://([^:]+):(.*)@([^:@/]+)(:(\d+))?/(.+)$') { throw "DATABASE_URL not found in .env / .env.local" }
$dbUser = $Matches[2]; $dbPass = [uri]::UnescapeDataString($Matches[3]); $dbHost = $Matches[4]
$dbPort = if ($Matches[6]) { $Matches[6] } else { "5432" }; $dbName = $Matches[7]

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$opensslExe = Get-OpenSsl
$tempDir = Join-Path $env:TEMP "oshitech-backup-$stamp"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

try {
    # ---------- Database dump ----------
    Write-Output "Dumping database '$dbName'..."
    $pgDump = Get-PgTool "pg_dump"
    $dumpPath = Join-Path $tempDir "db_$dbName`_$stamp.dump"
    $env:PGPASSWORD = $dbPass
    & $pgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -Fc -f $dumpPath
    $dumpExit = $LASTEXITCODE
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    if ($dumpExit -ne 0) { throw "pg_dump failed (exit $dumpExit)." }

    $encDumpPath = Join-Path $OutDir "db_$dbName`_$stamp.dump.enc"
    & $opensslExe enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in $dumpPath -out $encDumpPath -pass "pass:$Passphrase"
    if ($LASTEXITCODE -ne 0) { throw "openssl encryption of the database dump failed." }
    Write-Output "Database backup: $encDumpPath"

    # ---------- Media (uploads: photos, signatures, notices) ----------
    if (-not $SkipMedia) {
        $mediaDir = Join-Path $backendDir "media"
        if (Test-Path $mediaDir) {
            Write-Output "Archiving media..."
            $mediaZipPath = Join-Path $tempDir "media_$stamp.zip"
            Compress-Archive -Path (Join-Path $mediaDir "*") -DestinationPath $mediaZipPath -Force
            $encMediaPath = Join-Path $OutDir "media_$stamp.zip.enc"
            & $opensslExe enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in $mediaZipPath -out $encMediaPath -pass "pass:$Passphrase"
            if ($LASTEXITCODE -ne 0) { throw "openssl encryption of the media archive failed." }
            Write-Output "Media backup: $encMediaPath"
        } else {
            Write-Output "No media/ folder found - skipping media backup."
        }
    }
} finally {
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# ---------- Prune old backups ----------
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem $OutDir -Filter "*.enc" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Write-Output "Removing old backup: $($_.Name)"
    Remove-Item $_.FullName -Force
}

Write-Output "Backup complete. Keep the passphrase safe - without it these .enc files cannot be restored."
