# Cloud-Based Weather Data Collector and Alert System using AWS
## Engineering & Technical Project Documentation Report

---

## Table of Contents
1. [Abstract](#1-abstract)
2. [Introduction & Background](#2-introduction--background)
3. [Problem Statement](#3-problem-statement)
4. [Objectives](#4-objectives)
5. [System Architecture & Design](#5-system-architecture--design)
6. [Cloud Services & Technologies Used](#6-cloud-services--technologies-used)
7. [Module Descriptions](#7-module-descriptions)
8. [Database Design](#8-database-design)
9. [Implementation Details](#9-implementation-details)
10. [Testing & Test Results](#10-testing--test-results)
11. [Key Features & Advantages](#11-key-features--advantages)
12. [Conclusion & Future Scope](#12-conclusion--future-scope)
13. [References](#13-references)

---

## 1. Abstract
The **Cloud-Based Weather Data Collector and Alert System using AWS** is an automated, serverless meteorological telemetry monitoring and alerting solution designed to bridge the gap between continuous data ingestion and automated disaster/hazard mitigation. Utilizing **Amazon Web Services (AWS)**, the system periodically collects live weather readings (temperature, humidity, wind velocity, barometric pressure, precipitation, and conditions) for configured geographic locations using an **Amazon EventBridge** scheduler and **AWS Lambda**. Incoming readings are persisted within **Amazon DynamoDB** for long-term historical analysis. Simultaneously, an intelligent threshold engine inspects each reading against localized thresholds (such as heatwave conditions, gale-force winds, and rapid barometric pressure drops). Upon detecting an anomaly, an automated alert notification is published through **Amazon SNS** to subscribed user endpoints via Email/SMS. A modern, responsive web dashboard provides real-time visualization of weather trends and interactive threshold management.

---

## 2. Introduction & Background
Weather fluctuations and sudden meteorological extremes pose significant risks to agriculture, urban transportation, logistics, and public safety. Traditional approaches often rely on manual queries or monolithic polling servers that remain idle for large portions of the day while consuming continuous computational resources. 

Cloud-native serverless architectures offer an ideal paradigm for IoT and telemetry systems:
- Compute resources are only instantiated when triggered by a schedule.
- Scalability is handled automatically without server provisioning.
- High availability is built-in natively.
- Operating costs follow a strict pay-as-you-go model.

---

## 3. Problem Statement
Manual weather tracking is ineffective for early-warning safety systems. Existing weather apps require continuous user attention and do not support customizable threshold alerting or historical trend inspection in localized contexts. Organizations, farms, and individuals need an autonomous cloud system that:
1. Regularly captures live weather conditions without human intervention.
2. Maintains historical time-series datasets.
3. Automatically identifies hazardous weather patterns.
4. Delivers instantaneous notifications via standard communication channels (Email/SMS).
5. Offers an intuitive visualization dashboard.

---

## 4. Objectives
- **Automated Data Pipeline:** Implement an autonomous cron-triggered pipeline to fetch weather readings from open meteorological APIs.
- **Serverless Compute:** Employ AWS Lambda for stateless, scalable computation.
- **NoSQL Time-Series Storage:** Persist structured time-series weather logs in Amazon DynamoDB.
- **Real-Time Alerting Engine:** Implement automated rule checks for heatwaves, coldwaves, high winds, and severe storms, pushing alerts via Amazon SNS.
- **Dynamic Visualization:** Build an interactive glassmorphic web dashboard with Chart.js to plot 24-hour trends and manage alert settings.

---

## 5. System Architecture & Design
The system follows a three-tier serverless pattern:

```
[ Amazon EventBridge ]
       | (Periodic Cron Trigger)
       v
[ AWS Lambda: Weather Collector ] <---> [ External Weather API ]
       |
       +---> [ Amazon DynamoDB (History & Alerts) ]
       |
       +---> [ Amazon SNS Topic ] ---> [ Email / SMS Subscribers ]

[ Client Web Dashboard ] <---> [ Amazon API Gateway ] <---> [ AWS Lambda: API Handler ]
```

---

## 6. Cloud Services & Technologies Used
| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Scheduler** | Amazon EventBridge | Triggers collector Lambda every 10 minutes (`rate(10 minutes)`) |
| **Compute** | AWS Lambda (`Python 3.10+` & `Node.js 20.x`) | Serverless execution of data fetching, threshold logic, and REST APIs |
| **Database** | Amazon DynamoDB | Scalable NoSQL storage for weather history (`weatheralerts` & `WeatherData`) |
| **Messaging** | Amazon Simple Notification Service (SNS) | Pub/Sub topic (`WeatherAlerts`) for Email & SMS alert distribution |
| **API** | Amazon API Gateway | Secure HTTPS REST endpoints with CORS |
| **Frontend** | HTML5, CSS3 (Glassmorphism), JavaScript | Responsive user dashboard and Chart.js trend visualizations |
| **IaC** | AWS SAM (CloudFormation) | Automated infrastructure provisioning via `template.yaml` |

---

## 7. Module Descriptions
1. **Data Collection Module:** Resolves city coordinates, fetches live readings from Open-Meteo, normalizes units (°C, %, km/h, hPa), and maps WMO codes to descriptions.
2. **Scheduler Module:** Managed cloud timer configured via EventBridge expressions.
3. **Data Storage Module:** DynamoDB tables (`weatheralerts` with partition key `station_id` and sort key `timestamp`, `WeatherData`, `WeatherDataHistory`) with primary keys designed for fast single-city time-range queries.
4. **Alert & Notification Module:** Evaluates metrics against danger thresholds; constructs formatted multi-line alerts and dispatches via SNS (`arn:aws:sns:us-east-1:609722444170:WeatherAlerts`).
5. **Dashboard Module:** Web interface with live metric gauges, 24-hour temperature & humidity/wind trend charts, simulation tools, and threshold configuration.

---

## 8. Database Design
### Table 1: `weatheralerts` / `WeatherData`
- **Partition Key (HASH):** `station_id` (String) &mdash; e.g. `"STN_MUMBAI_01"`
- **Sort Key (RANGE):** `timestamp` (String, ISO8601) &mdash; e.g. `"2026-08-29T08:00:00Z"`
- **Attributes:** `location` (String), `temperature` (Number), `feels_like` (Number), `humidity` (Number), `wind_speed` (Number), `pressure` (Number), `precipitation` (Number), `condition` (String), `weather_code` (Number), `recorded_at` (String).

### Table 2: `WeatherAlerts` (Alert Log)
- **Partition Key (HASH):** `station_id` / `alert_id` (String)
- **Sort Key (RANGE):** `timestamp` (String, ISO8601)
- **Attributes:** `location` (String), `alert_type` (String), `severity` (String: CRITICAL/WARNING), `metric_value` (Number), `threshold_value` (Number), `message` (String), `title` (String).

---

## 9. Implementation Details
The project includes dual runtime support:
- **`lambda_function.py`**: Standalone, production Python 3.x AWS Lambda function configured directly for AWS Console deployment in function `weather-alert-system`.
- **`backend/lambda_collector/weather_collector.js`**: Scheduled Node.js 20.x Lambda collector.
- **`backend/lambda_collector/threshold_checker.js`**: Threshold rules and anomaly algorithms.
- **`backend/lambda_api/api_handler.js`**: REST API proxy handler.
- **`backend/server.js`**: Local AWS emulator and full-stack development server in Node.js.
- **`frontend/index.html`, `style.css`, `app.js`**: Glassmorphic single-page dashboard.
- **`docs/IAM_POLICY.json`**: Complete IAM policy for execution role `weather-alert-system-role-cpwnwuej`.
- **`iac/template.yaml`**: AWS Serverless Application Model deployment template.

---

## 10. Testing & Test Results
Comprehensive unit tests were executed covering:
1. **Threshold Evaluation Tests (Python & Node.js):** Verified correct alert generation for heatwave (>38°C), coldwave (<5°C), high wind (>40 km/h), low pressure (<995 hPa), and thunderstorms (WMO code 95).
2. **Geocoding & Data Parsing Tests:** Validated coordinate resolution for major cities.
3. **API Routing & CORS Tests:** Verified all REST endpoints (`/api/weather/current`, `/api/weather/history`, `/api/alerts`, `/api/thresholds`, `/api/subscribe`).
4. **Test Suite Status:** 100% PASS (Python 7/7 tests pass, Node.js 12/12 tests pass).

---

## 11. Key Features & Advantages
- **100% Serverless:** Zero server provisioning, auto-scaling on demand, zero idle costs.
- **Dual Mode Execution:** Can run directly on AWS or locally on Windows via `local_server.py`.
- **Event-Driven Resilience:** SNS topic fans out notifications instantly to multiple subscribers.
- **Real-Time Visualization:** Interactive charts show weather evolution over 24-hour windows.

---

## 12. Conclusion & Future Scope
The Cloud-Based Weather Data Collector and Alert System demonstrates how modern cloud-native architectures simplify data telemetry, scheduled processing, and automated event notifications. 

### Future Enhancements:
- Integration of Machine Learning models (AWS SageMaker) for predictive weather forecasting.
- Mobile push notifications via AWS SNS mobile integration.
- Hardware IoT sensor integration (ESP32/Raspberry Pi) transmitting local micro-climate data via AWS IoT Core.

---

## 13. References
1. Amazon Web Services Documentation: AWS Lambda, Amazon DynamoDB, Amazon EventBridge, Amazon SNS.
2. Open-Meteo Weather API Documentation (https://open-meteo.com/).
3. Chart.js Documentation (https://www.chartjs.org/).
4. AWS Serverless Application Model (SAM) Developer Guide.
