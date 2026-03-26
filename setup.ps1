param(
    [switch]$PauseAtEnd,
    [switch]$NoGlobalToolFallback,
    [switch]$PreferLocalOfficeOcr
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Write-Info([string]$Message) { Write-Host "[INFO] $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "[OK]   $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN] $Message" -ForegroundColor Yellow }

function Wait-AtEnd {
    if (-not $PauseAtEnd) {
        return
    }

    Write-Host ""
    Read-Host "Press Enter to close this window" | Out-Null
}

function Add-PathIfExists([string]$Candidate) {
    if ((Test-Path $Candidate) -and ($env:Path -notlike "*$Candidate*")) {
        $env:Path = "$Candidate;$env:Path"
    }
}

function Add-DirectoryToUserPathIfExists([string]$Candidate, [string]$Label) {
    if (-not (Test-Path $Candidate)) {
        return
    }

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $parts = @()
    if (-not [string]::IsNullOrWhiteSpace($userPath)) {
        $parts = @($userPath -split ';' | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    }

    $exists = $false
    foreach ($part in $parts) {
        if ($part.TrimEnd('\\') -ieq $Candidate.TrimEnd('\\')) {
            $exists = $true
            break
        }
    }

    if ($exists) {
        Write-Ok "$Label is already in user PATH"
        return
    }

    $newParts = New-Object System.Collections.Generic.List[string]
    $newParts.Add($Candidate) | Out-Null
    foreach ($part in $parts) {
        if ($part.TrimEnd('\\') -ieq $Candidate.TrimEnd('\\')) {
            continue
        }
        $newParts.Add($part) | Out-Null
    }

    [Environment]::SetEnvironmentVariable("Path", ($newParts -join ';'), "User")
    Add-PathIfExists $Candidate
    Write-Ok "Added $Label to user PATH"
}

function Test-CommandExists([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-ExecutablePath([string]$Name) {
    $preferredLocalMap = @{
        python = @(
            (Join-Path $projectRoot "dep\python\venv\Scripts\python.exe")
        )
        pandoc = @(
            (Join-Path $projectRoot "dep\tools\pandoc\pandoc.exe")
        )
    }

    if ($preferredLocalMap.ContainsKey($Name)) {
        foreach ($candidate in $preferredLocalMap[$Name]) {
            if (Test-Path $candidate) {
                return $candidate
            }
        }
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        return $command.Source
    }

    $candidateMap = @{
        tesseract = @(
            "$env:ProgramFiles\Tesseract-OCR\tesseract.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\UB-Mannheim.TesseractOCR_*\tesseract.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\tesseract-ocr.tesseract_*\tesseract.exe"
        )
        soffice = @(
            "$env:ProgramFiles\LibreOffice\program\soffice.exe",
            "$env:ProgramFiles(x86)\LibreOffice\program\soffice.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\TheDocumentFoundation.LibreOffice_*\LibreOffice\program\soffice.exe"
        )
        ffmpeg = @(
            "$env:ProgramFiles\ffmpeg\bin\ffmpeg.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin\ffmpeg.exe"
        )
        pandoc = @(
            "$env:ProgramFiles\Pandoc\pandoc.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\JohnMacFarlane.Pandoc_*\pandoc.exe"
        )
        pdftoppm = @(
            "$env:ProgramFiles\poppler\Library\bin\pdftoppm.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\oschwartz10612.Poppler_*\Library\bin\pdftoppm.exe"
        )
        wkhtmltopdf = @(
            "$env:ProgramFiles\wkhtmltopdf\bin\wkhtmltopdf.exe",
            "$env:ProgramFiles(x86)\wkhtmltopdf\bin\wkhtmltopdf.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\wkhtmltopdf.wkhtmltox_*\wkhtmltopdf\bin\wkhtmltopdf.exe"
        )
        xelatex = @(
            "$env:ProgramFiles\MiKTeX\miktex\bin\x64\xelatex.exe",
            "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64\xelatex.exe"
        )
    }

    $candidates = $candidateMap[$Name]
    if ($null -eq $candidates) {
        return $null
    }

    foreach ($candidate in $candidates) {
        if ($candidate.Contains('*')) {
            $resolved = Get-ChildItem -Path $candidate -File -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName -First 1
            if ($resolved) {
                return $resolved
            }
            continue
        }

        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Add-ExecutableDirectoryToPath([string]$Name) {
    $resolved = Resolve-ExecutablePath $Name
    if ([string]::IsNullOrWhiteSpace($resolved)) {
        return
    }

    $parent = Split-Path -Parent $resolved
    Add-PathIfExists $parent
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)][bool]$Required = $false
    )

    $listOutput = & winget list --exact --id $Id --accept-source-agreements 2>$null | Out-String
    if ($LASTEXITCODE -eq 0 -and $listOutput -match [regex]::Escape($Id)) {
        Write-Ok "$Name already installed ($Id)"
        return
    }

    Write-Info "Installing $Name ($Id)..."
    & winget install --id $Id --exact --accept-package-agreements --accept-source-agreements --silent

    if ($LASTEXITCODE -ne 0) {
        if ($Required) {
            throw "Failed to install required package: $Name ($Id)."
        }
        Write-Warn "Failed to install optional package: $Name ($Id). You can install it manually later."
        return
    }

    Write-Ok "$Name installed"
}

function Get-GitHubLatestAssetUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$AssetRegex
    )

    $apiUrl = "https://api.github.com/repos/$Repo/releases/latest"
    $headers = @{ "User-Agent" = "FormatFlex-Setup" }
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers
    foreach ($asset in @($release.assets)) {
        if ($asset.name -match $AssetRegex) {
            return $asset.browser_download_url
        }
    }

    throw "No matching asset found for $Repo with regex: $AssetRegex"
}

function Get-GitHubReleaseAssetUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Repo,
        [Parameter(Mandatory = $true)][string]$AssetRegex,
        [Parameter(Mandatory = $false)][int]$MaxReleases = 30
    )

    $apiUrl = "https://api.github.com/repos/$Repo/releases?per_page=$MaxReleases"
    $headers = @{ "User-Agent" = "FormatFlex-Setup" }
    $releases = Invoke-RestMethod -Uri $apiUrl -Headers $headers

    foreach ($release in @($releases)) {
        foreach ($asset in @($release.assets)) {
            if ($asset.name -match $AssetRegex) {
                return $asset.browser_download_url
            }
        }
    }

    throw "No matching asset found across releases for $Repo with regex: $AssetRegex"
}

