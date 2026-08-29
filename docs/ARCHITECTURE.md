# System Architecture & Technical Specifications

## 1. Architectural Overview

The **Cloud-Based Weather Data Collector and Alert System** is engineered using a decoupled, event-driven serverless architecture on **Amazon Web Services (AWS)**. It eliminates the necessity of continuously running virtual machine instances (e.g., EC2), ensuring high availability, zero idle costs, and automatic scalability.

```
+-----------------------------------------------------------------------------------+
|                                 AWS CLOUD                                         |
|                                                                                   |
|  +--------------------+         +---------------------------------------------+  |
|  | Amazon EventBridge |         |                 AWS Lambda                  |  |
|  | (Scheduled Rule)   | ------> |          (Weather Collector Function)       |  |
|  |   Rate: 10 mins    |         |   - Fetches Live Weather Telemetry          |  |
|  +--------------------+         |   - Evaluates Safety Thresholds             |  |
|                                 +---------------------------------------------+  |
|                                        |                              |           |
|                                        v                              v           |
|                         +----------------------------+   +--------------------+  |
|                         |      Amazon DynamoDB       |   |     Amazon SNS     |  |
|                         | - WeatherDataHistory Table |   | (WeatherAlertTopic)|  |
|                         | - WeatherAlerts Table      |   +--------------------+  |
|                         | - ThresholdConfigs Table   |             |              |
|                         +----------------------------+             v              |
|                                        ^                   +------------------+  |
|                                        |                   | Email / SMS Subs |  |
|                                        v                   +------------------+  |
|                         +----------------------------+                            |
|                         |         AWS Lambda         |                            |
|                         |    (API Handler Function)  |                            |
|                         +----------------------------+                            |
|                                        ^                                          |
|                                        |                                          |
|                         +----------------------------+                            |
|                         |     Amazon API Gateway     |                            |
|                         |       (REST Endpoints)     |                            |
|                         +----------------------------+                            |
+----------------------------------------^------------------------------------------+
                                         |  HTTPS / REST Calls
                         +-------------------------------+
                         |       Client Web Dashboard    |
                         |   (HTML5, Modern CSS, JS)     |
                         +-------------------------------+
```

---

## 2. Cloud Components Breakdown

### 2.1 Amazon EventBridge (Scheduler Module)
- **Role:** Periodic trigger emitting schedule events at configurable time intervals (e.g., `rate(10 minutes)` or specific cron expressions).
- **Target:** `WeatherCollectorFunction` AWS Lambda.
- **Benefits:** Serverless, zero maintenance, highly resilient cron management.

### 2.2 AWS Lambda (Compute & Middleware)
The compute tier provides full support for **Python (3.10/3.11/3.12/3.13)** and **JavaScript (Node.js 20.x)** runtimes:
1. **Python Lambda Function (`lambda_function.py` / `backend/lambda_python/lambda_function.py`):**
   - Direct copy-paste ready for AWS Lambda Console (`weather-alert-system`).
   - Uses native `boto3` and `urllib.request` (zero external pip packages required).
   - Fetches live meteorological metrics from Open-Meteo API.
   - Saves records to DynamoDB `weatheralerts` table (`station_id` HASH, `timestamp` RANGE) and `WeatherData`.
   - Evaluates safety thresholds and dispatches notifications to SNS topic `arn:aws:sns:us-east-1:609722444170:WeatherAlerts`.
2. **Node.js Lambda Function (`backend/lambda_collector/weather_collector.js`):**
   - Enterprise Node.js 20.x collector with AWS SDK v3.
3. **`WeatherApiFunction` (`backend/lambda_api/api_handler.js`):**
   - Serves as the backend for the Frontend Dashboard.
   - Interacts with DynamoDB tables to retrieve real-time readings, historical series, active alerts, and threshold configurations.
   - Handles SNS subscription requests.

### 2.3 Amazon DynamoDB (Data Storage Module)
A fully managed, serverless NoSQL database providing single-digit millisecond latency.
1. **`WeatherDataHistory` Table:**
   - **Partition Key (HASH):** `location` (String) &mdash; e.g. `"Mumbai"`
   - **Sort Key (RANGE):** `timestamp` (String, ISO8601) &mdash; e.g. `"2026-08-29T08:00:00Z"`
   - **Attributes:** `temperature`, `feels_like`, `humidity`, `wind_speed`, `wind_direction`, `pressure`, `precipitation`, `weather_code`, `condition`, `recorded_at`.
2. **`WeatherAlerts` Table:**
   - **Partition Key (HASH):** `alert_id` (String, UUID)
   - **Sort Key (RANGE):** `timestamp` (String, ISO8601)
   - **Attributes:** `location`, `alert_type`, `severity` (CRITICAL / WARNING), `message`, `metric_value`, `threshold_value`, `unit`, `title`.
3. **`ThresholdConfigs` Table:**
   - **Partition Key (HASH):** `location` (String)
   - **Attributes:** `max_temperature`, `min_temperature`, `max_wind_speed`, `max_humidity`, `min_pressure`, `updated_at`.

### 2.4 Amazon SNS (Alert & Notification Module)
- **Topic Name:** `WeatherAlertTopic`
- **Supported Protocols:** Email, SMS.
- **Message Structure:** Formatted notification payload containing location, severity, breach metrics, safety instructions, and timestamp.

### 2.5 Amazon API Gateway & Web Dashboard
- **Protocol:** HTTPS RESTful API with CORS enabled.
- **Frontend:** Single-page dashboard built with HTML5, vanilla modern CSS with glassmorphism, responsive grid layouts, and Chart.js dynamic time-series charts.

---

## 3. REST API Specifications

| Method | Endpoint | Description | Query / Body Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/weather/current` | Returns latest weather reading for a city | `?city=Mumbai` |
| `GET` | `/api/weather/history` | Returns historical readings for time-series charts | `?city=Mumbai&limit=24` |
| `GET` | `/api/alerts` | Returns recent triggered weather alerts | `?city=Mumbai&limit=20` |
| `GET` | `/api/thresholds` | Returns threshold configuration for a location | `?city=Mumbai` |
| `POST` | `/api/thresholds` | Updates custom threshold limits for a location | `{ "location": "Mumbai", "max_temperature": 38, ... }` |
| `POST` | `/api/collect` | Triggers on-demand weather collection | `{ "city": "Mumbai" }` |
| `POST` | `/api/subscribe` | Subscribes an email/phone to the SNS Topic | `{ "protocol": "email", "endpoint": "user@example.com" }` |
| `GET` | `/api/cities` | Returns list of pre-configured major cities | &mdash; |
| `GET` | `/api/health` | Service health status and student details | &mdash; |
