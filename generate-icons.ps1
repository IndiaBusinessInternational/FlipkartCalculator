# Regenerate PWA/favicon PNG icons (no Node/ImageMagick needed — uses .NET GDI+).
# Run:  powershell -ExecutionPolicy Bypass -File generate-icons.ps1
Add-Type -AssemblyName System.Drawing
$icons = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $icons)) { New-Item -ItemType Directory -Path $icons | Out-Null }
$cyan = [System.Drawing.Color]::FromArgb(0,197,255)   # #00c5ff brand cyan

function New-Icon([int]$size,[string]$path,[bool]$maskable){
  $bmp = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Black)
  if (-not $maskable) {
    $r=[int]($size*0.20); $pen=New-Object System.Drawing.Pen($cyan,[single]($size*0.012))
    $p=New-Object System.Drawing.Drawing2D.GraphicsPath
    $d=$r*2; $m=[single]($size*0.04); $w=$size-1-2*$m
    $p.AddArc($m,$m,$d,$d,180,90); $p.AddArc($m+$w-$d,$m,$d,$d,270,90)
    $p.AddArc($m+$w-$d,$m+$w-$d,$d,$d,0,90); $p.AddArc($m,$m+$w-$d,$d,$d,90,90); $p.CloseFigure()
    $g.DrawPath($pen,$p); $pen.Dispose(); $p.Dispose()
  }
  $fs = if($maskable){[single]($size*0.30)}else{[single]($size*0.40)}
  $font = New-Object System.Drawing.Font("Segoe UI",$fs,[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat; $sf.Alignment='Center'; $sf.LineAlignment='Center'
  $brush = New-Object System.Drawing.SolidBrush($cyan)
  $g.DrawString("IBI",$font,$brush,(New-Object System.Drawing.RectangleF(0,0,$size,$size)),$sf)
  $g.Dispose(); $bmp.Save($path,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  Write-Host ("{0}  ({1} bytes)" -f (Split-Path $path -Leaf), (Get-Item $path).Length)
}

New-Icon 192 (Join-Path $icons "icon-192.png") $false
New-Icon 512 (Join-Path $icons "icon-512.png") $false
New-Icon 512 (Join-Path $icons "icon-512-maskable.png") $true
New-Icon 180 (Join-Path $icons "apple-touch-icon.png") $false
New-Icon 32  (Join-Path $icons "favicon-32.png") $false
