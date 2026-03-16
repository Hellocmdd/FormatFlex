param(
    [switch]$Force,
    [switch]$SelectGlobalDeps,
    [switch]$RemoveGlobalDeps,
    [switch]$GlobalOnly,
    [string]$SelectedGlobalIds = "",
    [switch]$PauseAtEnd
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$script:FailedPackages = New-Object System.Collections.Generic.List[string]

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

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Start-ElevatedGlobalUninstall([string[]]$SelectedIds) {
    if (Test-IsAdministrator) {
        return $false
    }

    Write-Warn "Administrator privileges are required to remove selected global dependencies."
    $args = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", ('"' + $PSCommandPath + '"'),
        "-GlobalOnly",
        "-RemoveGlobalDeps",
        "-Force"
    )
    if (@($SelectedIds).Count -gt 0) {
        $args += "-SelectedGlobalIds"
        $args += ('"' + ($SelectedIds -join ",") + '"')
    }
    # Keep the elevated child window open so users can review global uninstall results.
    $args += "-PauseAtEnd"

    Start-Process -FilePath "powershell.exe" -ArgumentList $args -Verb RunAs | Out-Null
    return $true
}

function Test-CommandExists([string]$Name) {
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-WingetPackageInstalled([string]$Id) {
    $listOutput = & winget list --exact --id $Id --accept-source-agreements 2>$null | Out-String
    return $LASTEXITCODE -eq 0 -and $listOutput -match [regex]::Escape($Id)
}

function Stop-KnownProcesses {
    $processNames = @("node", "esbuild", "soffice", "soffice.bin", "ffmpeg", "wkhtmltopdf", "cargo", "rustc")
    foreach ($name in $processNames) {
        $processes = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
        if ($processes.Count -eq 0) {
            continue
        }

        Write-Info "Stopping running process: $name"
        $processes | Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-WingetUninstall([string[]]$Arguments) {
    & winget uninstall @Arguments
    return $LASTEXITCODE
}

function Test-WingetPackageRemoved([string]$Id) {
    Start-Sleep -Milliseconds 600
    return -not (Test-WingetPackageInstalled $Id)
}

function Uninstall-WingetPackage {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $false)][bool]$Required = $false
    )

    if (-not (Test-WingetPackageInstalled $Id)) {
        Write-Info "$Name not installed or not managed by winget, skipping"
        return
    }

    Write-Info "Uninstalling $Name ($Id)..."
    $baseArgs = @("--id", $Id, "--exact", "--accept-source-agreements")
    $exitCode = Invoke-WingetUninstall ($baseArgs + @("--silent"))

    if ($exitCode -eq 0 -or (Test-WingetPackageRemoved $Id)) {
        Write-Ok "$Name removed"
        return
    }

    if ($exitCode -ne 0) {
        Write-Warn "Silent uninstall failed for $Name ($Id), retrying interactive uninstall"
        $exitCode = Invoke-WingetUninstall $baseArgs
    }

    if ($exitCode -eq 0 -or (Test-WingetPackageRemoved $Id)) {
        Write-Ok "$Name removed"
        return
    }

    if ($exitCode -ne 0) {
        $script:FailedPackages.Add("$Name ($Id), exit code: $exitCode") | Out-Null
        if ($Required) {
            Write-Warn "Failed to uninstall required package: $Name ($Id). Remove it manually from Apps & features if needed."
            return
        }
        Write-Warn "Failed to uninstall optional package: $Name ($Id)."
        return
    }
}

function Remove-PathIfExists([string]$PathToRemove, [string]$Label) {
    if (-not (Test-Path $PathToRemove)) {
        Write-Info "$Label not found, skipping"
        return
    }

    Write-Info "Removing $Label"
    Remove-Item -Recurse -Force $PathToRemove
    Write-Ok "$Label removed"
}

function Get-GlobalDependencyCatalog {
    return @(
        @{ Id = "Python.Python.3.12"; Name = "Python 3.12"; Required = $true },
        @{ Id = "Rustlang.Rustup"; Name = "Rustup"; Required = $true },
        @{ Id = "TheDocumentFoundation.LibreOffice"; Name = "LibreOffice"; Required = $false },
        @{ Id = "UB-Mannheim.TesseractOCR"; Name = "Tesseract OCR"; Required = $false },
        @{ Id = "tesseract-ocr.tesseract"; Name = "Tesseract OCR (official)"; Required = $false },
        @{ Id = "MiKTeX.MiKTeX"; Name = "MiKTeX"; Required = $false }
    )
}

function Get-InstalledGlobalDependencies($catalog) {
    $installed = New-Object System.Collections.Generic.List[object]
    foreach ($dep in $catalog) {
        if (Test-WingetPackageInstalled $dep.Id) {
            $installed.Add($dep) | Out-Null
        }
    }
    return ,([object[]]$installed.ToArray())
}

