Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

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

function Find-CommandPath([string[]]$Names) {
    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            return $command.Source
        }
    }

    return $null
}

function Add-PathIfExists([string]$Candidate) {
    if ((Test-Path $Candidate) -and ($env:Path -notlike "*$Candidate*")) {
        $env:Path = "$Candidate;$env:Path"
    }
}

function Add-DepToolPaths {
    $depRoot = Join-Path $projectRoot "dep"
    Add-PathIfExists (Join-Path $depRoot "python\venv\Scripts")
    Add-PathIfExists (Join-Path $depRoot "bin")
    Add-PathIfExists (Join-Path $depRoot "cargo\bin")
    Add-PathIfExists (Join-Path $depRoot "tools\pandoc")

    $patterns = @(
        (Join-Path $depRoot "tools\*\bin"),
        (Join-Path $depRoot "tools\*\program"),
        (Join-Path $depRoot "tools\*\Library\bin"),
        (Join-Path $depRoot "tools\*\miktex\bin\x64")
    )

    foreach ($pattern in $patterns) {
        $dirs = @(Get-ChildItem -Path $pattern -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
        foreach ($dir in $dirs) {
            Add-PathIfExists $dir
        }
    }
}

Refresh-PathFromRegistry
Add-DepToolPaths

$venvScripts = Join-Path $projectRoot "dep\python\venv\Scripts"
if (Test-Path $venvScripts) {
    if ($env:Path -notlike "*$venvScripts*") {
        $env:Path = "$venvScripts;$env:Path"
    }
    Write-Host "Using project Python venv: $venvScripts" -ForegroundColor Cyan
} else {
    Write-Host "[WARN] dep\python\venv not found. Run .\setup.bat first." -ForegroundColor Yellow
}

$cargoBin = Join-Path $projectRoot "dep\cargo\bin"
if (-not (Test-Path $cargoBin)) {
    $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
}
if ((Test-Path $cargoBin) -and ($env:Path -notlike "*$cargoBin*")) {
    $env:Path = "$cargoBin;$env:Path"
}


$globalNodeBin = Join-Path $env:ProgramFiles "nodejs"
if ((Test-Path $globalNodeBin) -and ($env:Path -notlike "*$globalNodeBin*")) {
    $env:Path = "$globalNodeBin;$env:Path"
}

$npmCommand = Find-CommandPath @("npm.cmd", "npm")
if ($null -eq $npmCommand) {
    throw "npm not found. Please install Node.js and rerun .\\setup.bat."
}

Write-Host "Starting DocHub in development mode..." -ForegroundColor Green
& $npmCommand run tauri dev