function Install-ArchiveToolToDep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][string]$ExpectedExe,
        [Parameter(Mandatory = $false)][string]$ExeSubPath = "",
        [Parameter(Mandatory = $false)][string]$ArchiveType = "auto"
    )

    $depRoot = Join-Path $projectRoot "dep"
    $cacheDir = Join-Path $depRoot "cache"
    $tmpDir = Join-Path $cacheDir ("extract_" + $Name)
    $effectiveArchiveType = $ArchiveType
    if ($effectiveArchiveType -eq "auto") {
        if ($Url -match "\.7z($|\?)") {
            $effectiveArchiveType = "7z"
        }
        else {
            $effectiveArchiveType = "zip"
        }
    }

    $archiveExt = if ($effectiveArchiveType -eq "7z") { "7z" } else { "zip" }
    $archivePath = Join-Path $cacheDir ("$Name.$archiveExt")

    if ((Test-Path $TargetDir) -and (Test-Path (Join-Path $TargetDir $ExpectedExe))) {
        Write-Ok "$Name already exists in dep\\tools"
        return $true
    }

    Write-Info "Installing local $Name to dep\\tools"
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null

    if (Test-Path $tmpDir) {
        Remove-Item -Recurse -Force $tmpDir
    }

    try {
        Write-Info "Downloading $Name"
        Invoke-WebRequest -Uri $Url -OutFile $archivePath

        New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

        if ($effectiveArchiveType -eq "zip") {
            Expand-Archive -Path $archivePath -DestinationPath $tmpDir -Force
        }
        elseif ($effectiveArchiveType -eq "7z") {
            & tar -xf $archivePath -C $tmpDir
            if ($LASTEXITCODE -ne 0) {
                throw "$Name archive extraction failed: tar exit code $LASTEXITCODE"
            }
        }
        else {
            throw "Unsupported archive type: $effectiveArchiveType"
        }

        $root = Get-ChildItem -Path $tmpDir -Directory | Select-Object -First 1
        if ($null -eq $root) {
            throw "$Name archive extraction failed"
        }

        if (Test-Path $TargetDir) {
            Remove-Item -Recurse -Force $TargetDir
        }
        New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

        $sourceBase = $root.FullName
        if (-not [string]::IsNullOrWhiteSpace($ExeSubPath)) {
            $subPath = Join-Path $root.FullName $ExeSubPath
            if (Test-Path $subPath) {
                $sourceBase = $subPath
            }
        }

        Copy-Item -Path (Join-Path $sourceBase "*") -Destination $TargetDir -Recurse -Force

        if (-not (Test-Path (Join-Path $TargetDir $ExpectedExe))) {
            throw "$Name installation incomplete: missing $ExpectedExe"
        }

        Write-Ok "$Name installed locally"
        return $true
    }
    finally {
        if (Test-Path $tmpDir) {
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
        }
    }

    return $false
}

