param([Parameter(Mandatory = $true)][string]$SourcePath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$brandDirectory = Join-Path $PSScriptRoot '../public/brand'
New-Item -ItemType Directory -Path $brandDirectory -Force | Out-Null
$sourceImage = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $SourcePath))
try {
    # Mechanical size/format exports only; preserve the approved artwork and alpha.
    $exports = @{
        'favicon-16.png' = 16; 'favicon-32.png' = 32; 'favicon-48.png' = 48
        'apple-touch-icon.png' = 180; 'greentask-mark-192.png' = 192
        'greentask-mark-512.png' = 512
    }
    foreach ($entry in $exports.GetEnumerator()) {
        $bitmap = New-Object System.Drawing.Bitmap($entry.Value, $entry.Value)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($sourceImage, 0, 0, $entry.Value, $entry.Value)
            $bitmap.Save((Join-Path $brandDirectory $entry.Key), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $sourceImage.Dispose() }

# Standard ICO container containing the exact 16/32/48 PNG exports.
$iconPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../public/favicon.ico'))
$stream = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $sizes = @(16, 32, 48)
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    $frames = @()
    foreach ($size in $sizes) {
        $bytes = [System.IO.File]::ReadAllBytes((Join-Path $brandDirectory "favicon-$size.png"))
        $frames += ,$bytes
        $writer.Write([byte]$size); $writer.Write([byte]$size)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$bytes.Length); $writer.Write([uint32]$offset)
        $offset += $bytes.Length
    }
    foreach ($bytes in $frames) { $writer.Write([byte[]]$bytes) }
} finally { $writer.Dispose(); $stream.Dispose() }
Get-ChildItem -LiteralPath $brandDirectory | Select-Object Name, Length
