
import json
import os
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from decimal import Decimal

try:
    import boto3
    AWS_AVAILABLE = True
except ImportError:
    AWS_AVAILABLE = False


AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")
DYNAMODB_TABLE_NAME = os.environ.get("DYNAMODB_TABLE_NAME", "weatheralerts")
DYNAMODB_WEATHER_TABLE = os.environ.get("DYNAMODB_WEATHER_TABLE", "WeatherData")
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "arn:aws:sns:us-east-1:609722444170:WeatherAlerts")
DEFAULT_CITIES = os.environ.get("LOCATIONS", "Mumbai,Pune,Delhi,Bengaluru").split(",")

DEFAULT_THRESHOLDS = {
    "max_temperature": float(os.environ.get("THRESH_MAX_TEMP", 38.0)),  # °C (Heatwave)
    "min_temperature": float(os.environ.get("THRESH_MIN_TEMP", 5.0)),   # °C (Cold wave)
    "max_wind_speed": float(os.environ.get("THRESH_MAX_WIND", 40.0)),   # km/h (Gale/Storm)
    "max_humidity": float(os.environ.get("THRESH_MAX_HUMID", 85.0)),    # % (Excessive Humidity)
    "min_pressure": float(os.environ.get("THRESH_MIN_PRESS", 995.0)),   # hPa (Depression/Storm)
}

KNOWN_COORDINATES = {
    "mumbai": {"lat": 19.0760, "lon": 72.8777, "name": "Mumbai", "country": "India", "station_id": "STN_MUMBAI_01"},
    "pune": {"lat": 18.5204, "lon": 73.8567, "name": "Pune", "country": "India", "station_id": "STN_PUNE_01"},
    "delhi": {"lat": 28.6139, "lon": 77.2090, "name": "Delhi", "country": "India", "station_id": "STN_DELHI_01"},
    "bengaluru": {"lat": 12.9716, "lon": 77.5946, "name": "Bengaluru", "country": "India", "station_id": "STN_BLR_01"},
    "london": {"lat": 51.5074, "lon": -0.1278, "name": "London", "country": "United Kingdom", "station_id": "STN_LON_01"},
    "new york": {"lat": 40.7128, "lon": -74.0060, "name": "New York", "country": "United States", "station_id": "STN_NYC_01"},
    "tokyo": {"lat": 35.6762, "lon": 139.6503, "name": "Tokyo", "country": "Japan", "station_id": "STN_TYO_01"}
}

WMO_WEATHER_CODES = {
    0: "Clear Sky",
    1: "Mainly Clear",
    2: "Partly Cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing Rime Fog",
    51: "Light Drizzle",
    53: "Moderate Drizzle",
    55: "Dense Drizzle",
    61: "Slight Rain",
    63: "Moderate Rain",
    65: "Heavy Rain",
    71: "Slight Snow Fall",
    73: "Moderate Snow Fall",
    75: "Heavy Snow Fall",
    80: "Slight Rain Showers",
    81: "Moderate Rain Showers",
    82: "Violent Rain Showers",
    95: "Thunderstorm (Slight or Moderate)",
    96: "Thunderstorm with Slight Hail",
    99: "Severe Thunderstorm with Heavy Hail"
}

def get_weather_description(code: int) -> str:
    """Returns human-readable text for WMO weather code."""
    return WMO_WEATHER_CODES.get(code, f"Weather Condition (Code {code})")