function Install-ExeToolToDep {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$TargetDir,
        [Parameter(Mandatory = $true)][string]$ExpectedExe,
        [Parameter(Mandatory = $false)][string[]]$InstallerArgs = @("/S")
    )

    if ((Test-Path $TargetDir) -and (Test-Path (Join-Path $TargetDir $ExpectedExe))) {
        Write-Ok "$Name already exists in dep\\tools"
        return $true
    }

    $depRoot = Join-Path $projectRoot "dep"
    $cacheDir = Join-Path $depRoot "cache"
    $installerPath = Join-Path $cacheDir ("$Name-installer.exe")

    Write-Info "Installing local $Name via installer"
    New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
    New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null

    Write-Info "Downloading $Name installer"
    Invoke-WebRequest -Uri $Url -OutFile $installerPath

    $targetArg = "/D=$TargetDir"
    $arguments = @()
    $arguments += $InstallerArgs
    $arguments += $targetArg

    $process = Start-Process -FilePath $installerPath -ArgumentList $arguments -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "$Name installer exited with code $($process.ExitCode)"
    }

    if (-not (Test-Path (Join-Path $TargetDir $ExpectedExe))) {
        throw "$Name installation incomplete: missing $ExpectedExe"
    }

    Write-Ok "$Name installed locally"
    return $true
}

