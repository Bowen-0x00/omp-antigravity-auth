@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo  Installing omp-antigravity-auth into Oh My Pi (omp)
echo ========================================================
echo.

set "EXT_DIR=%USERPROFILE%\.omp\agent\extensions"
if not exist "%EXT_DIR%" (
    echo [*] Creating OMP extension directory: %EXT_DIR%
    mkdir "%EXT_DIR%"
)

set "SRC_FILE=%~dp0..\extension\omp-antigravity-auth.ts"
if not exist "%SRC_FILE%" (
    set "SRC_FILE=%~dp0extension\omp-antigravity-auth.ts"
)

if not exist "%SRC_FILE%" (
    echo [ERROR] Source extension file not found: %SRC_FILE%
    exit /b 1
)

copy /y "%SRC_FILE%" "%EXT_DIR%\omp-antigravity-auth.ts" >nul
if %errorlevel% neq 0 (
    echo [ERROR] Failed to copy extension file!
    exit /b 1
)

echo [OK] Extension installed successfully:
echo      %EXT_DIR%\omp-antigravity-auth.ts
echo.
echo ========================================================
echo  Installation Complete!
echo  Restart omp and you can use:
echo    /ag-import [file|text]
echo    /ag-list
echo    /ag-verify
echo ========================================================
echo.
pause
