# SPDX-License-Identifier: GPL-2.0-or-later

param(
    [ValidateRange(1, 65535)]
    [int]$HttpPort = 8000,

    [ValidateRange(1, 65535)]
    [int]$WebSocketPort = 6081,

    [ValidateRange(1, 65535)]
    [int]$QmpPort = 6082,

    [string]$RuntimeDir,

    [string]$Nand,

    [string]$BootRom,

    [switch]$DirectKernelBoot,

    [ValidatePattern('^0[xX][0-9A-Fa-f]{8}$')]
    [string]$NandId
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
$env:PYTHONUTF8 = "1"
$env:PYTHONNOUSERSITE = "1"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeBin = "C:\msys64\ucrt64\bin"
$qemuCandidates = @(
    (Join-Path $root "bbk9288.exe"),
    (Join-Path $root "qemu-system-s1c33.exe"),
    (Join-Path $root "build\qemu-system-s1c33.exe"),
    (Join-Path $root "_build\qemu-system-s1c33.exe")
)
$qemu = $qemuCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($qemu)) {
    throw "S1C33 QEMU executable not found."
}
if (-not $RuntimeDir) {
    $RuntimeDir = if ($env:BBK9288_RUNTIME_DIR) {
        $env:BBK9288_RUNTIME_DIR
    } else {
        Join-Path $root "runtime"
    }
}
$RuntimeDir = [System.IO.Path]::GetFullPath($RuntimeDir)
if (-not $Nand) {
    $nandCandidates = @(
        (Join-Path $RuntimeDir "nand-user.raw"),
        (Join-Path $root "nand-user.raw"),
        (Join-Path (
            Split-Path -Parent $root
        ) "BBK9288-emulator\nand-user.raw")
    )
    $Nand = $nandCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
}
if ([string]::IsNullOrWhiteSpace($Nand)) {
    throw "NAND image not found; specify nand-user.raw with -Nand."
}
$Nand = [System.IO.Path]::GetFullPath($Nand)
if ($DirectKernelBoot -and $BootRom) {
    throw "-DirectKernelBoot cannot be combined with -BootRom"
}
if (-not $DirectKernelBoot -and [string]::IsNullOrWhiteSpace($BootRom)) {
    $BootRom = @(
        (Join-Path $RuntimeDir "BOOT0.BIN"),
        (Join-Path $root "BOOT0.BIN")
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($BootRom)) {
        throw "Native boot requires runtime\BOOT0.BIN; download and extract the native NAND release asset. Use -DirectKernelBoot only for legacy images."
    }
}
if (-not [string]::IsNullOrWhiteSpace($BootRom)) {
    $BootRom = [System.IO.Path]::GetFullPath($BootRom)
    if (-not (Test-Path -LiteralPath $BootRom -PathType Leaf)) {
        throw "BBK 9288 boot ROM not found: $BootRom"
    }
    if ([string]::IsNullOrWhiteSpace($NandId)) {
        $NandId = '0xADDA8015'
    }
}
$nandTool = Join-Path $root "scripts\bbk9288s_nand_image.py"
$webServer = Join-Path $root "scripts\bbk9288_web_server.py"
$webRoot = Join-Path $root "web"
$webDist = Join-Path $webRoot "dist"
$bundledPython = Join-Path $root "python\python.exe"
$python = if (Test-Path -LiteralPath $bundledPython -PathType Leaf) {
    $bundledPython
} else {
    (Get-Command python -ErrorAction Stop).Source
}

foreach ($path in @($qemu, $Nand, $nandTool, $webServer)) {
    if (-not (Test-Path -LiteralPath $path)) {
        throw "Required emulator file is missing: $path"
    }
}

$ports = @($HttpPort, $WebSocketPort, $QmpPort)
if (($ports | Select-Object -Unique).Count -ne 3) {
    throw "HttpPort, WebSocketPort, and QmpPort must be different"
}

foreach ($port in $ports) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
        throw "TCP port $port is already in use"
    }
}
if (Get-NetTCPConnection -State Listen -LocalPort 5900 -ErrorAction SilentlyContinue) {
    throw "QEMU VNC port 5900 is already in use"
}

if (Test-Path -LiteralPath $runtimeBin) {
    $env:PATH = "$runtimeBin;$env:PATH"
}

if (Test-Path -LiteralPath (Join-Path $webRoot "package.json")) {
    Push-Location $webRoot
    try {
        if (-not (Test-Path -LiteralPath (Join-Path $webRoot "node_modules"))) {
            & npm ci
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci failed"
            }
        }
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Web frontend build failed"
        }
    } finally {
        Pop-Location
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $webDist "index.html"))) {
    throw "Web frontend is missing: $webDist"
}

$query = if ($WebSocketPort -eq 6081) { "" } else { "?wsPort=$WebSocketPort" }
Write-Host ""
Write-Host "BBK 9288 Web is running:"
Write-Host "  Local: http://127.0.0.1:$HttpPort/$query"
Write-Host "  NAND:  $Nand"
if ($BootRom) {
    Write-Host "  ROM:   $BootRom (NAND ID $NandId)"
}
$addresses = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
    } |
    Select-Object -ExpandProperty IPAddress -Unique
foreach ($address in $addresses) {
    Write-Host "  LAN:   http://${address}:$HttpPort/$query"
}
Write-Host ""

$bootArgs = @()
if ($BootRom) {
    $bootArgs += @('--boot-rom', $BootRom)
} elseif ($DirectKernelBoot) {
    $bootArgs += '--direct-kernel-boot'
}
if ($NandId) {
    $bootArgs += @('--nand-id', $NandId)
}

Push-Location $root
try {
    & $python $webServer `
        --root $root `
        --runtime-dir $RuntimeDir `
        --qemu $qemu `
        --nand $Nand `
        --dist $webDist `
        --http-port $HttpPort `
        --websocket-port $WebSocketPort `
        --qmp-port $QmpPort `
        @bootArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Web server exited with code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}
