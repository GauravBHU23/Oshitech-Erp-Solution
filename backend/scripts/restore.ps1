# Oshitech ERP - backup se database wapas laana
# Chalana:  powershell -ExecutionPolicy Bypass -File backend\scripts\restore.ps1 -DumpFile "C:\...\db_erp_2026-11-21_0200.dump"
# Encrypted backup.ps1 output seedha bhi diya ja sakta hai (.dump.enc / .zip.enc) - khud decrypt ho jayega:
#   -DumpFile "...\db_erp_2026-11-25_0200.dump.enc" -MediaZip "...\media_2026-11-25_0200.zip.enc" -Passphrase "..."
# DHYAN: abhi ka database us backup se BADAL jayega. Pehle backend server band karo.

param(
    [Parameter(Mandatory = $true)][string]$DumpFile,
    [string]$MediaZip = "",
    [string]$Passphrase = $env:BACKUP_PASSPHRASE
)

$ErrorActionPreference = "Stop"
$backendDir = Split-Path -Parent $PSScriptRoot
$cfg = @{}
foreach ($line in Get-Content -Path (Join-Path $backendDir ".env") -Encoding UTF8) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2].Trim('"').Trim("'") }
}
if ($cfg["DATABASE_URL"] -notmatch '^postgres(ql)?://([^:]+):(.*)@([^:@/]+)(:(\d+))?/(.+)$') { throw "DATABASE_URL not found in .env" }
$dbUser = $Matches[2]; $dbPass = [uri]::UnescapeDataString($Matches[3]); $dbHost = $Matches[4]
$dbPort = if ($Matches[6]) { $Matches[6] } else { "5432" }; $dbName = $Matches[7]
if (-not (Test-Path $DumpFile)) { throw "Backup file not found: $DumpFile" }

$needsDecrypt = $DumpFile.EndsWith(".enc") -or ($MediaZip -and $MediaZip.EndsWith(".enc"))
$tempDir = $null
if ($needsDecrypt) {
    if (-not $Passphrase) {
        $secure = Read-Host "Backup decryption passphrase" -AsSecureString
        $Passphrase = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    }
    $opensslCmd = Get-Command openssl -ErrorAction SilentlyContinue
    if (-not $opensslCmd) { throw "openssl not found on PATH - needed to decrypt .enc backups." }
    $tempDir = Join-Path $env:TEMP ("oshitech-restore-" + (Get-Date -Format "yyyyMMdd_HHmmss"))
    New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

    if ($DumpFile.EndsWith(".enc")) {
        $plainDump = Join-Path $tempDir ([IO.Path]::GetFileNameWithoutExtension($DumpFile))
        & $opensslCmd.Source enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in $DumpFile -out $plainDump -pass "pass:$Passphrase"
        if ($LASTEXITCODE -ne 0) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue; throw "Could not decrypt $DumpFile - wrong passphrase or corrupted file." }
        $DumpFile = $plainDump
    }
    if ($MediaZip -and $MediaZip.EndsWith(".enc")) {
        $plainZip = Join-Path $tempDir ([IO.Path]::GetFileNameWithoutExtension($MediaZip))
        & $opensslCmd.Source enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in $MediaZip -out $plainZip -pass "pass:$Passphrase"
        if ($LASTEXITCODE -ne 0) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue; throw "Could not decrypt $MediaZip - wrong passphrase or corrupted file." }
        $MediaZip = $plainZip
    }
}

try {
    $answer = Read-Host "Database '$dbName' will be REPLACED with $(Split-Path $DumpFile -Leaf). Type YES to continue"
    if ($answer -ne "YES") { Write-Output "Cancelled. Nothing changed."; exit 1 }

    $pgRestore = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_restore.exe" | Sort-Object FullName -Descending | Select-Object -First 1
    $env:PGPASSWORD = $dbPass
    & $pgRestore.FullName -h $dbHost -p $dbPort -U $dbUser -d $dbName --clean --if-exists --no-owner --single-transaction $DumpFile
    $code = $LASTEXITCODE
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    if ($code -ne 0) { throw "pg_restore failed (exit $code). The database was not changed (single transaction)." }
    Write-Output "Database restored from $(Split-Path $DumpFile -Leaf)."

    if ($MediaZip) {
        $mediaDir = Join-Path $backendDir "media"
        if (Test-Path $mediaDir) { Rename-Item $mediaDir ("media_before_restore_" + (Get-Date -Format "yyyyMMdd_HHmm")) }
        Expand-Archive -Path $MediaZip -DestinationPath $mediaDir
        Write-Output "Media restored (old folder kept as media_before_restore_*)."
    }
    Write-Output "Done. Start the backend server again."
} finally {
    if ($tempDir) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
}
