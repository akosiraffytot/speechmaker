# PowerShell Build Script for SpeechMaker
# Enhanced Windows build automation with better error handling and reporting

param(
    [switch]$SkipTests,
    [switch]$SkipValidation,
    [switch]$Verbose,
    [string]$OutputDir = "dist"
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Colors for output
$Colors = @{
    Success = "Green"
    Warning = "Yellow"
    Error = "Red"
    Info = "Cyan"
    Header = "Magenta"
}

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Colors[$Color]
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-ColorOutput "=" * 60 -Color "Header"
    Write-ColorOutput $Title -Color "Header"
    Write-ColorOutput "=" * 60 -Color "Header"
    Write-Host ""
}

function Test-Command {
    param([string]$Command)
    try {
        Get-Command $Command -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-FileSize {
    param([string]$Path)
    if (Test-Path $Path) {
        $size = (Get-Item $Path).Length
        return [math]::Round($size / 1MB, 2)
    }
    return 0
}

# Main build process
try {
    Write-Header "SpeechMaker Windows Build Script"
    
    # Check prerequisites
    Write-ColorOutput "Checking prerequisites..." -Color "Info"
    
    if (-not (Test-Command "node")) {
        Write-ColorOutput "ERROR: Node.js is not installed or not in PATH" -Color "Error"
        Write-ColorOutput "Please install Node.js from https://nodejs.org/" -Color "Error"
        exit 1
    }
    
    if (-not (Test-Command "npm")) {
        Write-ColorOutput "ERROR: npm is not available" -Color "Error"
        exit 1
    }
    
    # Get versions
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-ColorOutput "Node.js version: $nodeVersion" -Color "Success"
    Write-ColorOutput "npm version: $npmVersion" -Color "Success"
    
    # Check if this is a git repository
    if (Test-Path ".git") {
        try {
            $gitCommit = git rev-parse --short HEAD
            Write-ColorOutput "Git commit: $gitCommit" -Color "Info"
        }
        catch {
            Write-ColorOutput "Warning: Could not get git commit" -Color "Warning"
        }
    }
    
    # Install dependencies if needed
    if (-not (Test-Path "node_modules")) {
        Write-ColorOutput "Installing dependencies..." -Color "Info"
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "ERROR: Failed to install dependencies" -Color "Error"
            exit 1
        }
        Write-ColorOutput "Dependencies installed successfully" -Color "Success"
    }
    
    # Clean previous builds
    Write-ColorOutput "Cleaning previous builds..." -Color "Info"
    if (Test-Path $OutputDir) {
        Remove-Item $OutputDir -Recurse -Force
    }
    Write-ColorOutput "Build directory cleaned" -Color "Success"
    
    # Run validation unless skipped
    if (-not $SkipValidation) {
        Write-ColorOutput "Running build validation..." -Color "Info"
        npm run validate
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "ERROR: Build validation failed" -Color "Error"
            Write-ColorOutput "Use -SkipValidation to bypass validation" -Color "Warning"
            exit 1
        }
        Write-ColorOutput "Build validation passed" -Color "Success"
    }
    
    # Run tests unless skipped
    if (-not $SkipTests) {
        Write-ColorOutput "Running tests..." -Color "Info"
        npm test
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput "ERROR: Tests failed" -Color "Error"
            Write-ColorOutput "Use -SkipTests to bypass tests" -Color "Warning"
            exit 1
        }
        Write-ColorOutput "All tests passed" -Color "Success"
    }
    
    # Build the application
    Write-Header "Building Application"
    Write-ColorOutput "Creating Windows distribution packages..." -Color "Info"
    Write-ColorOutput "This may take several minutes..." -Color "Warning"
    
    $buildStart = Get-Date
    
    if ($Verbose) {
        npm run dist:win
    }
    else {
        npm run dist:win | Out-Null
    }
    
    if ($LASTEXITCODE -ne 0) {
        Write-ColorOutput "ERROR: Build failed" -Color "Error"
        exit 1
    }
    
    $buildEnd = Get-Date
    $buildTime = $buildEnd - $buildStart
    
    Write-Header "Build Completed Successfully!"
    Write-ColorOutput "Build time: $($buildTime.TotalMinutes.ToString('F1')) minutes" -Color "Info"
    
    # Show generated files
    if (Test-Path $OutputDir) {
        Write-ColorOutput "Generated files:" -Color "Info"
        $files = Get-ChildItem $OutputDir -Filter "*.exe"
        $totalSize = 0
        
        foreach ($file in $files) {
            $size = Get-FileSize $file.FullName
            $totalSize += $size
            Write-ColorOutput "  - $($file.Name) ($size MB)" -Color "Success"
        }
        
        Write-ColorOutput "Total size: $totalSize MB" -Color "Info"
        
        # Check for specific build outputs
        $installerPath = Join-Path $OutputDir "SpeechMaker Setup *.exe"
        $portablePath = Join-Path $OutputDir "SpeechMaker-*-portable.exe"
        
        if (Get-ChildItem $installerPath -ErrorAction SilentlyContinue) {
            Write-ColorOutput "✓ NSIS Installer created" -Color "Success"
        }
        
        if (Get-ChildItem $portablePath -ErrorAction SilentlyContinue) {
            Write-ColorOutput "✓ Portable executable created" -Color "Success"
        }
    }
    
    Write-Header "Next Steps"
    Write-ColorOutput "1. Test the installer on a clean Windows system" -Color "Info"
    Write-ColorOutput "2. Test the portable executable" -Color "Info"
    Write-ColorOutput "3. Verify all features work correctly" -Color "Info"
    Write-ColorOutput "4. Consider code signing for production release" -Color "Info"
    
    Write-ColorOutput "`nBuild artifacts are ready for distribution!" -Color "Success"
}
catch {
    Write-ColorOutput "ERROR: Build script failed" -Color "Error"
    Write-ColorOutput $_.Exception.Message -Color "Error"
    exit 1
}

# Usage examples
if ($args -contains "-help" -or $args -contains "--help") {
    Write-Header "Usage Examples"
    Write-ColorOutput ".\scripts\build-windows.ps1                    # Full build with all checks" -Color "Info"
    Write-ColorOutput ".\scripts\build-windows.ps1 -SkipTests        # Skip test execution" -Color "Info"
    Write-ColorOutput ".\scripts\build-windows.ps1 -SkipValidation   # Skip build validation" -Color "Info"
    Write-ColorOutput ".\scripts\build-windows.ps1 -Verbose          # Show detailed build output" -Color "Info"
}