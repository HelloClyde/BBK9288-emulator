param(
    [Parameter(Mandatory = $true)]
    [int]$QmpPort,
    [Parameter(Mandatory = $true)]
    [int]$QemuProcessId,
    [ValidateRange(50, 500)]
    [int]$KeyHoldMs = 120
)

# SPDX-License-Identifier: GPL-2.0-or-later

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:qmpClient = $null
$script:qmpReader = $null
$script:qmpWriter = $null
$script:qmpReady = $false
$script:qemuExited = $false
$script:shiftArmed = $false
$script:shiftButton = $null
$script:statusLabel = $null

function Connect-BbkQmp {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        $client = [System.Net.Sockets.TcpClient]::new()
        try {
            $client.Connect("127.0.0.1", $QmpPort)
            $script:qmpClient = $client
            break
        } catch {
            $client.Dispose()
            Start-Sleep -Milliseconds 100
        }
    }
    if ($null -eq $script:qmpClient -or -not $script:qmpClient.Connected) {
        throw "无法连接模拟器按键接口（QMP 端口 $QmpPort）。"
    }

    $stream = $script:qmpClient.GetStream()
    $stream.ReadTimeout = 5000
    $stream.WriteTimeout = 2000
    $script:qmpReader = [System.IO.StreamReader]::new(
        $stream, [System.Text.Encoding]::UTF8, $false, 4096, $true
    )
    $script:qmpWriter = [System.IO.StreamWriter]::new(
        $stream, [System.Text.UTF8Encoding]::new($false), 4096, $true
    )
    $script:qmpWriter.NewLine = "`n"
    $script:qmpWriter.AutoFlush = $true

    $greeting = $script:qmpReader.ReadLine()
    if ([string]::IsNullOrWhiteSpace($greeting)) {
        throw "模拟器没有返回 QMP 握手信息。"
    }
    $script:qmpWriter.WriteLine('{"execute":"qmp_capabilities"}')
    while ($true) {
        $line = $script:qmpReader.ReadLine()
        if ($null -eq $line) {
            throw "模拟器在 QMP 初始化期间断开连接。"
        }
        $message = $line | ConvertFrom-Json
        if ($message.PSObject.Properties.Name -contains "return") {
            break
        }
        if ($message.PSObject.Properties.Name -contains "error") {
            throw "模拟器拒绝 QMP 初始化：$line"
        }
    }
    $script:qmpReady = $true
}

function Invoke-BbkQmp {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Execute,
        [hashtable]$Arguments
    )

    if (-not $script:qmpReady) {
        return $null
    }

    $request = [ordered]@{ execute = $Execute }
    if ($null -ne $Arguments) {
        $request.arguments = $Arguments
    }
    $script:qmpWriter.WriteLine(($request | ConvertTo-Json -Compress -Depth 5))

    while ($true) {
        $line = $script:qmpReader.ReadLine()
        if ($null -eq $line) {
            throw "模拟器按键接口已断开。"
        }
        $message = $line | ConvertFrom-Json
        if ($message.PSObject.Properties.Name -contains "return") {
            return $message.return
        }
        if ($message.PSObject.Properties.Name -contains "error") {
            throw "模拟器返回错误：$line"
        }
    }
}

function Set-ShiftState {
    param([bool]$Armed)

    $script:shiftArmed = $Armed
    if ($null -ne $script:shiftButton) {
        $script:shiftButton.BackColor = if ($Armed) {
            [System.Drawing.Color]::FromArgb(255, 205, 92)
        } else {
            [System.Drawing.SystemColors]::Control
        }
    }
    if ($null -ne $script:statusLabel) {
        $script:statusLabel.Text = if ($Armed) {
            "Shift 已锁定：再按一个字母或数字发送组合键"
        } else {
            "已连接 BBK 9288 V1.5 · 按键保持 $KeyHoldMs ms"
        }
    }
}

