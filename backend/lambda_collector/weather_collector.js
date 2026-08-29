/**
 * AWS Lambda Function: Weather Data Collector & Alert Dispatcher (JavaScript / Node.js)
 * Triggered by Amazon EventBridge (Rate: 10 mins or Cron expression)
 * 
 * Flow:
 * 1. Fetches live weather telemetry from Open-Meteo Meteorological API.
 * 2. Writes time-series readings to Amazon DynamoDB (WeatherDataHistory).
 * 3. Evaluates readings against safety thresholds (threshold_checker.js).
 * 4. Persists triggered alerts into Amazon DynamoDB (WeatherAlerts).
 * 5. Publishes rich alert notifications to Amazon SNS (WeatherAlertTopic).
 */

const { evaluateWeatherData, getWeatherDescription } = require("./threshold_checker");
const crypto = require("crypto");

// Optional AWS SDK v3 imports (available natively in AWS Lambda nodejs18+ / nodejs20+ runtimes)
let DynamoDBDocumentClient = null;
let DynamoDBClient = null;
let PutCommand = null;
let GetCommand = null;
let SNSClient = null;
let PublishCommand = null;
let AWS_AVAILABLE = false;

try {
  const ddb = require("@aws-sdk/client-dynamodb");
  const ddbDoc = require("@aws-sdk/lib-dynamodb");
  const sns = require("@aws-sdk/client-sns");
  
  DynamoDBClient = ddb.DynamoDBClient;
  DynamoDBDocumentClient = ddbDoc.DynamoDBDocumentClient;
  PutCommand = ddbDoc.PutCommand;
  GetCommand = ddbDoc.GetCommand;
  SNSClient = sns.SNSClient;
  PublishCommand = sns.PublishCommand;
  AWS_AVAILABLE = true;
} catch (err) {
  AWS_AVAILABLE = false;
}

// Environment Configurations
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const WEATHER_TABLE_NAME = process.env.WEATHER_TABLE_NAME || "WeatherDataHistory";
const ALERTS_TABLE_NAME = process.env.ALERTS_TABLE_NAME || "WeatherAlerts";
const THRESHOLDS_TABLE_NAME = process.env.THRESHOLDS_TABLE_NAME || "ThresholdConfigs";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
const DEFAULT_LOCATIONS = (process.env.LOCATIONS || "Mumbai,Pune,Delhi,Bengaluru,London,New York,Tokyo").split(",");

// Known City Coordinates Cache
const KNOWN_CITIES = {
  "mumbai": { lat: 19.0760, lon: 72.8777, name: "Mumbai", country: "India" },
  "pune": { lat: 18.5204, lon: 73.8567, name: "Pune", country: "India" },
  "delhi": { lat: 28.6139, lon: 77.2090, name: "Delhi", country: "India" },
  "bengaluru": { lat: 12.9716, lon: 77.5946, name: "Bengaluru", country: "India" },
  "london": { lat: 51.5074, lon: -0.1278, name: "London", country: "United Kingdom" },
  "new york": { lat: 40.7128, lon: -74.0060, name: "New York", country: "United States" },
  "tokyo": { lat: 35.6762, lon: 139.6503, name: "Tokyo", country: "Japan" },
  "sydney": { lat: -33.8688, lon: 151.2093, name: "Sydney", country: "Australia" },
  "paris": { lat: 48.8566, lon: 2.3522, name: "Paris", country: "France" },
  "san francisco": { lat: 37.7749, lon: -122.4194, name: "San Francisco", country: "United States" }
};

async function resolveCityCoordinates(cityName) {
  const clean = cityName.trim().toLowerCase();
  if (KNOWN_CITIES[clean]) {
    return KNOWN_CITIES[clean];
  }

  // Dynamic Geocoding via Open-Meteo Geocoding API
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
    const res = await fetch(url, { headers: { "User-Agent": "WeatherCollectorLambda-JS/1.0" } });
    if (res.ok) {
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const r = data.results[0];
        return {
          lat: r.latitude,
          lon: r.longitude,
          name: r.name,
          country: r.country || "Global"
        };
      }
    }
  } catch (e) {
    console.warn(`[WARN] Geocoding lookup failed for ${cityName}:`, e.message);
  }

  return { lat: 19.0760, lon: 72.8777, name: cityName.charAt(0).toUpperCase() + cityName.slice(1), country: "Global" };
}