def resolve_city_coordinates(city_name: str) -> dict:
    """
    Resolves latitude, longitude, and station_id for a given city name.
    Uses cached coordinates with dynamic fallback to Open-Meteo Geocoding API.
    """
    clean_name = city_name.strip().lower()
    if clean_name in KNOWN_COORDINATES:
        return KNOWN_COORDINATES[clean_name]


    try:
        query = urllib.parse.urlencode({"name": city_name, "count": 1, "language": "en", "format": "json"})
        url = f"https://geocoding-api.open-meteo.com/v1/search?{query}"
        req = urllib.request.Request(url, headers={"User-Agent": "AWS-WeatherCollectorLambda-Python/1.0"})
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data.get("results"):
                    r = data["results"][0]
                    resolved_name = r.get("name", city_name)
                    stn_id = f"STN_{resolved_name.upper().replace(' ', '_')[:8]}_01"
                    return {
                        "lat": float(r["latitude"]),
                        "lon": float(r["longitude"]),
                        "name": resolved_name,
                        "country": r.get("country", "Global"),
                        "station_id": stn_id
                    }
    except Exception as e:
        print(f"[WARN] Geocoding lookup error for '{city_name}': {e}")

    # Default fallback
    stn_id = f"STN_{city_name.upper().replace(' ', '_')[:8]}_01"
    return {"lat": 19.0760, "lon": 72.8777, "name": city_name.title(), "country": "Global", "station_id": stn_id}


def fetch_live_weather(lat: float, lon: float, location_name: str, station_id: str) -> dict:
    """
    Fetches live meteorological telemetry from Open-Meteo API.
    """
    params = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m",
        "timezone": "auto"
    })
    url = f"https://api.open-meteo.com/v1/forecast?{params}"
    
    req = urllib.request.Request(url, headers={"User-Agent": "AWS-Weather-Collector-Python/1.0"})
    with urllib.request.urlopen(req, timeout=8) as response:
        if response.status != 200:
            raise RuntimeError(f"Open-Meteo API returned status code {response.status}")
        raw_body = response.read().decode("utf-8")
        payload = json.loads(raw_body)

    current = payload.get("current", {})
    weather_code = int(current.get("weather_code", 0))
    now = datetime.now(timezone.utc)
    iso_timestamp = now.isoformat()
    recorded_at = now.strftime("%Y-%m-%d %H:%M:%S UTC")

    reading = {
        "station_id": station_id,
        "location": location_name,
        "timestamp": iso_timestamp,
        "recorded_at": recorded_at,
        "latitude": float(lat),
        "longitude": float(lon),
        "temperature": round(float(current.get("temperature_2m", 0.0)), 1),
        "feels_like": round(float(current.get("apparent_temperature", 0.0)), 1),
        "humidity": round(float(current.get("relative_humidity_2m", 0.0)), 1),
        "wind_speed": round(float(current.get("wind_speed_10m", 0.0)), 1),
        "wind_direction": round(float(current.get("wind_direction_10m", 0.0)), 1),
        "pressure": round(float(current.get("surface_pressure", 1013.25)), 1),
        "precipitation": round(float(current.get("precipitation", 0.0)), 1),
        "weather_code": weather_code,
        "condition": get_weather_description(weather_code),
        "source": "Open-Meteo Meteorological API"
    }
    return reading


