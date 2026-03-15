Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Drawing2D

function RoundRect($path, $x, $y, $w, $h, $r) {
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
    $path.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
    $path.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
    $path.CloseFigure()
}

$sz = 64
$bmp = New-Object System.Drawing.Bitmap($sz, $sz)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear([System.Drawing.Color]::Transparent)

# --- Smartphone body ---
$phonePath = New-Object System.Drawing.Drawing2D.GraphicsPath
RoundRect $phonePath 6 4 30 50 6
$phoneBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(30, 90, 180))
$g.FillPath($phoneBrush, $phonePath)

# Screen
$screenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 210, 255))
$g.FillRectangle($screenBrush, 10, 12, 22, 32)

# Speaker slot (top)
$slotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 60, 140))
$g.FillRectangle($slotBrush, 16, 7, 10, 2)

# Home button
$g.FillEllipse($slotBrush, 17, 47, 8, 4)

# --- Pill (capsule) overlaid bottom-right ---
# Shadow/outline
$shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(80, 0, 0, 0))
$g.FillEllipse($shadowBrush, 34, 38, 28, 16)

# Left half (white)
$pillLeft = New-Object System.Drawing.Drawing2D.GraphicsPath
$pillLeft.AddEllipse(33, 36, 28, 16)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$g.SetClip([System.Drawing.Rectangle]::FromLTRB(33, 36, 47, 53))
$g.FillPath($whiteBrush, $pillLeft)
$g.ResetClip()

# Right half (green)
$pillRight = New-Object System.Drawing.Drawing2D.GraphicsPath
$pillRight.AddEllipse(33, 36, 28, 16)
$greenBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 180, 100))
$g.SetClip([System.Drawing.Rectangle]::FromLTRB(47, 36, 62, 53))
$g.FillPath($greenBrush, $pillRight)
$g.ResetClip()

# Pill outline
$pillPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 180, 180), 1)
$g.DrawEllipse($pillPen, 33, 36, 28, 16)

# Divider line
$divPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(180, 180, 180), 1)
$g.DrawLine($divPen, 47, 37, 47, 51)

$g.Dispose()

# Save as .ico
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