function Install-LocalTools {
    $status = @{
        ffmpeg = $false
        pandoc = $false
        poppler = $false
        wkhtmltopdf = $false
    }

    $toolsRoot = Join-Path $projectRoot "dep\tools"
    New-Item -ItemType Directory -Force -Path $toolsRoot | Out-Null

    try {
        $ffmpegUrl = Get-GitHubLatestAssetUrl -Repo "BtbN/FFmpeg-Builds" -AssetRegex "win64-gpl.*\.zip$"
        $status.ffmpeg = Install-ArchiveToolToDep -Name "ffmpeg" -Url $ffmpegUrl -TargetDir (Join-Path $toolsRoot "ffmpeg") -ExpectedExe "bin\ffmpeg.exe"
    }
    catch {
        Write-Warn "Local FFmpeg install failed: $($_.Exception.Message)"
    }

    try {
        $pandocUrl = Get-GitHubLatestAssetUrl -Repo "jgm/pandoc" -AssetRegex "windows-x86_64\.zip$"
        $status.pandoc = Install-ArchiveToolToDep -Name "pandoc" -Url $pandocUrl -TargetDir (Join-Path $toolsRoot "pandoc") -ExpectedExe "pandoc.exe"
    }
    catch {
        Write-Warn "Local Pandoc install failed: $($_.Exception.Message)"
    }

    try {
        $popplerUrl = Get-GitHubLatestAssetUrl -Repo "oschwartz10612/poppler-windows" -AssetRegex "\.zip$"
        $status.poppler = Install-ArchiveToolToDep -Name "poppler" -Url $popplerUrl -TargetDir (Join-Path $toolsRoot "poppler") -ExpectedExe "Library\bin\pdftoppm.exe"
    }
    catch {
        Write-Warn "Local Poppler install failed: $($_.Exception.Message)"
    }

    try {
        $wkhtmlUrl = Get-GitHubLatestAssetUrl -Repo "wkhtmltopdf/packaging" -AssetRegex "win64.*\.zip$"
        $status.wkhtmltopdf = Install-ArchiveToolToDep -Name "wkhtmltopdf" -Url $wkhtmlUrl -TargetDir (Join-Path $toolsRoot "wkhtmltopdf") -ExpectedExe "bin\wkhtmltopdf.exe"
    }
    catch {
        Write-Warn "Latest wkhtmltopdf zip not found, trying historical Windows 7z package"
        try {
            $wkhtml7zUrl = Get-GitHubReleaseAssetUrl -Repo "wkhtmltopdf/packaging" -AssetRegex "mxe-cross-win64\.7z$"
            $status.wkhtmltopdf = Install-ArchiveToolToDep -Name "wkhtmltopdf" -Url $wkhtml7zUrl -TargetDir (Join-Path $toolsRoot "wkhtmltopdf") -ExpectedExe "bin\wkhtmltopdf.exe" -ArchiveType "7z"
        }
        catch {
            Write-Warn "Local wkhtmltopdf install failed: $($_.Exception.Message)"
        }
    }

    return $status
}

function Install-GlobalFallbackForLocalTools($localStatus) {
    if ($NoGlobalToolFallback) {
        Write-Warn "Global fallback for local tools is disabled by -NoGlobalToolFallback"
        return
    }

    $needFallback = @()
    foreach ($name in @("ffmpeg", "pandoc", "poppler", "wkhtmltopdf")) {
        if (-not $localStatus[$name]) {
            $needFallback += $name
        }
    }

    if ($needFallback.Count -eq 0) {
        return
    }

    Write-Warn "Some local tools failed, falling back to winget: $($needFallback -join ', ')"

    if ($needFallback -contains "ffmpeg") {
        Install-WingetPackage -Id "Gyan.FFmpeg" -Name "FFmpeg"
    }
    if ($needFallback -contains "pandoc") {
        Install-WingetPackage -Id "JohnMacFarlane.Pandoc" -Name "Pandoc"
    }
    if ($needFallback -contains "poppler") {
        Install-WingetPackage -Id "oschwartz10612.Poppler" -Name "Poppler"
    }
    if ($needFallback -contains "wkhtmltopdf") {
        Install-WingetPackage -Id "wkhtmltopdf.wkhtmltox" -Name "wkhtmltopdf"
    }
}

function Install-LocalTesseract {
    $targetDir = Join-Path $projectRoot "dep\tools\tesseract"
    $expectedExe = Join-Path $targetDir "tesseract.exe"

    if (Test-Path $expectedExe) {
        Write-Ok "tesseract already exists in dep\\tools"
        return $true
    }

    $sourceExe = Resolve-ExecutablePath "tesseract"
    if ([string]::IsNullOrWhiteSpace($sourceExe) -or ($sourceExe -like "$projectRoot*")) {
        Write-Warn "No system tesseract found for local copy"
        return $false
    }

    try {
        $sourceDir = Split-Path -Parent $sourceExe
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Copy-Item -Path (Join-Path $sourceDir "*") -Destination $targetDir -Recurse -Force

        if (-not (Test-Path $expectedExe)) {
            throw "copy completed but tesseract.exe not found in dep\\tools"
        }

        Write-Ok "tesseract copied to dep\\tools"
        return $true
    }
    catch {
        Write-Warn "Local tesseract copy failed: $($_.Exception.Message)"
        return $false
    }
}

