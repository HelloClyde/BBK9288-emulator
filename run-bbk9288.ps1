param(
    [string]$Nand,
    [string]$BootRom,
    [switch]$DirectKernelBoot,
    [ValidatePattern('^0[xX][0-9A-Fa-f]{8}$')]
    [string]$NandId,
    [string]$AudioPlayer,
    [switch]$NoAudio,
    [switch]$TraceIo,
    [switch]$NoSoftKeyboard,
    [ValidateRange(50, 500)]
    [int]$KeyHoldMs = 120
)

# SPDX-License-Identifier: GPL-2.0-or-later

$ErrorActionPreference = "Stop"

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new(
        [System.Net.IPAddress]::Loopback, 0
    )
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Quote-ProcessArgument {
    param([string]$Value)
    if ($Value -notmatch '[\s"]') {
        return $Value
    }
    return '"' + $Value.Replace('"', '\"') + '"'
}

$qemuCandidates = @(
    (Join-Path $PSScriptRoot "_build\qemu-system-s1c33.exe"),
    (Join-Path $PSScriptRoot "bbk9288.exe")
)
$qemu = $qemuCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if ([string]::IsNullOrWhiteSpace($qemu)) {
    throw "找不到模拟器程序（_build\qemu-system-s1c33.exe 或 bbk9288.exe）。"
}
if ([string]::IsNullOrWhiteSpace($Nand)) {
    $Nand = @(
        (Join-Path $PSScriptRoot "runtime\nand-user.raw"),
        (Join-Path $PSScriptRoot "nand-user.raw")
    ) | Where-Object {
        Test-Path -LiteralPath $_ -PathType Leaf
    } | Select-Object -First 1
}
if (-not (Test-Path -LiteralPath $Nand -PathType Leaf)) {
    throw "找不到 9288 NAND 镜像：$Nand"
}

$softKeyboardCandidates = @(
    (Join-Path $PSScriptRoot "scripts\bbk9288-softkeyboard.ps1"),
    (Join-Path $PSScriptRoot "bbk9288-softkeyboard.ps1")
)
$softKeyboard = $softKeyboardCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if (-not $NoSoftKeyboard -and [string]::IsNullOrWhiteSpace($softKeyboard)) {
    throw "找不到 53 键软键盘脚本 bbk9288-softkeyboard.ps1。"
}

$isSourceBuild = $qemu -like "*\_build\qemu-system-s1c33.exe"
if ($isSourceBuild) {
    $ucrtBin = "C:\msys64\ucrt64\bin"
    $msysBin = "C:\msys64\usr\bin"
    if (-not (Test-Path -LiteralPath (Join-Path $ucrtBin "SDL2.dll"))) {
        throw "找不到 MSYS2 UCRT64 SDL 运行库：$ucrtBin"
    }
    $env:Path = "$ucrtBin;$msysBin;$env:Path"
}

$nandPath = (Resolve-Path -LiteralPath $Nand).Path.Replace("\", "/")
$machine = "bbk9288,nand-image=$nandPath"
if ($DirectKernelBoot -and $BootRom) {
    throw "-DirectKernelBoot cannot be combined with -BootRom"
}
if (-not $DirectKernelBoot -and [string]::IsNullOrWhiteSpace($BootRom)) {
    $BootRom = @(
        (Join-Path $PSScriptRoot "runtime\BOOT0.BIN"),
        (Join-Path $PSScriptRoot "BOOT0.BIN")
    ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($BootRom)) {
        throw "Native boot requires runtime\BOOT0.BIN; download and extract the native NAND release asset. Use -DirectKernelBoot only for legacy images."
    }
}
if (-not [string]::IsNullOrWhiteSpace($BootRom)) {
    if (-not (Test-Path -LiteralPath $BootRom -PathType Leaf)) {
        throw "找不到 9288 引导 ROM：$BootRom"
    }
    $BootRom = (Resolve-Path -LiteralPath $BootRom).Path.Replace("\", "/")
    if ([string]::IsNullOrWhiteSpace($NandId)) {
        $NandId = '0xADDA8015'
    }
}
if (-not [string]::IsNullOrWhiteSpace($NandId)) {
    $machine += ",nand-id=$NandId"
}
if (-not $NoAudio) {
    if ([string]::IsNullOrWhiteSpace($AudioPlayer)) {
        $AudioPlayer = @(
            (Join-Path $PSScriptRoot "ffplay.exe"),
            (Join-Path $PSScriptRoot "tools\ffplay.exe")
        ) | Where-Object {
            Test-Path -LiteralPath $_ -PathType Leaf
        } | Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($AudioPlayer)) {
            $ffplayCommand = Get-Command "ffplay.exe" -ErrorAction SilentlyContinue
            if ($null -ne $ffplayCommand) {
                $AudioPlayer = $ffplayCommand.Source
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($AudioPlayer) -or
        -not (Test-Path -LiteralPath $AudioPlayer -PathType Leaf)) {
        Write-Warning "未找到 ffplay.exe，声音播放已禁用；可用 -AudioPlayer 指定路径。"
    } else {
        $audioPlayerPath = (Resolve-Path -LiteralPath $AudioPlayer).Path.Replace("\", "/")
        $machine += ",audio-player=$audioPlayerPath"
    }
}
if ($TraceIo) {
    $machine += ",trace-io=on,trace-key-scan=on"
}
$qmpPort = Get-FreeTcpPort
$qemuArgs = @(
    "-M", $machine,
    "-cpu", "c33l05,exit-on-halt=off",
    "-display", "sdl",
    "-serial", "none",
    "-monitor", "none",
    "-qmp", "tcp:127.0.0.1:$qmpPort,server=on,wait=off",
    "-rtc", "base=localtime"
)
if (-not [string]::IsNullOrWhiteSpace($BootRom)) {
    $qemuArgs += @('-bios', $BootRom)
}
if ($TraceIo) {
    $logDir = Join-Path $PSScriptRoot "runtime\logs"
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
    $qemuArgs += @(
        "-d", "guest_errors,int",
        "-D", (Join-Path $logDir "bbk9288.log")
    )
}

$argumentLine = ($qemuArgs | ForEach-Object {
    Quote-ProcessArgument ([string]$_)
}) -join " "

Write-Host "正在启动步步高 BBK 9288 V1.5 模拟器……"
if (-not $NoSoftKeyboard) {
    Write-Host "53 键软键盘将自动打开（按键保持 $KeyHoldMs ms）；NAND 会在运行中增量保存。"
}

$qemuProcess = Start-Process -FilePath $qemu `
    -ArgumentList $argumentLine `
    -WorkingDirectory $PSScriptRoot `
    -PassThru

try {
    if ($NoSoftKeyboard) {
        $qemuProcess.WaitForExit()
    } else {
        & $softKeyboard -QmpPort $qmpPort `
            -QemuProcessId $qemuProcess.Id `
            -KeyHoldMs $KeyHoldMs
        if (-not $qemuProcess.HasExited) {
            $qemuProcess.WaitForExit(30000) | Out-Null
        }
    }
} finally {
    if (-not $qemuProcess.HasExited) {
        $qemuProcess.Kill()
        $qemuProcess.WaitForExit()
    }
}

exit $qemuProcess.ExitCode
