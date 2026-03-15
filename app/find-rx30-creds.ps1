# Run on the pharmacy PC as Administrator to find Rx30 SQL Server credentials.
# Right-click -> Run with PowerShell (as Admin)

Write-Host ""
Write-Host "=== Rx30 Credential Finder ===" -ForegroundColor Cyan

# 1. ODBC DSNs (Rx30 almost always registers one)
Write-Host ""
Write-Host "[1] ODBC Data Sources..." -ForegroundColor Yellow
$paths = @(
    "HKLM:\SOFTWARE\ODBC\ODBC.INI",
    "HKLM:\SOFTWARE\Wow6432Node\ODBC\ODBC.INI"
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        Get-ChildItem $p -ErrorAction SilentlyContinue | ForEach-Object {
            $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
            if ($props.Server -or $props.Database) {
                Write-Host "  DSN : $($_.PSChildName)" -ForegroundColor Green
                Write-Host "  Server   : $($props.Server)"
                Write-Host "  Database : $($props.Database)"
                Write-Host "  Driver   : $($props.Driver)"
                Write-Host ""
            }
        }
    }
}

# 2. Config files in common Rx30 install paths
Write-Host "[2] Config files..." -ForegroundColor Yellow
$dirs = @("C:\Rx30","C:\Program Files\Rx30","C:\Program Files (x86)\Rx30","C:\RxThirty","D:\Rx30")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -Recurse -ErrorAction SilentlyContinue -Include "*.ini","*.config","*.xml","*.cfg" |
    ForEach-Object {
        $hits = Get-Content $_.FullName -ErrorAction SilentlyContinue |
                Select-String -Pattern "server|datasource|data source|uid|user id|password|pwd|database" -CaseSensitive:$false
        if ($hits) {
            Write-Host "  File: $($_.FullName)" -ForegroundColor Green
            $hits | ForEach-Object { Write-Host "    $_" }
            Write-Host ""
        }
    }
}

# 3. Registry
Write-Host "[3] Registry..." -ForegroundColor Yellow
$regs = @(
    "HKLM:\SOFTWARE\Rx30",
    "HKLM:\SOFTWARE\Wow6432Node\Rx30",
    "HKLM:\SOFTWARE\RxThirty",
    "HKLM:\SOFTWARE\Wow6432Node\RxThirty"
)
foreach ($r in $regs) {
    if (Test-Path $r) {
        Write-Host "  Found: $r" -ForegroundColor Green
        Get-ItemProperty $r | Format-List
    }
}

# 4. SQL Server services on this machine
Write-Host "[4] SQL Server services on this machine..." -ForegroundColor Yellow
Get-Service -Name "MSSQL*" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.Name) - $($_.Status)" -ForegroundColor Green
}
if (-not (Get-Service -Name "MSSQL*" -ErrorAction SilentlyContinue)) {
    Write-Host "  None found (SQL Server may be on a remote machine)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Press Enter to close..."
Read-Host