function Install-LocalLibreOffice {
    $targetDir = Join-Path $projectRoot "dep\tools\libreoffice"
    $expectedExeDirect = Join-Path $targetDir "program\soffice.exe"
    $expectedExeNested = Join-Path $targetDir "LibreOffice\program\soffice.exe"

    if ((Test-Path $expectedExeDirect) -or (Test-Path $expectedExeNested)) {
        Write-Ok "libreoffice already exists in dep\\tools"
        return $true
    }

    $sourceExe = Resolve-ExecutablePath "soffice"
    if ([string]::IsNullOrWhiteSpace($sourceExe) -or ($sourceExe -like "$projectRoot*")) {
        Write-Warn "No system LibreOffice found for local copy"
        return $false
    }

    try {
        $sourceProgramDir = Split-Path -Parent $sourceExe
        $sourceRoot = Split-Path -Parent $sourceProgramDir
        New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
        Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $targetDir -Recurse -Force

        if (-not ((Test-Path $expectedExeDirect) -or (Test-Path $expectedExeNested))) {
            throw "copy completed but soffice.exe not found in dep\\tools"
        }

        Write-Ok "LibreOffice copied to dep\\tools"
        return $true
    }
    catch {
        Write-Warn "Local LibreOffice copy failed: $($_.Exception.Message)"
        return $false
    }
}

function Install-OfficeOcrDependencies {
    if (-not $PreferLocalOfficeOcr) {
        Install-WingetPackage -Id "UB-Mannheim.TesseractOCR" -Name "Tesseract OCR"
        Install-WingetPackage -Id "TheDocumentFoundation.LibreOffice" -Name "LibreOffice"
        return
    }

    $tesseractLocalOk = Install-LocalTesseract
    $libreOfficeLocalOk = Install-LocalLibreOffice

    if ($tesseractLocalOk -and $libreOfficeLocalOk) {
        return
    }

    if ($NoGlobalToolFallback) {
        Write-Warn "Global fallback for local office/OCR tools is disabled by -NoGlobalToolFallback"
        return
    }

    if (-not $tesseractLocalOk) {
        Install-WingetPackage -Id "UB-Mannheim.TesseractOCR" -Name "Tesseract OCR"
        $tesseractLocalOk = Install-LocalTesseract
    }
    if (-not $libreOfficeLocalOk) {
        Install-WingetPackage -Id "TheDocumentFoundation.LibreOffice" -Name "LibreOffice"
        $libreOfficeLocalOk = Install-LocalLibreOffice
    }

    if (-not $tesseractLocalOk) {
        Write-Warn "tesseract is still not available in dep\\tools after fallback"
    }
    if (-not $libreOfficeLocalOk) {
        Write-Warn "LibreOffice is still not available in dep\\tools after fallback"
    }
}

function Find-CommandPath([string[]]$Names) {
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }

    return $null
}

function Remove-PathIfExists([string]$PathToRemove, [string]$Label) {
    if (-not (Test-Path $PathToRemove)) {
        return
    }

    Write-Info "Removing $Label"
    Remove-Item -Recurse -Force $PathToRemove
}

function Refresh-PathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "Process")

    $segments = New-Object System.Collections.Generic.List[string]
    foreach ($item in @($currentPath, $machinePath, $userPath)) {
        if ([string]::IsNullOrWhiteSpace($item)) {
            continue
        }

        foreach ($seg in ($item -split ';')) {
            if ([string]::IsNullOrWhiteSpace($seg)) {
                continue
            }
            $trimmed = $seg.Trim()
            if (-not ($segments.Contains($trimmed))) {
                $segments.Add($trimmed)
            }
        }
    }

    $env:Path = ($segments -join ';')
}