async function fetchLiveWeather(lat, lon, locationName) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m`;
  
  const res = await fetch(url, { headers: { "User-Agent": "AWS-Weather-Collector-JS/1.0" } });
  if (!res.ok) {
    throw new Error(`Weather API returned status ${res.status}`);
  }
  
  const payload = await res.json();
  const current = payload.current || {};
  const weatherCode = parseInt(current.weather_code || 0, 10);
  const conditionText = getWeatherDescription(weatherCode);
  const now = new Date();

  const stationId = `STN_${locationName.toUpperCase().replace(/\s+/g, "_").slice(0, 8)}_01`;

  return {
    station_id: stationId,
    location: locationName,
    latitude: lat,
    longitude: lon,
    timestamp: now.toISOString(),
    recorded_at: now.toISOString().replace("T", " ").substring(0, 19) + " UTC",
    temperature: parseFloat((current.temperature_2m || 0).toFixed(1)),
    feels_like: parseFloat((current.apparent_temperature || 0).toFixed(1)),
    humidity: parseFloat((current.relative_humidity_2m || 0).toFixed(1)),
    wind_speed: parseFloat((current.wind_speed_10m || 0).toFixed(1)),
    wind_direction: parseFloat((current.wind_direction_10m || 0).toFixed(1)),
    pressure: parseFloat((current.surface_pressure || 1013.25).toFixed(1)),
    precipitation: parseFloat((current.precipitation || 0).toFixed(1)),
    weather_code: weatherCode,
    condition: conditionText,
    source: "Open-Meteo Meteorological API"
  };
}

async function saveWeatherToDynamoDB(item) {
  if (!AWS_AVAILABLE) {
    console.log(`[MOCK DYNAMODB] Storing weather reading for ${item.location}`);
    return;
  }

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const docClient = DynamoDBDocumentClient.from(client);
    await docClient.send(new PutCommand({
      TableName: WEATHER_TABLE_NAME,
      Item: item
    }));
    console.log(`[DYNAMODB] Saved weather record for ${item.location}`);
  } catch (err) {
    console.error("[ERROR] Failed to save to DynamoDB:", err.message);
  }
}

async function saveAlertToDynamoDB(alert) {
  if (!AWS_AVAILABLE) {
    console.log(`[MOCK DYNAMODB] Storing alert: ${alert.title}`);
    return;
  }

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const docClient = DynamoDBDocumentClient.from(client);
    alert.alert_id = crypto.randomUUID();
    await docClient.send(new PutCommand({
      TableName: ALERTS_TABLE_NAME,
      Item: alert
    }));
    console.log(`[DYNAMODB] Saved alert ${alert.alert_type} for ${alert.location}`);
  } catch (err) {
    console.error("[ERROR] Failed to save alert to DynamoDB:", err.message);
  }
}

async function fetchCustomThresholds(location) {
  if (!AWS_AVAILABLE) return null;

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const docClient = DynamoDBDocumentClient.from(client);
    const res = await docClient.send(new GetCommand({
      TableName: THRESHOLDS_TABLE_NAME,
      Key: { location }
    }));
    return res.Item || null;
  } catch (err) {
    console.warn(`[WARN] Could not fetch custom thresholds:`, err.message);
    return null;
  }
}

async function publishSnsAlert(alert) {
  const subject = `[${alert.severity || "WARNING"}] Weather Alert: ${alert.location} - ${alert.title || ""}`;
  
  const body = 
    `=======================================================\n` +
    `      AWS CLOUD WEATHER ALERT NOTIFICATION             \n` +
    `=======================================================\n\n` +
    `Location:        ${alert.location}\n` +
    `Severity:        ${alert.severity}\n` +
    `Alert Type:      ${alert.alert_type}\n` +
    `Observed Value:  ${alert.metric_value}${alert.unit || ""}\n` +
    `Threshold Limit: ${alert.threshold_value}${alert.unit || ""}\n` +
    `Time of Event:   ${alert.timestamp}\n\n` +
    `Summary & Advisory:\n` +
    `${alert.message}\n\n` +
    `-------------------------------------------------------\n` +
    `Dispatched by: AWS Lambda (WeatherAlertTopic)\n` +
    `M.Sc. Project: Cloud-Based Weather Data Collector & Alert System\n` +
    `Students: Abhishek Patil (256237) & Harshit Shelar (256247)\n` +
    `=======================================================\n`;

  if (!AWS_AVAILABLE || !SNS_TOPIC_ARN) {
    console.log(`\n[LOCAL SNS DISPATCH]\nSubject: ${subject}\n${body}`);
    return { status: "Simulated", messageId: crypto.randomUUID() };
  }

  try {
    const client = new SNSClient({ region: AWS_REGION });
    const response = await client.send(new PublishCommand({
      TopicArn: SNS_TOPIC_ARN,
      Subject: subject.substring(0, 100),
      Message: body
    }));
    console.log(`[SNS] Published alert notification: ${response.MessageId}`);
    return response;
  } catch (err) {
    console.error("[ERROR] Failed to publish to SNS:", err.message);
    return null;
  }
}

async function processCityWeather(cityName) {
  const geo = await resolveCityCoordinates(cityName);
  const weatherData = await fetchLiveWeather(geo.lat, geo.lon, geo.name);

  // Store in DynamoDB
  await saveWeatherToDynamoDB(weatherData);

  // Check thresholds
  const customThresholds = await fetchCustomThresholds(geo.name);
  const triggeredAlerts = evaluateWeatherData(weatherData, customThresholds);

  // Publish alerts
  const alertResults = [];
  for (const alert of triggeredAlerts) {
    await saveAlertToDynamoDB(alert);
    const snsRes = await publishSnsAlert(alert);
    alertResults.push({ alert, sns_response: snsRes });
  }

  return {
    weather: weatherData,
    alerts_triggered: triggeredAlerts.length,
    alerts: alertResults
  };
}

/**
 * Main Lambda Handler
 */
exports.handler = async (event, context) => {
  console.log("[LAMBDA EXECUTION] Event:", JSON.stringify(event));

  let locations = [];
  if (event && event.locations && Array.isArray(event.locations)) {
    locations = event.locations;
  } else if (event && event.city) {
    locations = [event.city];
  } else {
    locations = DEFAULT_LOCATIONS.map(l => l.trim()).filter(Boolean);
  }

  const results = [];
  for (const city of locations) {
    try {
      const res = await processCityWeather(city);
      results.push(res);
    } catch (err) {
      console.error(`[ERROR] Failed processing for ${city}:`, err.message);
      results.push({ city, error: err.message });
    }
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    },
    body: JSON.stringify({
      message: `Successfully processed weather data for ${results.length} location(s).`,
      timestamp: new Date().toISOString(),
      results
    })
  };
};

module.exports.resolveCityCoordinates = resolveCityCoordinates;
module.exports.fetchLiveWeather = fetchLiveWeather;
module.exports.processCityWeather = processCityWeather;
