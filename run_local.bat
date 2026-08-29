@echo off
title AWS Cloud Weather Alert System - Node.js Local Server
cls
echo ==============================================================================
echo   CLOUD-BASED WEATHER DATA COLLECTOR AND ALERT SYSTEM USING AWS
echo   Department of Computer Science - M.Sc. Computer Science Semester III
echo   Students: Abhishek Patil (256237) ^& Harshit Shelar (256247)
echo   Stack: 100%% JavaScript (Node.js, HTML5, CSS3, Chart.js)
echo ==============================================================================
echo.
echo [1/2] Checking Node.js installation...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in your system PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo [2/2] Starting Local AWS Cloud Emulation Server...
echo.
echo Dashboard URL: http://localhost:8000
echo.

REM Automatically open default browser after 1 second
start "" http://localhost:8000

REM Run the Node.js server
node backend\server.js

pause