function Refresh-CommonPaths {
    $candidates = @(
        (Join-Path $projectRoot "dep\python\venv\Scripts"),
        (Join-Path $projectRoot "dep\bin"),
        (Join-Path $projectRoot "dep\cargo\bin"),
        (Join-Path $projectRoot "dep\tools\pandoc"),
        (Join-Path $projectRoot "dep\tools\*\bin"),
        (Join-Path $projectRoot "dep\tools\*\program"),
        (Join-Path $projectRoot "dep\tools\*\Library\bin"),
        (Join-Path $projectRoot "dep\tools\*\miktex\bin\x64"),
        "$env:USERPROFILE\.cargo\bin",
        "$env:ProgramFiles\nodejs",
        "$env:LOCALAPPDATA\Programs\Python\Python312",
        "$env:LOCALAPPDATA\Programs\Python\Python311",
        "$env:LOCALAPPDATA\Programs\Python\Python310",
        "$env:LOCALAPPDATA\Programs\Python\Launcher",
        "$env:ProgramFiles\Tesseract-OCR",
        "$env:ProgramFiles\LibreOffice\program",
        "$env:ProgramFiles\Pandoc",
        "$env:ProgramFiles\wkhtmltopdf\bin",
        "$env:ProgramFiles\ffmpeg\bin",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-*\bin",
        "$env:ProgramFiles\MiKTeX\miktex\bin\x64",
        "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64",
        "$env:ProgramFiles\poppler\Library\bin"
    )

    foreach ($path in $candidates) {
        if ($path -like "*`**") {
            $resolved = @(Get-ChildItem -Path $path -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
            foreach ($r in $resolved) {
                Add-PathIfExists $r
            }
            continue
        }

        Add-PathIfExists $path
    }
}

function New-OrRepairVenv {
    $depRoot = Join-Path $projectRoot "dep"
    $pythonRoot = Join-Path $depRoot "python"
    $venvDir = Join-Path $pythonRoot "venv"
    $venvPython = Join-Path $venvDir "Scripts\python.exe"

    if ((Test-Path $venvDir) -and -not (Test-Path $venvPython)) {
        Write-Warn "Broken venv detected, recreating: $venvDir"
        Remove-Item -Recurse -Force $venvDir
    }

    if (-not (Test-Path $venvPython)) {
        New-Item -ItemType Directory -Force -Path $pythonRoot | Out-Null
        Write-Info "Creating Python venv at dep\python\venv"
        if (Test-CommandExists "py") {
            & py -3 -m venv $venvDir
        } elseif (Test-CommandExists "python") {
            & python -m venv $venvDir
        } else {
            throw "Python not found after installation. Please reopen terminal and rerun setup.ps1."
        }

        if ($LASTEXITCODE -ne 0) {
            throw "Failed to create virtual environment."
        }
    } else {
        Write-Ok "Using existing venv: dep\python\venv"
    }

    & $venvPython -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to upgrade pip in venv."
    }

    $requirements = Join-Path $projectRoot "python\requirements.txt"
    if (Test-Path $requirements) {
        Write-Info "Installing Python dependencies from python\requirements.txt"
        & $venvPython -m pip install -r $requirements
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install Python dependencies."
        }
    } else {
        Write-Warn "python\requirements.txt not found, skipping pip install"
    }

    $activateHelper = Join-Path $depRoot "activate.ps1"
    @"
Set-StrictMode -Version Latest
`$ErrorActionPreference = "Stop"
`$scriptDir = Split-Path -Parent `$MyInvocation.MyCommand.Path
`$activateScript = Join-Path `$scriptDir "python\venv\Scripts\Activate.ps1"
if (-not (Test-Path `$activateScript)) {
    throw "venv activation script not found: `$activateScript"
}
. `$activateScript
Write-Host "Python venv activated: `$env:VIRTUAL_ENV"
"@ | Set-Content -Path $activateHelper -Encoding UTF8

    Write-Ok "Python venv ready"
}

function Verify-Command([string]$Name) {
    $resolved = Resolve-ExecutablePath $Name
    if ([string]::IsNullOrWhiteSpace($resolved)) {
        Write-Warn "${Name}: not found"
        return
    }

    $versionOutput = $null
    try {
        $versionOutput = & $resolved "--version" 2>&1
    }
    catch {
        $versionOutput = $null
    }

    if (($null -eq $versionOutput -or @($versionOutput).Count -eq 0) -and $Name -eq "soffice") {
        try {
            $versionOutput = & $resolved "--headless" "--version" 2>&1
        }
        catch {
            $versionOutput = $null
        }
    }

    $version = ($versionOutput | Select-Object -First 1 | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($version)) {
        $version = $resolved
    }

    Write-Ok "${Name}: $version"
}