function Select-GlobalDependenciesInteractively($installedDeps) {
    $installedList = @($installedDeps)
    if ($installedList.Count -eq 0) {
        Write-Info "No tracked global dependencies are currently installed via winget."
        return @()
    }

    Write-Host ""
    Write-Host "Installed global dependencies:" -ForegroundColor Yellow
    for ($i = 0; $i -lt $installedList.Count; $i++) {
        $dep = $installedList[$i]
        Write-Host ("  {0}. {1} ({2})" -f ($i + 1), $dep.Name, $dep.Id)
    }
    Write-Host ""
    Write-Host "Select items to uninstall: enter numbers like 1,3,5; type all for all; press Enter to skip." -ForegroundColor Cyan

    $raw = (Read-Host "Your choice").Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        Write-Info "Skipped global dependency removal."
        return @()
    }

    if ($raw.ToLowerInvariant() -eq "all") {
        return @($installedList)
    }

    $tokens = $raw -split "[\s,]+"
    $indices = New-Object System.Collections.Generic.List[int]
    foreach ($token in $tokens) {
        if ([string]::IsNullOrWhiteSpace($token)) {
            continue
        }
        $n = 0
        if (-not [int]::TryParse($token, [ref]$n)) {
            Write-Warn "Invalid selection: $token"
            continue
        }
        if ($n -lt 1 -or $n -gt $installedList.Count) {
            Write-Warn "Selection out of range: $n"
            continue
        }
        if (-not $indices.Contains($n - 1)) {
            $indices.Add($n - 1) | Out-Null
        }
    }

    $selected = New-Object System.Collections.Generic.List[object]
    foreach ($idx in $indices) {
        $selected.Add($installedList[$idx]) | Out-Null
    }

    if ($selected.Count -eq 0) {
        Write-Info "No valid global dependency selected."
    }
    return ,([object[]]$selected.ToArray())
}

function Resolve-SelectedGlobalDependencies($catalog, $installedDeps) {
    if ($RemoveGlobalDeps) {
        if (-not [string]::IsNullOrWhiteSpace($SelectedGlobalIds)) {
            $idSet = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
            foreach ($id in ($SelectedGlobalIds -split ",")) {
                $trimmed = $id.Trim()
                if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
                    $idSet.Add($trimmed) | Out-Null
                }
            }

            $picked = New-Object System.Collections.Generic.List[object]
            foreach ($dep in $installedDeps) {
                if ($idSet.Contains($dep.Id)) {
                    $picked.Add($dep) | Out-Null
                }
            }
            return ,([object[]]$picked.ToArray())
        }
        return @($installedDeps)
    }

    if ($SelectGlobalDeps) {
        return @(Select-GlobalDependenciesInteractively $installedDeps)
    }

    return @()
}

function Uninstall-SelectedGlobalDependencies($selectedDeps) {
    foreach ($dep in $selectedDeps) {
        Uninstall-WingetPackage -Id $dep.Id -Name $dep.Name -Required ([bool]$dep.Required)
    }
}

try {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Yellow
    Write-Host "  DocHub Windows Uninstall" -ForegroundColor Yellow
    Write-Host "==========================================" -ForegroundColor Yellow
    Write-Host ""
    if ($GlobalOnly) {
        Write-Warn "Global-only uninstall phase: local project cleanup is skipped in this elevated run."
    } else {
        Write-Warn "This script removes project-local dependencies and build artifacts."
    }

    if ($RemoveGlobalDeps) {
        Write-Warn "Global dependency removal is ENABLED and may affect other projects using Python, Rust, LibreOffice, Tesseract, or MiKTeX."
    } elseif ($SelectGlobalDeps -and -not $GlobalOnly) {
        Write-Info "After local cleanup, installed global dependencies will be listed for optional selection and removal."
    } else {
        Write-Info "Global dependencies will be kept. Use -SelectGlobalDeps to choose removals or -RemoveGlobalDeps to remove all tracked global packages."
    }
    Write-Host ""

    if (-not $Force -and -not $GlobalOnly) {
        $confirmation = Read-Host "Type YES to continue"
        if ($confirmation -ne "YES") {
            Write-Info "Uninstall cancelled"
            exit 0
        }
    }

    if (-not $GlobalOnly) {
        Stop-KnownProcesses

        Remove-PathIfExists (Join-Path $projectRoot "dep") "dep directory"
        Remove-PathIfExists (Join-Path $projectRoot "node_modules") "node_modules"
        Remove-PathIfExists (Join-Path $projectRoot "src-tauri\target") "Rust build artifacts"
        Remove-PathIfExists (Join-Path $projectRoot "dist") "frontend build output"
    }

    $selectedGlobalDeps = @()
    $delegatedGlobalPhase = $false
    if ($RemoveGlobalDeps -or $SelectGlobalDeps -or $GlobalOnly) {
        if (-not (Test-CommandExists "winget")) {
            throw "winget is required to query or remove globally installed packages."
        }

        $catalog = Get-GlobalDependencyCatalog
        $installedDeps = Get-InstalledGlobalDependencies $catalog
        $selectedGlobalDeps = Resolve-SelectedGlobalDependencies $catalog $installedDeps

        if (@($selectedGlobalDeps).Count -gt 0) {
            if ($GlobalOnly -or (Test-IsAdministrator)) {
                Uninstall-SelectedGlobalDependencies $selectedGlobalDeps
            } else {
                $started = Start-ElevatedGlobalUninstall (@($selectedGlobalDeps | ForEach-Object { $_.Id }))
                if ($started) {
                    $delegatedGlobalPhase = $true
                    Write-Info "Started elevated global-uninstall phase in a new PowerShell window."
                    Write-Info "Current window will exit after local cleanup summary."
                }
            }
        }
    }

    Write-Host ""
    if ($script:FailedPackages.Count -gt 0) {
        Write-Warn "Uninstall completed with some failures:"
        foreach ($item in $script:FailedPackages) {
            Write-Warn "  $item"
        }
        Write-Host "Open Apps & features to remove any remaining packages manually."
    } else {
        if ($delegatedGlobalPhase) {
            Write-Ok "Local cleanup completed. Global uninstall continues in the elevated window."
        } elseif (@($selectedGlobalDeps).Count -gt 0) {
            Write-Ok "Uninstall completed (local + global dependencies)."
        } else {
            Write-Ok "Uninstall completed (project-local cleanup only)."
        }
    }
    Write-Host "You can reinstall everything later with: .\setup.bat"
}
finally {
    Wait-AtEnd
}