"""
AWS Lambda Function: Cloud-Based Weather Data Collector and Alert System
========================================================================
Project: Cloud-Based Weather Data Collector and Alert System using AWS
Course: M.Sc. Computer Science (Semester III)
Students: Abhishek Patil (Roll No. 256237) & Harshit Shelar (Roll No. 256247)
Runtime: Python 3.10 / 3.11 / 3.12 / 3.13 (AWS Lambda Native)
"""

# Re-export everything from lambda_function.py at root
import os
import sys

root_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if root_dir not in sys.path:
    sys.path.insert(0, root_dir)

from lambda_function import (
    lambda_handler,
    handler,
    process_city_weather,
    evaluate_weather_thresholds,
    fetch_live_weather,
    resolve_city_coordinates,
    publish_sns_alert,
    save_reading_to_dynamodb,
    save_alert_to_dynamodb
)
