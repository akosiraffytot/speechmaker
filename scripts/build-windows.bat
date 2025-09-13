@echo off
REM Windows Build Script for SpeechMaker
REM This script automates the complete build process for Windows distribution

echo ========================================
echo SpeechMaker Windows Build Script
echo ========================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if npm is available
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not available
    pause
    exit /b 1
)

echo Node.js and npm are available
echo.

REM Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo.
)

REM Clean previous builds
echo Cleaning previous builds...
npm run clean
echo.

REM Run validation
echo Running build validation...
npm run validate
if %errorlevel% neq 0 (
    echo ERROR: Build validation failed
    echo Please fix the issues above before building
    pause
    exit /b 1
)
echo.

REM Create distribution builds
echo Creating Windows distribution packages...
echo This may take several minutes...
echo.

npm run dist:win
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo Build completed successfully!
echo ========================================
echo.

REM Show generated files
if exist "dist" (
    echo Generated files in dist directory:
    dir /b dist\*.exe 2>nul
    echo.
    
    REM Calculate total size
    for /f "tokens=3" %%a in ('dir /s dist\*.exe ^| find "File(s)"') do set totalsize=%%a
    echo Total size: %totalsize% bytes
    echo.
)

echo Build artifacts are ready for distribution!
echo.
echo Next steps:
echo 1. Test the installer on a clean Windows system
echo 2. Test the portable executable
echo 3. Verify all features work correctly
echo 4. Consider code signing for production release
echo.

pause