function Send-BbkKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$QCode,
        [Parameter(Mandatory = $true)]
        [string]$Label
    )

    try {
        $command = $QCode
        if ($script:shiftArmed -and $QCode -match "^(?:[a-z]|[0-9])$") {
            $command = "shift-$QCode"
            Set-ShiftState $false
        }
        Invoke-BbkQmp -Execute "human-monitor-command" -Arguments @{
            "command-line" = "sendkey $command $KeyHoldMs"
        } | Out-Null
        if (-not $script:shiftArmed) {
            $script:statusLabel.Text = "已发送：$Label"
        }
    } catch {
        $script:statusLabel.Text = "按键发送失败：$($_.Exception.Message)"
        $script:qmpReady = $false
    }
}

function New-Key {
    param(
        [string]$Label,
        [string]$QCode,
        [int]$Width = 62,
        [string]$Mode = "key"
    )
    [pscustomobject]@{
        Label = $Label
        QCode = $QCode
        Width = $Width
        Mode = $Mode
    }
}

function Add-KeyRow {
    param(
        [System.Windows.Forms.FlowLayoutPanel]$HostPanel,
        [object[]]$Keys
    )

    $row = [System.Windows.Forms.FlowLayoutPanel]::new()
    $row.AutoSize = $false
    $row.Width = 1040
    $row.Height = 55
    $row.FlowDirection = [System.Windows.Forms.FlowDirection]::LeftToRight
    $row.WrapContents = $false
    $row.Padding = [System.Windows.Forms.Padding]::new(4, 3, 4, 3)
    $row.Margin = [System.Windows.Forms.Padding]::new(0)

    foreach ($key in $Keys) {
        $button = [System.Windows.Forms.Button]::new()
        $button.Text = $key.Label
        $button.Width = $key.Width
        $button.Height = 44
        $button.Margin = [System.Windows.Forms.Padding]::new(3)
        $button.Font = [System.Drawing.Font]::new(
            "Microsoft YaHei UI", 10, [System.Drawing.FontStyle]::Regular
        )
        $button.Tag = $key.QCode

        if ($key.Mode -eq "shift") {
            $script:shiftButton = $button
            $button.Add_Click({
                Set-ShiftState (-not $script:shiftArmed)
            })
        } else {
            $qcode = $key.QCode
            $label = $key.Label
            $button.Add_Click({
                Send-BbkKey -QCode $qcode -Label $label
            }.GetNewClosure())
        }
        [void]$row.Controls.Add($button)
    }
    [void]$HostPanel.Controls.Add($row)
}

Connect-BbkQmp

$form = [System.Windows.Forms.Form]::new()
$form.Text = "步步高 BBK 9288 — 53 键软键盘"
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$form.ClientSize = [System.Drawing.Size]::new(1050, 365)
$form.MinimumSize = [System.Drawing.Size]::new(1066, 404)
$form.MaximizeBox = $false
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::FixedSingle
$form.Font = [System.Drawing.Font]::new("Microsoft YaHei UI", 9)

$header = [System.Windows.Forms.Panel]::new()
$header.Location = [System.Drawing.Point]::new(0, 0)
$header.Size = [System.Drawing.Size]::new(1050, 48)

$title = [System.Windows.Forms.Label]::new()
$title.Text = "BBK 9288 原机布局 · 53 键"
$title.Location = [System.Drawing.Point]::new(14, 8)
$title.AutoSize = $true
$title.Font = [System.Drawing.Font]::new(
    "Microsoft YaHei UI", 14, [System.Drawing.FontStyle]::Bold
)
[void]$header.Controls.Add($title)

$script:statusLabel = [System.Windows.Forms.Label]::new()
$script:statusLabel.Text = "已连接 BBK 9288 V1.5 · 按键保持 $KeyHoldMs ms"
$script:statusLabel.Location = [System.Drawing.Point]::new(330, 15)
$script:statusLabel.Size = [System.Drawing.Size]::new(500, 24)
[void]$header.Controls.Add($script:statusLabel)

