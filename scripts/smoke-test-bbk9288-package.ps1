param(
    [Parameter(Mandatory)]
    [string]$PackageDir,

    [ValidateRange(0, 99)]
    [int]$VncDisplay = 99
)

$ErrorActionPreference = "Stop"
$package = [System.IO.Path]::GetFullPath($PackageDir)
$qemu = Join-Path $package "qemu-system-s1c33.exe"
$python = Join-Path $package "python\python.exe"
$dataDir = Join-Path $package "share"
$stderr = Join-Path $package "package-smoke.stderr.log"
$port = 5900 + $VncDisplay
$required = @(
    $qemu,
    $python,
    (Join-Path $package "run-bbk9288-web.cmd"),
    (Join-Path $package "run-bbk9288-web.ps1"),
    (Join-Path $package "requirements-bbk9288.txt"),
    (Join-Path $package "README.md"),
    (Join-Path $package "web\dist\index.html"),
    (Join-Path $package "scripts\bbk9288_web_server.py"),
    (Join-Path $package "scripts\bbk9288s_nand_image.py"),
    (Join-Path $package "scripts\prepare_native_boot_nand.py"),
    (Join-Path $dataDir "keymaps\en-us")
)

foreach ($path in $required) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Package smoke test input is missing: $path"
    }
}

# Windows PowerShell 5.1 treats UTF-8 files without a BOM as the active ANSI
# code page. Keep the CMD entry point's PowerShell script ASCII-only so it is
# parsed identically on every supported Windows locale.
$launcher = Join-Path $package "run-bbk9288-web.ps1"
$nonAsciiLauncherBytes = [System.IO.File]::ReadAllBytes($launcher) |
    Where-Object { $_ -gt 0x7f }
if ($nonAsciiLauncherBytes) {
    throw "Packaged Web launcher must remain ASCII for Windows PowerShell 5.1"
}

$forbiddenNames = @("id_rsa", "kernel.bin", "nand-user.raw")
$forbidden = Get-ChildItem -LiteralPath $package -Recurse -File |
    Where-Object {
        $_.Name -in $forbiddenNames -or
        $_.Extension -in @(".raw", ".img")
    }
if ($forbidden) {
    throw "Forbidden release asset found: $($forbidden.FullName -join ', ')"
}

if (Select-String -LiteralPath (Join-Path $package "README.md") `
        -Pattern "9288S" -CaseSensitive:$false -Quiet) {
    throw "Packaged README must only describe BBK 9288"
}

$machineList = & $qemu -L $dataDir -machine help 2>&1
$machineText = $machineList -join "`n"
if ($LASTEXITCODE -ne 0 -or $machineText -notmatch "(?m)^bbk9288\s") {
    throw "Packaged QEMU does not expose the bbk9288 machine"
}

& $python -c "import pyfatfs, fs"
if ($LASTEXITCODE -ne 0) {
    throw "Bundled Python dependencies failed import validation"
}

& $python -m py_compile `
    (Join-Path $package "scripts\bbk9288_web_server.py") `
    (Join-Path $package "scripts\bbk9288s_nand_image.py") `
    (Join-Path $package "scripts\prepare_native_boot_nand.py")
if ($LASTEXITCODE -ne 0) {
    throw "Packaged Python scripts failed syntax validation"
}

& $python (Join-Path $package "scripts\bbk9288_web_server.py") --help `
    *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Bundled Web server failed startup import validation"
}

if (Get-NetTCPConnection -State Listen -LocalPort $port `
        -ErrorAction SilentlyContinue) {
    throw "Package smoke test TCP port is already in use: $port"
}

$arguments = @(
    "-L", "share",
    "-machine", "none",
    "-display", "vnc=127.0.0.1:$VncDisplay",
    "-serial", "none",
    "-monitor", "none"
)
$process = Start-Process `
    -FilePath $qemu `
    -ArgumentList $arguments `
    -WorkingDirectory $package `
    -WindowStyle Hidden `
    -RedirectStandardError $stderr `
    -PassThru

try {
    $ready = $false
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline) {
        $process.Refresh()
        if ($process.HasExited) {
            $details = Get-Content -LiteralPath $stderr -Raw `
                -ErrorAction SilentlyContinue
            throw "Packaged QEMU exited with code $($process.ExitCode):`n$details"
        }
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $client.Connect("127.0.0.1", $port)
            $client.Dispose()
            $ready = $true
            break
        } catch {
            if ($client) {
                $client.Dispose()
            }
            Start-Sleep -Milliseconds 100
        }
    }
    if (-not $ready) {
        $details = Get-Content -LiteralPath $stderr -Raw `
            -ErrorAction SilentlyContinue
        throw "Packaged QEMU VNC did not start on port ${port}:`n$details"
    }
    Write-Host "Packaged BBK 9288 Web build passed smoke testing"
} finally {
    $process.Refresh()
    if (-not $process.HasExited) {
        Stop-Process -Id $process.Id
        Wait-Process -Id $process.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $stderr -ErrorAction SilentlyContinue
}
