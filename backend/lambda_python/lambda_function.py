

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
