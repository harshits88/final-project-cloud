# Cloud-Based Weather Data Collector and Alert System using AWS

![AWS Cloud Native](https://img.shields.io/badge/AWS-Cloud_Native-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-3776AB?style=for-the-badge&logo=python&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![DynamoDB](https://img.shields.io/badge/Amazon-DynamoDB-4053D6?style=for-the-badge&logo=amazon-dynamodb&logoColor=white)
![EventBridge](https://img.shields.io/badge/Amazon-EventBridge-FF4F8B?style=for-the-badge&logo=amazon-aws&logoColor=white)
![SNS](https://img.shields.io/badge/Amazon-SNS-CC2264?style=for-the-badge&logo=amazon-aws&logoColor=white)

> **Department of Computer Science &mdash; M.Sc. Computer Science Semester III**  
> **Project Title:** Cloud-Based Weather Data Collector and Alert System using AWS  
> **Students:** Abhishek Patil (Roll No. **256237**) & Harshit Shelar (Roll No. **256247**)  
> **Technologies:** Python 3.x / Node.js 20.x, AWS Lambda, Amazon DynamoDB, Amazon EventBridge, Amazon SNS, HTML5, CSS3, JavaScript (Chart.js)

---

## 📌 Project Overview

The **Cloud-Based Weather Data Collector and Alert System** automatically collects live meteorological telemetry (temperature, apparent temperature, humidity, wind speed, atmospheric pressure, weather conditions) for configured cities at regular intervals via **Amazon EventBridge**, processes readings with **AWS Lambda**, persists historical logs in **Amazon DynamoDB**, evaluates incoming values against predefined safety thresholds, and automatically sends real-time email and SMS alerts to subscribed users via **Amazon SNS**.

---

## ⚡ Step-by-Step AWS Console Deployment (Matches Your Setup)

Your AWS environment is already pre-configured with:
- **Lambda Function:** `weather-alert-system` (`us-east-1`, Account ID: `609722444170`)
- **DynamoDB Table:** `weatheralerts` (Partition Key: `station_id` (String), Sort Key: `timestamp` (String)) and `WeatherData`
- **SNS Topic:** `WeatherAlerts` (`arn:aws:sns:us-east-1:609722444170:WeatherAlerts`) with confirmed Email (`harshitshelar265@gmail.com`) and SMS (`+8483936155`)
- **Execution Role:** `weather-alert-system-role-cpwnwuej`
- **Trigger:** Amazon EventBridge Scheduler

### Step 1: Copy Code to AWS Lambda Console
1. Open [`lambda_function.py`](file:///d:/cloud%20project/lambda_function.py).
2. Copy all code.
3. Open your AWS Console -> **AWS Lambda** -> **Functions** -> **`weather-alert-system`**.
4. In the **Code source** editor tab, paste the code into `lambda_function.py`.
5. Click **Deploy** (Ctrl+Shift+U).

### Step 2: Attach IAM Permissions to Lambda Execution Role
Your Lambda execution role (`weather-alert-system-role-cpwnwuej`) needs permissions to write to DynamoDB and publish to SNS:
1. In the Lambda Console, go to **Configuration** -> **Permissions**.
2. Click on the Role name **`weather-alert-system-role-cpwnwuej`** (opens IAM in new tab).
3. Click **Add permissions** -> **Create inline policy** (or **Attach policies**).
4. Select the **JSON** tab and paste the contents of [`docs/IAM_POLICY.json`](file:///d:/cloud%20project/docs/IAM_POLICY.json):
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "dynamodb:PutItem",
           "dynamodb:GetItem",
           "dynamodb:UpdateItem",
           "dynamodb:Query",
           "dynamodb:Scan"
         ],
         "Resource": [
           "arn:aws:dynamodb:us-east-1:609722444170:table/weatheralerts*",
           "arn:aws:dynamodb:us-east-1:609722444170:table/WeatherData*"
         ]
       },
       {
         "Effect": "Allow",
         "Action": ["sns:Publish"],
         "Resource": "arn:aws:sns:us-east-1:609722444170:WeatherAlerts"
       }
     ]
   }
   ```
5. Name the policy `WeatherAlertsDynamoDBSNSPolicy` and click **Create policy**.

### Step 3: Test Lambda in AWS Console
1. In the **`weather-alert-system`** Lambda console, switch to the **Test** tab.
2. Create a test event with Event JSON:
   ```json
   {
     "city": "Mumbai",
     "scenario": "heatwave"
   }
   ```
3. Click **Test**.
4. You will receive:
   - Status code `200` with `SUCCESS` execution log.
   - An instant **Email Alert** to `harshitshelar265@gmail.com`.
   - An instant **SMS Alert** to `+8483936155`.
   - A new item in your DynamoDB table `weatheralerts`.

---

## 🚀 Quick Start (Run Locally in 1 Click)

You can also run and test the complete system locally on Windows with zero external setup:

### Option 1: Double-click `run_local.bat`
Simply double-click [`run_local.bat`](file:///d:/cloud%20project/run_local.bat) from File Explorer.

### Option 2: Run via Terminal
```bash
node backend/server.js
```

Then open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## ☁️ Cloud Architecture & Modules

```
                                      AWS CLOUD
  +--------------------+         +---------------------------------------------+
  | Amazon EventBridge |         |          AWS Lambda (Python / Node.js)      |
  | (Scheduled Rule)   | ------> |          (weather-alert-system)             |
  |   Rate: 10 mins    |         |   - Fetches Live Weather Telemetry          |
  +--------------------+         |   - Evaluates Safety Thresholds             |
                                 +---------------------------------------------+
                                        |                              |
                                        v                              v
                         +----------------------------+   +--------------------+
                         |      Amazon DynamoDB       |   |     Amazon SNS     |
                         | - weatheralerts Table      |   |   (WeatherAlerts)  |
                         | - WeatherData Table        |   +--------------------+
                         +----------------------------+             |
                                        ^                   +------------------+
                                        |                   | Email / SMS Subs |
                                        v                   +------------------+
                         +----------------------------+
                         |  AWS Lambda (Node.js/Py)   |
                         |    (API Handler Function)  |
                         +----------------------------+
                                        ^
                                        |
                         +----------------------------+
                         |     Amazon API Gateway     |
                         |       (REST Endpoints)     |
                         +----------------------------+
                                        ^
                                        | HTTPS / REST
                         +-------------------------------+
                         |       Client Web Dashboard    |
                         |   (HTML5, Modern CSS, JS)     |
                         +-------------------------------+
```

### Module Breakdown:
1. **Data Collection Module:** (`lambda_function.py` & `backend/lambda_collector/weather_collector.js`) Fetches live meteorological metrics using Open-Meteo API.
2. **Scheduler Module:** Amazon EventBridge scheduled rule triggering collection every 10 minutes.
3. **Compute Module:** AWS Lambda function (`weather-alert-system`) running Python or Node.js.
4. **Data Storage Module:** Amazon DynamoDB tables (`weatheralerts` & `WeatherData`).
5. **Alert & Notification Module:** Amazon SNS topic (`WeatherAlerts`) sending formatted email/SMS notifications.
6. **Dashboard Module:** (`frontend/`) Glassmorphic web dashboard with Chart.js trend visualizations and live simulator.

---

## 📂 Project Directory Structure

```
d:/cloud project/
├── lambda_function.py               # Pure Python AWS Lambda Function (Console ready)
├── backend/
│   ├── lambda_python/
│   │   └── lambda_function.py       # Python Lambda module
│   ├── lambda_collector/
│   │   ├── weather_collector.js     # Scheduled Node.js Lambda collector
│   │   ├── threshold_checker.js     # Threshold logic & anomaly engine
│   │   ├── index.js                 # Lambda entry point
│   │   └── package.json
│   ├── lambda_api/
│   │   ├── api_handler.js           # REST API Lambda for dashboard requests
│   │   ├── index.js                 # API Lambda entry point
│   │   └── package.json
│   └── server.js                    # Zero-dependency local Node.js cloud simulation server
├── frontend/
│   ├── index.html                   # Modern glassmorphic dashboard UI
│   ├── style.css                    # Responsive CSS with sleek dark theme & glow accents
│   └── app.js                       # Chart.js graphs, city switcher, threshold controls
├── iac/
│   ├── template.yaml                # Production AWS SAM / CloudFormation template
│   ├── deploy.bat                   # Windows AWS deployment script
│   └── deploy.sh                    # Linux/macOS AWS deployment script
├── tests/
│   ├── test_lambda_function.py      # Python unit test suite
│   ├── collector.test.js            # Node.js collector & threshold tests
│   └── api.test.js                  # Node.js API unit tests
├── docs/
│   ├── SYNOPSIS.md                  # M.Sc. Computer Science Sem III formal synopsis
│   ├── ARCHITECTURE.md              # Detailed cloud architecture & API docs
│   ├── PROJECT_REPORT.md            # Complete academic project report
│   └── IAM_POLICY.json              # AWS IAM execution role policy JSON
├── run_local.bat                    # One-click Windows runner
└── README.md                        # Project documentation
```

---

## 🧪 Running Automated Unit Tests

### 1. Python Unit Tests (Lambda Function)
```bash
py -m unittest discover -s tests -p "test_*.py"
```

### 2. Node.js Unit Tests (Collector & API)
```bash
node --test tests/collector.test.js tests/api.test.js
```

---

## 🎓 Academic Credentials
- **Institution:** Department of Computer Science
- **Course:** M.Sc. Computer Science (Semester III)
- **Students:**
  - Abhishek Patil (Roll No. **256237**)
  - Harshit Shelar (Roll No. **256247**)
- **Academic Year:** 2026
