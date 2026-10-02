param(
    [Parameter(Mandatory)]
    [string]$QemuPath,

    [Parameter(Mandatory)]
    [string]$WebDist,

    [Parameter(Mandatory)]
    [string]$PythonRuntime,

    [Parameter(Mandatory)]
    [string]$OutputDir,

    [string]$ArchivePath,

    [string]$MsysBin = "C:\msys64\ucrt64\bin"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$qemu = [System.IO.Path]::GetFullPath($QemuPath)
$web = [System.IO.Path]::GetFullPath($WebDist)
$pythonRuntime = [System.IO.Path]::GetFullPath($PythonRuntime)
$output = [System.IO.Path]::GetFullPath($OutputDir)

foreach ($path in @(
    $qemu,
    (Join-Path $web "index.html"),
    (Join-Path $pythonRuntime "python.exe")
)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Package input is missing: $path"
    }
}
if (Test-Path -LiteralPath $output) {
    throw "Output directory already exists: $output"
}

New-Item -ItemType Directory -Path $output | Out-Null
New-Item -ItemType Directory -Path (Join-Path $output "runtime") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $output "scripts") | Out-Null
New-Item -ItemType Directory -Path (Join-Path $output "share\keymaps") `
    -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $output "web") | Out-Null

Copy-Item -LiteralPath $qemu `
    -Destination (Join-Path $output "qemu-system-s1c33.exe")
Copy-Item -LiteralPath $web -Destination (Join-Path $output "web\dist") `
    -Recurse
Copy-Item -LiteralPath $pythonRuntime `
    -Destination (Join-Path $output "python") -Recurse
Copy-Item -LiteralPath (Join-Path $root "run-bbk9288-web.cmd") `
    -Destination $output
Copy-Item -LiteralPath (Join-Path $root "run-bbk9288-web.ps1") `
    -Destination $output
Copy-Item -LiteralPath (Join-Path $root "requirements-bbk9288.txt") `
    -Destination $output
Copy-Item -LiteralPath (Join-Path $root "README.md") -Destination $output
Copy-Item -LiteralPath (Join-Path $root "SECURITY.md") -Destination $output
Copy-Item -LiteralPath (Join-Path $root "LICENSE") -Destination $output
Copy-Item -LiteralPath (Join-Path $root "COPYING") -Destination $output
Copy-Item -LiteralPath (Join-Path $root "COPYING.LIB") -Destination $output
Copy-Item -LiteralPath (Join-Path $root "docs") -Destination $output -Recurse
Copy-Item -LiteralPath (Join-Path $root "scripts\bbk9288_web_server.py") `
    -Destination (Join-Path $output "scripts")
Copy-Item -LiteralPath (Join-Path $root "scripts\bbk9288s_nand_image.py") `
    -Destination (Join-Path $output "scripts")
Copy-Item -LiteralPath (Join-Path $root "scripts\prepare_native_boot_nand.py") `
    -Destination (Join-Path $output "scripts")
Copy-Item -LiteralPath (Join-Path $root "pc-bios\keymaps\en-us") `
    -Destination (Join-Path $output "share\keymaps")

$runtimeReadme = @"
Native boot requires both files in this directory:

  nand-user.raw    Raw 9288 NAND image with data and OOB ECC
  BOOT0.BIN        Decoded 240-byte 9288 boot ROM

Download the native NAND release ZIP and extract its runtime folder over this one.
The emulator saves guest NAND writes to nand-user.raw; retain the ZIP as a backup.
"@
Set-Content -LiteralPath (Join-Path $output "runtime\README.txt") `
    -Value $runtimeReadme -Encoding utf8

$objdump = Join-Path $MsysBin "objdump.exe"
if (-not (Test-Path -LiteralPath $objdump -PathType Leaf)) {
    throw "MSYS2 objdump is missing: $objdump"
}

$seen = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
)
$queue = [System.Collections.Generic.Queue[string]]::new()
$queue.Enqueue($qemu)

while ($queue.Count -gt 0) {
    $binary = $queue.Dequeue()
    $imports = & $objdump -p $binary |
        Select-String "DLL Name:" |
        ForEach-Object { ($_ -split "DLL Name:", 2)[1].Trim() }
    foreach ($name in $imports) {
        $dependency = Join-Path $MsysBin $name
        if (-not (Test-Path -LiteralPath $dependency -PathType Leaf)) {
            continue
        }
        if (-not $seen.Add($name)) {
            continue
        }
        Copy-Item -LiteralPath $dependency -Destination (Join-Path $output $name)
        $queue.Enqueue($dependency)
    }
}

$manifest = Get-ChildItem -LiteralPath $output -Recurse -File |
    Sort-Object FullName |
    ForEach-Object {
        $hash = (
            Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
        ).Hash.ToLowerInvariant()
        $relative = $_.FullName.Substring($output.Length)
        $relative = $relative.TrimStart([char[]]"\/").Replace("\", "/")
        "$hash  $relative"
    }
Set-Content -LiteralPath (Join-Path $output "SHA256SUMS.txt") `
    -Value $manifest -Encoding ascii

if ($ArchivePath) {
    $archive = [System.IO.Path]::GetFullPath($ArchivePath)
    if (Test-Path -LiteralPath $archive) {
        throw "Archive already exists: $archive"
    }
    Compress-Archive -LiteralPath $output -DestinationPath $archive `
        -CompressionLevel Optimal
    Write-Host "Archive: $archive"
}

Write-Host "Package: $output"
Write-Host "MSYS2 runtime DLLs: $($seen.Count)"