$closeButton = [System.Windows.Forms.Button]::new()
$closeButton.Text = "关闭模拟器"
$closeButton.Location = [System.Drawing.Point]::new(922, 9)
$closeButton.Size = [System.Drawing.Size]::new(112, 31)
$closeButton.Add_Click({ $form.Close() })
[void]$header.Controls.Add($closeButton)
[void]$form.Controls.Add($header)

$keyboard = [System.Windows.Forms.FlowLayoutPanel]::new()
$keyboard.Location = [System.Drawing.Point]::new(0, 48)
$keyboard.Size = [System.Drawing.Size]::new(1050, 317)
$keyboard.FlowDirection = [System.Windows.Forms.FlowDirection]::TopDown
$keyboard.WrapContents = $false
$keyboard.Padding = [System.Windows.Forms.Padding]::new(5, 3, 5, 3)
$keyboard.AutoScroll = $false
[void]$form.Controls.Add($keyboard)

$numberRow = @()
foreach ($number in @("1", "2", "3", "4", "5", "6", "7", "8", "9", "0")) {
    $numberRow += New-Key $number $number
}

$qRow = @()
foreach ($letter in @("Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P")) {
    $qRow += New-Key $letter $letter.ToLowerInvariant()
}
$qRow += New-Key "目录" "f12" 78

$aRow = @()
foreach ($letter in @("A", "S", "D", "F", "G", "H", "J", "K", "L")) {
    $aRow += New-Key $letter $letter.ToLowerInvariant()
}
$aRow += New-Key "发音" "f1" 78

$zRow = @(New-Key "Shift" "shift" 78 "shift")
foreach ($letter in @("Z", "X", "C", "V", "B", "N", "M")) {
    $zRow += New-Key $letter $letter.ToLowerInvariant()
}
$zRow += New-Key "上翻" "pgup" 78
$zRow += New-Key "下翻" "pgdn" 78

$functionRow = @(
    New-Key "帮助" "f11" 78
    New-Key "开始" "f5" 78
    New-Key "菜单" "f6" 78
    New-Key "退出" "esc" 78
    New-Key "删除" "delete" 78
    New-Key "输入法" "menu" 86
    New-Key "空格" "spc" 92
    New-Key "确定" "ret" 78
    New-Key "↑" "up" 54
    New-Key "←" "left" 54
    New-Key "↓" "down" 54
    New-Key "→" "right" 54
)

Add-KeyRow $keyboard $numberRow
Add-KeyRow $keyboard $qRow
Add-KeyRow $keyboard $aRow
Add-KeyRow $keyboard $zRow
Add-KeyRow $keyboard $functionRow

$keyCount = $numberRow.Count + $qRow.Count + $aRow.Count +
            $zRow.Count + $functionRow.Count
if ($keyCount -ne 53) {
    throw "软键盘布局错误：应为 53 键，实际为 $keyCount 键。"
}

$qemuProcess = Get-Process -Id $QemuProcessId -ErrorAction SilentlyContinue
$processTimer = [System.Windows.Forms.Timer]::new()
$processTimer.Interval = 500
$processTimer.Add_Tick({
    if ($null -eq $qemuProcess -or $qemuProcess.HasExited) {
        $script:qemuExited = $true
        $form.Close()
    }
})
$processTimer.Start()

$form.Add_FormClosed({
    $processTimer.Stop()
    if (-not $script:qemuExited -and $script:qmpReady) {
        try {
            Invoke-BbkQmp -Execute "quit" | Out-Null
        } catch {
            # QEMU normally closes the socket before replying to quit.
        }
    }
    $script:qmpReady = $false
    if ($null -ne $script:qmpWriter) {
        $script:qmpWriter.Dispose()
    }
    if ($null -ne $script:qmpReader) {
        $script:qmpReader.Dispose()
    }
    if ($null -ne $script:qmpClient) {
        $script:qmpClient.Dispose()
    }
})

[void]$form.ShowDialog()
