"""
Unit Tests for AWS Lambda Function (Python)
===========================================
Tests the weather threshold evaluation, geocoding resolver, and payload generation.
Run via: py -m unittest discover -s tests -p "test_*.py"
"""

import unittest
import json
import os
import sys

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lambda_function import (
    evaluate_weather_thresholds,
    resolve_city_coordinates,
    get_weather_description,
    lambda_handler
)

class TestWeatherAlertSystemPython(unittest.TestCase):

    def test_normal_weather_triggers_zero_alerts(self):
        reading = {
            "station_id": "STN_MUMBAI_01",
            "location": "Mumbai",
            "temperature": 28.5,
            "humidity": 65.0,
            "wind_speed": 14.0,
            "pressure": 1012.0,
            "weather_code": 1
        }
        alerts = evaluate_weather_thresholds(reading)
        self.assertEqual(len(alerts), 0, "Normal conditions should trigger 0 alerts.")

    def test_high_temperature_alert(self):
        reading = {
            "station_id": "STN_DELHI_01",
            "location": "Delhi",
            "temperature": 42.8,  # > 38.0°C
            "humidity": 35.0,
            "wind_speed": 12.0,
            "pressure": 1006.0,
            "weather_code": 0
        }
        alerts = evaluate_weather_thresholds(reading)
        self.assertEqual(len(alerts), 1)
        self.assertEqual(alerts[0]["alert_type"], "HIGH_TEMPERATURE")
        self.assertEqual(alerts[0]["severity"], "CRITICAL")
        self.assertEqual(alerts[0]["metric_value"], 42.8)

    def test_low_temperature_alert(self):
        reading = {
            "station_id": "STN_SHIMLA_01",
            "location": "Shimla",
            "temperature": 2.1,  # < 5.0°C
            "humidity": 70.0,
            "wind_speed": 15.0,
            "pressure": 1020.0,
            "weather_code": 71
        }
        alerts = evaluate_weather_thresholds(reading)
        types = [a["alert_type"] for a in alerts]
        self.assertIn("LOW_TEMPERATURE", types)

    def test_high_wind_speed_alert(self):
        reading = {
            "station_id": "STN_PUNE_01",
            "location": "Pune",
            "temperature": 26.0,
            "humidity": 55.0,
            "wind_speed": 48.5,  # > 40.0 km/h
            "pressure": 1008.0,
            "weather_code": 2
        }
        alerts = evaluate_weather_thresholds(reading)
        types = [a["alert_type"] for a in alerts]
        self.assertIn("HIGH_WIND", types)

    def test_thunderstorm_and_depression_alert(self):
        reading = {
            "station_id": "STN_BLR_01",
            "location": "Bengaluru",
            "temperature": 21.0,
            "humidity": 94.0,
            "wind_speed": 32.0,
            "pressure": 989.0,  # < 995.0 hPa
            "weather_code": 95  # Thunderstorm
        }
        alerts = evaluate_weather_thresholds(reading)
        types = [a["alert_type"] for a in alerts]
        self.assertIn("SEVERE_WEATHER_CONDITION", types)
        self.assertIn("LOW_PRESSURE_STORM", types)

    def test_geocoding_resolver(self):
        res = resolve_city_coordinates("Mumbai")
        self.assertEqual(res["name"], "Mumbai")
        self.assertEqual(res["station_id"], "STN_MUMBAI_01")
        self.assertAlmostEqual(res["lat"], 19.0760, places=2)

    def test_lambda_handler_simulation_scenario(self):
        event = {"city": "Mumbai", "scenario": "heatwave"}
        response = lambda_handler(event, None)
        self.assertEqual(response["statusCode"], 200)
        body = json.loads(response["body"]) if isinstance(response["body"], str) else response["body"]
        self.assertEqual(body["status"], "SUCCESS")
        self.assertGreater(body["total_alerts_triggered"], 0)

if __name__ == "__main__":
    import json
    unittest.main()
