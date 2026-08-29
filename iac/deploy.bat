@echo off
REM ==============================================================================
REM Cloud Weather Data Collector and Alert System - AWS SAM Deployment Script
REM Students: Abhishek Patil (256237) & Harshit Shelar (256247)
REM ==============================================================================

echo ==============================================================================
echo  Deploying Cloud-Based Weather Data Collector & Alert System to AWS
echo ==============================================================================

REM Check if AWS CLI is installed
where aws >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] AWS CLI is not installed or not in PATH.
    echo Please install AWS CLI or run the project locally using: run_local.bat
    pause
    exit /b 1
)

REM Check if SAM CLI is installed
where sam >nul 2>nul
if %errorlevel% neq 0 (
    echo [WARNING] AWS SAM CLI is not detected in your PATH.
    echo To install SAM CLI: winget install Amazon.SAM-CLI
    echo.
    echo You can also test and run the full system immediately using:
    echo    run_local.bat
    echo.
    pause
    exit /b 1
)

echo [1/3] Building AWS SAM Application...
sam build -t template.yaml
if %errorlevel% neq 0 (
    echo [ERROR] SAM build failed.
    pause
    exit /b 1
)

echo [2/3] Deploying to AWS CloudFormation...
sam deploy --guided

echo [3/3] Deployment complete! Note the ApiGatewayUrl output to connect to your dashboard.
pause
