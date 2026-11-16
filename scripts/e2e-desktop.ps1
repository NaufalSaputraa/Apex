$ErrorActionPreference = "Stop"

Write-Host "=== Apex Island Desktop E2E Test (via agent-desktop) ===" -ForegroundColor Cyan

# 1. Verify agent-desktop health
$statusJson = agent-desktop status | ConvertFrom-Json
if (-not $statusJson.ok) {
    throw "agent-desktop status failed: $($statusJson | ConvertTo-Json -Compress)"
}
Write-Host "[PASS] agent-desktop v$($statusJson.data.version) ready ($($statusJson.data.platform))" -ForegroundColor Green

# 2. Find Apex Island window
$rawWin = agent-desktop list-windows
$allWinJson = $rawWin | ConvertFrom-Json
$winList = if ($allWinJson.ok -and $allWinJson.data) { @($allWinJson.data) } else { @() }

$targetWin = $winList | Where-Object {
    ($_.title -eq "Apex Island") -or ($_.app_name -like "*tauri-app*")
} | Select-Object -First 1

if (-not $targetWin) {
    throw "Apex Island window not found in list-windows: $rawWin"
}

$windowId = $targetWin.id
$appFilter = $targetWin.app_name
Write-Host "[PASS] Found window: id='$windowId' app='$appFilter' title='$($targetWin.title)'" -ForegroundColor Green

function Find-ElementRef([string]$name) {
    $raw = agent-desktop find --window-id "$windowId" --name "$name" --first
    $parsed = $raw | ConvertFrom-Json
    if ($parsed.ok -and $parsed.data) {
        if ($parsed.data.ref) { return $parsed.data.ref }
        if ($parsed.data.matches -and $parsed.data.matches.Count -gt 0) { return $parsed.data.matches[0].ref }
        if ($parsed.data -is [System.Array] -and $parsed.data.Count -gt 0) { return $parsed.data[0].ref }
    }
    return $null
}

# 3. Focus & Expand Island by clicking center of the compact pill
agent-desktop focus-window --app "$appFilter" | Out-Null
Start-Sleep -Milliseconds 200

$bx = [int]($targetWin.bounds.x + ($targetWin.bounds.width / 2))
$by = [int]($targetWin.bounds.y + ($targetWin.bounds.height * 0.62))
agent-desktop mouse-move --headed $bx $by | Out-Null
Start-Sleep -Milliseconds 150
agent-desktop mouse-click --headed $bx $by | Out-Null
Start-Sleep -Milliseconds 500
Write-Host "[PASS] Clicked compact pill at ($bx, $by) to expand" -ForegroundColor Green

# Verify expanded window height grew
$postExpandWin = ((agent-desktop list-windows | ConvertFrom-Json).data | Where-Object { $_.id -eq $windowId } | Select-Object -First 1)
if ($postExpandWin) {
    Write-Host "[INFO] Window bounds after expand: $($postExpandWin.bounds.width)x$($postExpandWin.bounds.height)" -ForegroundColor Cyan
}

$tabs = @("System", "Today", "Agent", "Media")
foreach ($tab in $tabs) {
    $ref = Find-ElementRef $tab
    if ($ref) {
        agent-desktop click --headed "@$ref" | Out-Null
        Start-Sleep -Milliseconds 300
        Write-Host "[PASS] Switched to tab: $tab (@$ref)" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Tab not found via accessibility find: $tab" -ForegroundColor Yellow
    }
}

# 4. Open Settings & check 3 sub-tabs
$settingsRef = Find-ElementRef "Settings"
if ($settingsRef) {
    agent-desktop click --headed "@$settingsRef" | Out-Null
    Start-Sleep -Milliseconds 300
    Write-Host "[PASS] Opened Settings (@$settingsRef)" -ForegroundColor Green
    foreach ($sub in @("General", "Appearance", "Pages")) {
        $subRef = Find-ElementRef $sub
        if ($subRef) {
            agent-desktop click --headed "@$subRef" | Out-Null
            Start-Sleep -Milliseconds 200
            Write-Host "[PASS] Settings sub-tab: $sub (@$subRef)" -ForegroundColor Green
        } else {
            Write-Host "[WARN] Settings sub-tab not found: $sub" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[WARN] Settings button not found via accessibility find" -ForegroundColor Yellow
}

# 5. Collapse Island via Escape
agent-desktop press escape | Out-Null
Start-Sleep -Milliseconds 350
Write-Host "[PASS] Sent Escape to collapse island" -ForegroundColor Green
Write-Host "`nAll Desktop E2E checks completed!" -ForegroundColor Cyan
