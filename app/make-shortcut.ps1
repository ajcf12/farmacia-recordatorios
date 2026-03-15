Add-Type -AssemblyName System.Drawing

$sz = 64
$bmp = New-Object System.Drawing.Bitmap($sz, $sz)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# Phone body (dark blue rectangle)
$phoneBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(25, 85, 175))
$g.FillRectangle($phoneBrush, 5, 3, 32, 52)

# Screen (light blue)
$screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(175, 210, 255))
$g.FillRectangle($screenBrush, 9, 11, 24, 34)

# Speaker (top center, dark)
$darkBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(10, 50, 130))
$g.FillRectangle($darkBrush, 16, 6, 10, 2)

# Home button (bottom)
$g.FillEllipse($darkBrush, 16, 48, 10, 5)

# Pill - left half (white)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.FillEllipse($whiteBrush, 32, 36, 28, 16)

# Pill - right half (green) using clip
$greenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 175, 100))
$clip = New-Object System.Drawing.Region([System.Drawing.Rectangle]::new(46, 36, 15, 17))
$g.SetClip($clip, [System.Drawing.Drawing2D.CombineMode]::Replace)
$g.FillEllipse($greenBrush, 32, 36, 28, 16)
$g.ResetClip()

# Pill outline
$pillPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(150, 150, 150), 1.5)
$g.DrawEllipse($pillPen, 32, 36, 28, 16)

# Pill divider
$g.DrawLine($pillPen, 46, 37, 46, 51)

$g.Dispose()

# Save icon
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

Write-Host "Listo. Acceso directo creado en el escritorio."
