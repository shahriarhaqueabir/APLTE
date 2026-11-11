$ErrorActionPreference = 'Stop'

# Chrome for Testing publishes no SHA256SUMS for these builds (both
# /<version>/SHA256SUMS and /<version>/win64/SHA256SUMS return 404), so integrity
# is trust-on-first-use: the hash is recorded on the first download and every
# later fetch must match it. Change $Version deliberately, and delete the pin
# file in the same commit so the change is visible in review.

$Version = '157.0.8103.38'

$Root     = Split-Path -Parent $PSScriptRoot
$BinDir   = Join-Path $Root 'bin'
$ZipPath  = Join-Path $BinDir 'chromedriver-win64.zip'
$ExePath  = Join-Path $BinDir 'chromedriver.exe'
$PinFile  = Join-Path $PSScriptRoot 'chromedriver.sha256'
$Url      = "https://storage.googleapis.com/chrome-for-testing-public/$Version/win64/chromedriver-win64.zip"

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

if (-not (Test-Path $ZipPath)) {
    Write-Output "downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath -UseBasicParsing
}

$Actual = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLower()

if (Test-Path $PinFile) {
    $Expected = (Get-Content $PinFile -Raw).Trim().ToLower()
    if ($Expected -ne $Actual) {
        throw "checksum mismatch: pinned $Expected but downloaded $Actual. Refusing to extract."
    }
    Write-Output "checksum matches pin: $Actual"
} else {
    Set-Content -Path $PinFile -Value $Actual -NoNewline
    Write-Output "first fetch, pinned checksum: $Actual"
}

if (-not (Test-Path $ExePath)) {
    Expand-Archive -Path $ZipPath -DestinationPath $BinDir -Force
    $Nested = Join-Path $BinDir 'chromedriver-win64\chromedriver.exe'
    if (Test-Path $Nested) {
        Move-Item -Path $Nested -Destination $ExePath -Force
        Remove-Item -Path (Join-Path $BinDir 'chromedriver-win64') -Recurse -Force
    }
    Remove-Item -Path $ZipPath -Force
}

Write-Output ("chromedriver: " + (& $ExePath --version))
