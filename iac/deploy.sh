#!/bin/bash
# ==============================================================================
# Cloud Weather Data Collector and Alert System - AWS SAM Deployment Script
# Students: Abhishek Patil (256237) & Harshit Shelar (256247)
# ==============================================================================

set -e

echo "=============================================================================="
echo " Deploying Cloud-Based Weather Data Collector & Alert System to AWS"
echo "=============================================================================="

if ! command -v sam &> /dev/null; then
    echo "[ERROR] AWS SAM CLI could not be found. Please install AWS SAM CLI first."
    exit 1
fi

echo "[1/3] Building SAM Application..."
sam build -t template.yaml

echo "[2/3] Deploying to AWS..."
sam deploy --guided

echo "[3/3] Deployment complete! Check the Outputs section for your API Gateway URL."