try {
    Write-Host ""
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host "  DocHub Windows Setup" -ForegroundColor Cyan
    Write-Host "=======================================" -ForegroundColor Cyan
    Write-Host ""

    if (-not (Test-CommandExists "winget")) {
        throw "winget is required. Install App Installer from Microsoft Store first."
    }

    Install-WingetPackage -Id "Python.Python.3.12" -Name "Python 3.12" -Required $true
    Install-WingetPackage -Id "Rustlang.Rustup" -Name "Rustup" -Required $true
    Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS" -Required $true
    Add-DirectoryToUserPathIfExists -Candidate (Join-Path $env:ProgramFiles "nodejs") -Label "Node.js"
    $localToolStatus = Install-LocalTools
    Install-GlobalFallbackForLocalTools $localToolStatus

    Install-OfficeOcrDependencies
    Install-WingetPackage -Id "MiKTeX.MiKTeX" -Name "MiKTeX (xelatex)"

    Refresh-PathFromRegistry
    Refresh-CommonPaths
    Add-ExecutableDirectoryToPath "tesseract"
    Add-ExecutableDirectoryToPath "soffice"
    Add-ExecutableDirectoryToPath "ffmpeg"
    Add-ExecutableDirectoryToPath "pandoc"
    Add-ExecutableDirectoryToPath "pdftoppm"
    Add-ExecutableDirectoryToPath "wkhtmltopdf"
    Add-ExecutableDirectoryToPath "xelatex"

    function Enable-NpmPs1AndExecutionPolicy {
        Write-Info "Ensuring npm PowerShell shim is unblocked and CurrentUser execution policy allows scripts"
        $npmPs1 = Join-Path $env:APPDATA 'npm\npm.ps1'
        if (Test-Path $npmPs1) {
            try {
                Unblock-File -Path $npmPs1 -ErrorAction Stop
                Write-Ok "Unblocked $npmPs1"
            } catch {
                Write-Warn "Failed to unblock ${npmPs1}: $($_.Exception.Message)"
            }
        } else {
            Write-Info "npm.ps1 not found at $npmPs1; skipping Unblock-File"
        }

        try {
            $currentPolicy = Get-ExecutionPolicy -Scope CurrentUser -ErrorAction SilentlyContinue
        } catch {
            $currentPolicy = $null
        }

        if ($currentPolicy -in @('RemoteSigned','Unrestricted','Bypass')) {
            Write-Info "CurrentUser execution policy is $currentPolicy; leaving unchanged."
        } else {
            try {
                Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
                Write-Ok 'Set CurrentUser execution policy to RemoteSigned'
            } catch {
                Write-Warn "Failed to set execution policy for CurrentUser: $($_.Exception.Message)"
                Write-Warn "You can run: Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned"
            }
        }
    }

    Write-Info "Preparing project dependencies"
    New-OrRepairVenv

    # Ensure npm PowerShell shim and execution policy are ok before running npm
    Enable-NpmPs1AndExecutionPolicy

    $npmCommand = Find-CommandPath @("npm.cmd", "npm")
    if ($null -eq $npmCommand) {
        throw "npm not found in system PATH after Node.js installation."
    }

    Write-Info "Installing npm dependencies"
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed."
    }

    Write-Host ""
    Write-Info "Environment verification"
    Verify-Command "node"
    Verify-Command "npm.cmd"
    Verify-Command "rustc"
    Verify-Command "cargo"
    Verify-Command "python"
    Verify-Command "tesseract"
    Verify-Command "soffice"
    Verify-Command "ffmpeg"
    Verify-Command "pandoc"
    Verify-Command "pdftoppm"
    Verify-Command "wkhtmltopdf"
    Verify-Command "xelatex"

    Write-Host ""
    Write-Ok "Setup completed."
    Write-Host "Run the app with: .\run.bat"
}
finally {
    Wait-AtEnd
}
