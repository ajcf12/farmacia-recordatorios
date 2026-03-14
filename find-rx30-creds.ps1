# Run this on the pharmacy PC (PowerShell as Administrator).
# Finds Rx30 SQL Server connection details from config files and registry.

Write-Host "`n=== Rx30 SQL Server Credential Finder ===" -ForegroundColor Cyan

# 1. Find Rx30 install directory
Write-Host "`n[1] Looking for Rx30 installation..." -ForegroundColor Yellow
$rx30Dirs = @(
  "C:\Rx30", "C:\Program Files\Rx30", "C:\Program Files (x86)\Rx30",
  "C:\RxThirty", "C:\Program Files\RxThirty", "D:\Rx30", "D:\Program Files\Rx30"
)
$found = $rx30Dirs | Where-Object { Test-Path $_ }
if ($found) {
  Write-Host "  Found: $($found -join ', ')"
} else {
  Write-Host "  Not found in common paths. Searching C:\..." -ForegroundColor Gray
  $found = Get-ChildItem C:\ -Filter "*rx30*" -Directory -Recurse -ErrorAction SilentlyContinue -Depth 3 | Select-Object -First 3 -ExpandProperty FullName
  if ($found) { Write-Host "  Found: $($found -join ', ')" }
}

# 2. Search config files for connection strings
Write-Host "`n[2] Searching config files for connection strings..." -ForegroundColor Yellow
$searchPaths = $found + @("C:\Rx30", "C:\Program Files\Rx30", "C:\Program Files (x86)\Rx30")
foreach ($dir in ($searchPaths | Select-Object -Unique)) {
  if (-not (Test-Path $dir)) { continue }
  Get-ChildItem $dir -Recurse -Include "*.config","*.ini","*.xml","*.cfg","app.config","web.config" -ErrorAction SilentlyContinue |
    ForEach-Object {
      $content = Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-String -Pattern "server|datasource|data source|uid|user id|password|pwd|initial catalog|database" -CaseSensitive:$false
      if ($content) {
        Write-Host "`n  File: $($_.FullName)" -ForegroundColor Green
        $content | ForEach-Object { Write-Host "    $_" }
      }
    }
}

# 3. Check registry
Write-Host "`n[3] Checking registry for Rx30 keys..." -ForegroundColor Yellow
$regPaths = @(
  "HKLM:\SOFTWARE\Rx30",
  "HKLM:\SOFTWARE\Wow6432Node\Rx30",
  "HKLM:\SOFTWARE\RxThirty",
  "HKLM:\SOFTWARE\Wow6432Node\RxThirty"
)
foreach ($reg in $regPaths) {
  if (Test-Path $reg) {
    Write-Host "  Found: $reg" -ForegroundColor Green
    Get-ItemProperty $reg | Format-List
  }
}

# 4. Find running SQL Server instances
Write-Host "`n[4] SQL Server instances on this machine..." -ForegroundColor Yellow
Get-Service -Name "MSSQL*" -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "  $($_.Name) — $($_.Status)"
}

# 5. Check ODBC DSNs (Rx30 often uses ODBC)
Write-Host "`n[5] ODBC Data Sources (system DSNs)..." -ForegroundColor Yellow
$odbcPath = "HKLM:\SOFTWARE\ODBC\ODBC.INI"
$odbcPath32 = "HKLM:\SOFTWARE\Wow6432Node\ODBC\ODBC.INI"
foreach ($path in @($odbcPath, $odbcPath32)) {
  if (Test-Path $path) {
    Get-ChildItem $path -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($props.Server -or $props.Database) {
        Write-Host "  DSN: $($_.PSChildName)" -ForegroundColor Green
        Write-Host "    Server:   $($props.Server)"
        Write-Host "    Database: $($props.Database)"
        Write-Host "    Driver:   $($props.Driver)"
      }
    }
  }
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