def evaluate_weather_thresholds(reading: dict, custom_thresholds: dict = None) -> list:
    """
    Evaluates weather reading against safety thresholds.
    Returns a list of triggered alert dictionaries.
    """
    thresholds = DEFAULT_THRESHOLDS.copy()
    if custom_thresholds:
        thresholds.update(custom_thresholds)

    alerts = []
    location = reading.get("location", "Unknown Location")
    station_id = reading.get("station_id", "STN_DEFAULT")
    timestamp = reading.get("timestamp", datetime.now(timezone.utc).isoformat())

    temp = reading.get("temperature", 0.0)
    humidity = reading.get("humidity", 0.0)
    wind_speed = reading.get("wind_speed", 0.0)
    pressure = reading.get("pressure", 1013.0)
    weather_code = reading.get("weather_code", 0)

    # High Temperature Alert (Heatwave)
    if temp >= thresholds["max_temperature"]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "HIGH_TEMPERATURE",
            "severity": "CRITICAL",
            "title": f"Heatwave Warning: {temp}°C in {location}",
            "metric_value": temp,
            "threshold_value": thresholds["max_temperature"],
            "unit": "°C",
            "message": f"Extreme heat detected in {location}! Current ambient temperature is {temp}°C, exceeding the safety threshold of {thresholds['max_temperature']}°C. Stay hydrated and avoid direct sun exposure."
        })

    # Low Temperature Alert (Cold Wave / Freezing)
    elif temp <= thresholds["min_temperature"]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "LOW_TEMPERATURE",
            "severity": "WARNING",
            "title": f"Cold Wave Advisory: {temp}°C in {location}",
            "metric_value": temp,
            "threshold_value": thresholds["min_temperature"],
            "unit": "°C",
            "message": f"Low temperature warning in {location}. Current temperature has fallen to {temp}°C (safety threshold: {thresholds['min_temperature']}°C)."
        })

    #  High Wind Speed Alert (Gale / Storm Warning)
    if wind_speed >= thresholds["max_wind_speed"]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "HIGH_WIND",
            "severity": "CRITICAL" if wind_speed > 55.0 else "WARNING",
            "title": f"High Wind Warning: {wind_speed} km/h in {location}",
            "metric_value": wind_speed,
            "threshold_value": thresholds["max_wind_speed"],
            "unit": "km/h",
            "message": f"Hazardous wind speeds recorded in {location}: {wind_speed} km/h (threshold limit: {thresholds['max_wind_speed']} km/h). Secure loose outdoor structures."
        })

    # Severe Weather Conditions (Thunderstorms / Violent Rain)
    if weather_code in [95, 96, 99]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "SEVERE_WEATHER_CONDITION",
            "severity": "CRITICAL",
            "title": f"Thunderstorm Alert: {location}",
            "metric_value": weather_code,
            "threshold_value": 95,
            "unit": "WMO Code",
            "message": f"Active thunderstorm and lightning detected in {location} ({get_weather_description(weather_code)}). Take necessary indoor precautions immediately."
        })
    elif weather_code in [65, 82]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "HEAVY_PRECIPITATION",
            "severity": "WARNING",
            "title": f"Heavy Rain & Torrential Showers: {location}",
            "metric_value": weather_code,
            "threshold_value": 65,
            "unit": "WMO Code",
            "message": f"Heavy downpour detected in {location}. Potential waterlogging in low-lying areas."
        })

    #  Low Atmospheric Pressure (Barometric Depression)
    if pressure <= thresholds["min_pressure"]:
        alerts.append({
            "station_id": station_id,
            "location": location,
            "timestamp": timestamp,
            "alert_type": "LOW_PRESSURE_STORM",
            "severity": "WARNING",
            "title": f"Barometric Low Pressure: {pressure} hPa in {location}",
            "metric_value": pressure,
            "threshold_value": thresholds["min_pressure"],
            "unit": "hPa",
            "message": f"Atmospheric pressure in {location} dropped to {pressure} hPa (threshold: {thresholds['min_pressure']} hPa), indicating imminent storm or cyclone formation."
        })

    return alerts


