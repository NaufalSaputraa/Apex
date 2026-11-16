$ErrorActionPreference = "Stop"

Write-Host "1. Building Apex Island release binary..." -ForegroundColor Cyan
npm run tauri build -- --no-bundle

$exePath = "src-tauri\target\release\tauri-app.exe"
if (-not (Test-Path $exePath)) {
    throw "Release executable not found at $exePath"
}

$staging = "src-tauri\target\msix-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path "$staging\Assets" | Out-Null

Copy-Item $exePath "$staging\tauri-app.exe"
Copy-Item "src-tauri\AppxManifest.xml" "$staging\AppxManifest.xml"
Copy-Item "src-tauri\icons\StoreLogo.png" "$staging\Assets\StoreLogo.png"
Copy-Item "src-tauri\icons\Square150x150Logo.png" "$staging\Assets\Square150x150Logo.png"
Copy-Item "src-tauri\icons\Square44x44Logo.png" "$staging\Assets\Square44x44Logo.png"

$sdkBin = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64" | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
$makeappx = Join-Path $sdkBin "makeappx.exe"
$signtool = Join-Path $sdkBin "signtool.exe"

$msixOut = "src-tauri\target\release\ApexIsland_0.1.0_x64.msix"
Write-Host "2. Packaging MSIX -> $msixOut" -ForegroundColor Cyan
& $makeappx pack /d $staging /p $msixOut /o

$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq "CN=ApexIslandDev" } | Select-Object -First 1
if (-not $cert) {
    Write-Host "3. Creating local self-signed dev certificate (CN=ApexIslandDev)..." -ForegroundColor Yellow
    $cert = New-SelfSignedCertificate -Type Custom -Subject "CN=ApexIslandDev" -KeyUsage DigitalSignature -FriendlyName "Apex Island Dev" -CertStoreLocation "Cert:\CurrentUser\My" -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
}

$pfxPath = "src-tauri\target\apex-dev.pfx"
$pwd = ConvertTo-SecureString -String "apex-dev" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $pwd | Out-Null

Write-Host "4. Signing MSIX package..." -ForegroundColor Cyan
& $signtool sign /fd SHA256 /f $pfxPath /p "apex-dev" $msixOut

Write-Host "`nDone! Install the certificate into TrustedPeople (Admin) and double-click $msixOut to install with full OS Notification Listener support." -ForegroundColor Green
