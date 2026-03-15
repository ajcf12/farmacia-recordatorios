Add-Type -AssemblyName System.Drawing

# Generate icon
$sz = 48
$bmp = New-Object System.Drawing.Bitmap($sz, $sz)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)
$green = [System.Drawing.Color]::FromArgb(0, 140, 90)
$g.FillEllipse((New-Object System.Drawing.SolidBrush($green)), 2, 2, $sz - 4, $sz - 4)
$font = New-Object System.Drawing.Font("Arial", 16, [System.Drawing.FontStyle]::Bold)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rf = [System.Drawing.RectangleF]::FromLTRB(0, 0, $sz, $sz)
$g.DrawString("Rx", $font, [System.Drawing.Brushes]::White, $rf, $sf)
$g.Dispose()

$icoPath = "C:\FarmaciaApp\farmacia.ico"
$ico = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$ico.Save($fs)
$fs.Dispose()
$bmp.Dispose()

# Create shortcut
$ws = New-Object -ComObject WScript.Shell
$desktop = $ws.SpecialFolders("Desktop")
$sc = $ws.CreateShortcut("$desktop\Farmacia Recordatorios.lnk")
$sc.TargetPath = "C:\FarmaciaApp\node_modules\electron\dist\electron.exe"
$sc.Arguments = "C:\FarmaciaApp"
$sc.WorkingDirectory = "C:\FarmaciaApp"
$sc.IconLocation = "$icoPath,0"
$sc.Save()

Write-Host "Acceso directo creado en el escritorio."