def convert_floats_to_decimals(obj):
    """Recursively converts float values to Decimal for DynamoDB serialization."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: convert_floats_to_decimals(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_floats_to_decimals(i) for i in obj]
    return obj


def save_reading_to_dynamodb(item: dict, table_name: str = DYNAMODB_TABLE_NAME) -> bool:
    """
    Saves a weather telemetry reading to Amazon DynamoDB table.
    Matches schema: Partition Key = 'station_id' (String), Sort Key = 'timestamp' (String)
    """
    if not AWS_AVAILABLE:
        print(f"[LOCAL SIM] Stored reading for {item.get('location')} ({item.get('station_id')})")
        return True

    try:
        dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
        table = dynamodb.Table(table_name)
        db_item = convert_floats_to_decimals(item)
        table.put_item(Item=db_item)
        print(f"[DYNAMODB] Successfully saved record for {item.get('location')} in table '{table_name}'")
        return True
    except Exception as e:
        print(f"[ERROR] DynamoDB PutItem failed for table '{table_name}': {e}")
        return False


def save_alert_to_dynamodb(alert: dict, table_name: str = DYNAMODB_TABLE_NAME) -> bool:
    """
    Saves a triggered weather alert to Amazon DynamoDB.
    """
    if not AWS_AVAILABLE:
        print(f"[LOCAL SIM] Stored alert: {alert.get('title')}")
        return True

    try:
        dynamodb = boto3.resource("dynamodb", region_name=AWS_REGION)
        table = dynamodb.Table(table_name)
        db_item = convert_floats_to_decimals(alert)
        table.put_item(Item=db_item)
        print(f"[DYNAMODB] Successfully saved alert '{alert.get('alert_type')}' in table '{table_name}'")
        return True
    except Exception as e:
        print(f"[ERROR] DynamoDB alert PutItem failed for table '{table_name}': {e}")
        return False


def publish_sns_alert(alert: dict, topic_arn: str = SNS_TOPIC_ARN) -> dict:
    """
    Publishes formatted alert notifications to Amazon SNS.
    Dispatches instant Email & SMS alerts to confirmed subscribers.
    """
    location = alert.get("location", "Unknown Location")
    severity = alert.get("severity", "WARNING")
    alert_type = alert.get("alert_type", "WEATHER_ANOMALY")
    title = alert.get("title", f"Weather Alert for {location}")
    metric_val = alert.get("metric_value", "N/A")
    threshold_val = alert.get("threshold_value", "N/A")
    unit = alert.get("unit", "")
    timestamp = alert.get("timestamp", datetime.now(timezone.utc).isoformat())
    advisory = alert.get("message", "Please monitor local weather advisories.")

    subject = f"[{severity}] Weather Alert: {location} - {title}"[:100]

    
    body = (
        "=======================================================\n"
        "      AWS CLOUD WEATHER ALERT NOTIFICATION             \n"
        "=======================================================\n\n"
        f"Location:        {location}\n"
        f"Severity:        {severity}\n"
        f"Alert Type:      {alert_type}\n"
        f"Observed Value:  {metric_val}{unit}\n"
        f"Threshold Limit: {threshold_val}{unit}\n"
        f"Event Timestamp: {timestamp}\n\n"
        "Advisory & Summary:\n"
        f"{advisory}\n\n"
        "-------------------------------------------------------\n"
        "Dispatched by: AWS Lambda ('weather-alert-system')\n"
        "Project: Cloud-Based Weather Data Collector & Alert System\n"
        "Service: Automated Cloud Telemetry & Alert Notification\n"
        "=======================================================\n"
    )

    if not AWS_AVAILABLE or not topic_arn:
        print(f"\n[LOCAL SNS SIMULATION]\nSubject: {subject}\n{body}\n")
        return {"status": "Simulated", "message_id": "sim-msg-12345"}

    try:
        sns = boto3.client("sns", region_name=AWS_REGION)
        response = sns.publish(
            TopicArn=topic_arn,
            Subject=subject,
            Message=body
        )
        msg_id = response.get("MessageId")
        print(f"[SNS] Published alert to {topic_arn} (MessageId: {msg_id})")
        return {"status": "Published", "message_id": msg_id}
    except Exception as e:
        print(f"[ERROR] SNS Publish failed: {e}")
        return {"status": "Failed", "error": str(e)}


def process_city_weather(city_name: str, simulated_override: dict = None) -> dict:
    """
    Executes end-to-end data pipeline for a single city:
    Fetch -> DynamoDB Store -> Evaluate Thresholds -> SNS Publish.
    """
    geo = resolve_city_coordinates(city_name)
    
    if simulated_override:
        now = datetime.now(timezone.utc)
        weather_code = int(simulated_override.get("weather_code", 0))
        weather_data = {
            "station_id": geo["station_id"],
            "location": geo["name"],
            "latitude": geo["lat"],
            "longitude": geo["lon"],
            "timestamp": now.isoformat(),
            "recorded_at": now.strftime("%Y-%m-%d %H:%M:%S UTC"),
            "temperature": float(simulated_override.get("temperature", 30.0)),
            "feels_like": float(simulated_override.get("feels_like", 32.0)),
            "humidity": float(simulated_override.get("humidity", 60.0)),
            "wind_speed": float(simulated_override.get("wind_speed", 15.0)),
            "wind_direction": 180.0,
            "pressure": float(simulated_override.get("pressure", 1010.0)),
            "precipitation": float(simulated_override.get("precipitation", 0.0)),
            "weather_code": weather_code,
            "condition": simulated_override.get("condition", get_weather_description(weather_code)),
            "source": "Weather Simulation Engine"
        }
    else:
        weather_data = fetch_live_weather(geo["lat"], geo["lon"], geo["name"], geo["station_id"])

    # 1. Store in DynamoDB
    save_reading_to_dynamodb(weather_data, DYNAMODB_TABLE_NAME)

    # 2. Evaluate Thresholds
    alerts = evaluate_weather_thresholds(weather_data)

    # 3. Save alerts and publish to SNS
    alert_results = []
    for alert in alerts:
        save_alert_to_dynamodb(alert, DYNAMODB_TABLE_NAME)
        sns_res = publish_sns_alert(alert, SNS_TOPIC_ARN)
        alert_results.append({
            "alert": alert,
            "sns_response": sns_res
        })

    return {
        "station_id": geo["station_id"],
        "location": geo["name"],
        "weather": weather_data,
        "alerts_count": len(alerts),
        "alerts": alert_results
    }


def lambda_handler(event, context):
    """
    Main AWS Lambda Entrypoint.
    Handles:
      - Amazon EventBridge scheduled triggers (rate or cron)
      - Direct test event invocations (e.g. {"city": "Mumbai", "scenario": "heatwave"})
      - REST API Gateway HTTP proxy requests
    """
    print(f"[LAMBDA EXECUTION] Received Event: {json.dumps(event, default=str)}")

    
    locations = []
    simulated_override = None

    if isinstance(event, dict):
   
        scenario = event.get("scenario")
        if scenario == "heatwave":
            simulated_override = {
                "temperature": 43.5, "feels_like": 47.0, "humidity": 78.0,
                "wind_speed": 18.0, "pressure": 1004.0, "weather_code": 1,
                "condition": "Extreme Heatwave Event"
            }
        elif scenario == "storm":
            simulated_override = {
                "temperature": 22.0, "feels_like": 20.0, "humidity": 95.0,
                "wind_speed": 62.0, "pressure": 988.0, "weather_code": 95,
                "condition": "Severe Thunderstorm & Gale"
            }
        elif scenario == "coldwave":
            simulated_override = {
                "temperature": 1.5, "feels_like": -2.0, "humidity": 88.0,
                "wind_speed": 26.0, "pressure": 1025.0, "weather_code": 75,
                "condition": "Severe Coldwave & Freezing"
            }

      
        if event.get("locations") and isinstance(event["locations"], list):
            locations = event["locations"]
        elif event.get("city"):
            locations = [event["city"]]
        elif event.get("location"):
            locations = [event["location"]]

    if not locations:
        locations = [c.strip() for c in DEFAULT_CITIES if c.strip()]

    results = []
    total_alerts = 0

    for city in locations:
        try:
            city_res = process_city_weather(city, simulated_override)
            results.append(city_res)
            total_alerts += city_res.get("alerts_count", 0)
        except Exception as err:
            print(f"[ERROR] Failed processing for '{city}': {err}")
            results.append({"location": city, "status": "ERROR", "error": str(err)})

    response_body = {
        "status": "SUCCESS",
        "project": "Cloud-Based Weather Data Collector and Alert System using AWS",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "processed_locations": len(results),
        "total_alerts_triggered": total_alerts,
        "results": results
    }

    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(response_body, default=str)
    }


handler = lambda_handler

if __name__ == "__main__":
 
    print("Testing Lambda Handler locally...")
    test_event = {"city": "Mumbai"}
    output = lambda_handler(test_event, None)
    print(json.dumps(json.loads(output["body"]), indent=2))
