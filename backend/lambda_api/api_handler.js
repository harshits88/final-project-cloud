/**
 * AWS Lambda Function: Weather API Handler (JavaScript / Node.js)
 * RESTful API Gateway Lambda serving the Frontend Weather Dashboard.
 */

const crypto = require("crypto");

let DynamoDBDocumentClient = null;
let DynamoDBClient = null;
let QueryCommand = null;
let ScanCommand = null;
let GetCommand = null;
let PutCommand = null;
let SNSClient = null;
let SubscribeCommand = null;
let LambdaClient = null;
let InvokeCommand = null;
let AWS_AVAILABLE = false;

try {
  const ddb = require("@aws-sdk/client-dynamodb");
  const ddbDoc = require("@aws-sdk/lib-dynamodb");
  const sns = require("@aws-sdk/client-sns");
  const lambda = require("@aws-sdk/client-lambda");

  DynamoDBClient = ddb.DynamoDBClient;
  DynamoDBDocumentClient = ddbDoc.DynamoDBDocumentClient;
  QueryCommand = ddbDoc.QueryCommand;
  ScanCommand = ddbDoc.ScanCommand;
  GetCommand = ddbDoc.GetCommand;
  PutCommand = ddbDoc.PutCommand;
  SNSClient = sns.SNSClient;
  SubscribeCommand = sns.SubscribeCommand;
  LambdaClient = lambda.LambdaClient;
  InvokeCommand = lambda.InvokeCommand;
  AWS_AVAILABLE = true;
} catch (e) {
  AWS_AVAILABLE = false;
}

const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const WEATHER_TABLE_NAME = process.env.WEATHER_TABLE_NAME || "WeatherDataHistory";
const ALERTS_TABLE_NAME = process.env.ALERTS_TABLE_NAME || "WeatherAlerts";
const THRESHOLDS_TABLE_NAME = process.env.THRESHOLDS_TABLE_NAME || "ThresholdConfigs";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "";
const COLLECTOR_LAMBDA_NAME = process.env.COLLECTOR_LAMBDA_NAME || "WeatherCollectorFunction";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token"
};

function createResponse(statusCode, body) {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body)
  };
}

async function getCurrentWeather(city) {
  if (!AWS_AVAILABLE) {
    return { location: city, message: `Mock current weather for ${city}` };
  }

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const doc = DynamoDBDocumentClient.from(client);
    const stationId = `STN_${city.toUpperCase().replace(/\s+/g, "_").slice(0, 8)}_01`;

    // Try Query by station_id or location
    let res = await doc.send(new QueryCommand({
      TableName: WEATHER_TABLE_NAME,
      KeyConditionExpression: "station_id = :stn",
      ExpressionAttributeValues: { ":stn": stationId },
      ScanIndexForward: false,
      Limit: 1
    })).catch(() => null);

    if (!res || !res.Items || res.Items.length === 0) {
      res = await doc.send(new QueryCommand({
        TableName: WEATHER_TABLE_NAME,
        KeyConditionExpression: "location = :loc",
        ExpressionAttributeValues: { ":loc": city },
        ScanIndexForward: false,
        Limit: 1
      })).catch(() => null);
    }

    return res && res.Items && res.Items.length > 0 ? res.Items[0] : { message: `No data for ${city}`, location: city };
  } catch (err) {
    console.error("[ERROR] getCurrentWeather:", err.message);
    return { error: err.message, location: city };
  }
}

async function getWeatherHistory(city, limit = 48) {
  if (!AWS_AVAILABLE) return [];

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const doc = DynamoDBDocumentClient.from(client);
    const stationId = `STN_${city.toUpperCase().replace(/\s+/g, "_").slice(0, 8)}_01`;

    let res = await doc.send(new QueryCommand({
      TableName: WEATHER_TABLE_NAME,
      KeyConditionExpression: "station_id = :stn",
      ExpressionAttributeValues: { ":stn": stationId },
      ScanIndexForward: false,
      Limit: limit
    })).catch(() => null);

    if (!res || !res.Items || res.Items.length === 0) {
      res = await doc.send(new QueryCommand({
        TableName: WEATHER_TABLE_NAME,
        KeyConditionExpression: "location = :loc",
        ExpressionAttributeValues: { ":loc": city },
        ScanIndexForward: false,
        Limit: limit
      })).catch(() => null);
    }

    const items = (res && res.Items) ? res.Items : [];
    return items.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
  } catch (err) {
    console.error("[ERROR] getWeatherHistory:", err.message);
    return [];
  }
}

async function getRecentAlerts(city = null, limit = 20) {
  if (!AWS_AVAILABLE) return [];

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const doc = DynamoDBDocumentClient.from(client);
    
    let params = { TableName: ALERTS_TABLE_NAME, Limit: limit };
    if (city) {
      params.FilterExpression = "#loc = :loc";
      params.ExpressionAttributeNames = { "#loc": "location" };
      params.ExpressionAttributeValues = { ":loc": city };
    }
    const res = await doc.send(new ScanCommand(params));
    const items = res.Items || [];
    return items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  } catch (err) {
    console.error("[ERROR] getRecentAlerts:", err.message);
    return [];
  }
}

async function getThresholds(city) {
  const defaultCfg = {
    location: city,
    max_temperature: 38.0,
    min_temperature: 5.0,
    max_wind_speed: 45.0,
    max_humidity: 85.0,
    min_humidity: 15.0,
    min_pressure: 995.0
  };

  if (!AWS_AVAILABLE) return defaultCfg;

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const doc = DynamoDBDocumentClient.from(client);
    const res = await doc.send(new GetCommand({
      TableName: THRESHOLDS_TABLE_NAME,
      Key: { location: city }
    }));
    return res.Item ? { ...defaultCfg, ...res.Item } : defaultCfg;
  } catch (err) {
    console.warn("[WARN] getThresholds:", err.message);
    return defaultCfg;
  }
}

async function updateThresholds(data) {
  const location = data.location || "Mumbai";
  if (!AWS_AVAILABLE) {
    return { success: true, message: `Updated locally for ${location}`, data };
  }

  try {
    const client = new DynamoDBClient({ region: AWS_REGION });
    const doc = DynamoDBDocumentClient.from(client);
    const item = {
      location,
      max_temperature: Number(data.max_temperature || 38.0),
      min_temperature: Number(data.min_temperature || 5.0),
      max_wind_speed: Number(data.max_wind_speed || 45.0),
      max_humidity: Number(data.max_humidity || 85.0),
      min_pressure: Number(data.min_pressure || 995.0),
      updated_at: new Date().toISOString()
    };
    await doc.send(new PutCommand({ TableName: THRESHOLDS_TABLE_NAME, Item: item }));
    return { success: true, message: `Thresholds updated for ${location}`, thresholds: item };
  } catch (err) {
    console.error("[ERROR] updateThresholds:", err.message);
    return { success: false, error: err.message };
  }
}

async function subscribeToSns(protocol, endpoint) {
  if (!AWS_AVAILABLE || !SNS_TOPIC_ARN) {
    return {
      success: true,
      subscription_arn: `arn:aws:sns:mock:sub-${crypto.randomUUID().slice(0, 8)}`,
      message: `Subscribed ${endpoint} via ${protocol}. Confirmation email/SMS simulated.`
    };
  }

  try {
    const client = new SNSClient({ region: AWS_REGION });
    const res = await client.send(new SubscribeCommand({
      TopicArn: SNS_TOPIC_ARN,
      Protocol: protocol.toLowerCase(),
      Endpoint: endpoint,
      ReturnSubscriptionArn: true
    }));
    return {
      success: true,
      subscription_arn: res.SubscriptionArn,
      message: `Subscribed ${endpoint} successfully. Please check your inbox to confirm.`
    };
  } catch (err) {
    console.error("[ERROR] subscribeToSns:", err.message);
    return { success: false, error: err.message };
  }
}

async function triggerCollectorLambda(payload) {
  if (!AWS_AVAILABLE) {
    return { success: true, message: "Manual collection simulated" };
  }

  try {
    const client = new LambdaClient({ region: AWS_REGION });
    const res = await client.send(new InvokeCommand({
      FunctionName: COLLECTOR_LAMBDA_NAME,
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload))
    }));
    const raw = Buffer.from(res.Payload).toString("utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("[ERROR] triggerCollectorLambda:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Main API Gateway Proxy Handler
 */
exports.handler = async (event, context) => {
  console.log("[API HANDLER] Event:", JSON.stringify(event));

  const httpMethod = (event.httpMethod || "GET").toUpperCase();
  const path = event.path || "/api/weather/current";
  const query = event.queryStringParameters || {};

  // CORS Preflight
  if (httpMethod === "OPTIONS") {
    return createResponse(200, { message: "CORS OK" });
  }

  const city = query.city || "Mumbai";

  try {
    if (path.endsWith("/weather/current") && httpMethod === "GET") {
      const data = await getCurrentWeather(city);
      return createResponse(200, data);
    }

    if (path.endsWith("/weather/history") && httpMethod === "GET") {
      const limit = parseInt(query.limit || "48", 10);
      const history = await getWeatherHistory(city, limit);
      return createResponse(200, { location: city, count: history.length, history });
    }

    if (path.endsWith("/alerts") && httpMethod === "GET") {
      const limit = parseInt(query.limit || "20", 10);
      const filterCity = query.city || null;
      const alerts = await getRecentAlerts(filterCity, limit);
      return createResponse(200, { count: alerts.length, alerts });
    }

    if (path.endsWith("/thresholds") && httpMethod === "GET") {
      const thresholds = await getThresholds(city);
      return createResponse(200, thresholds);
    }

    if (path.endsWith("/thresholds") && httpMethod === "POST") {
      const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
      const res = await updateThresholds(body);
      return createResponse(200, res);
    }

    if (path.endsWith("/subscribe") && httpMethod === "POST") {
      const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
      const protocol = body.protocol || "email";
      const endpoint = body.endpoint || "";
      if (!endpoint) {
        return createResponse(400, { error: "Endpoint (email or phone) is required." });
      }
      const res = await subscribeToSns(protocol, endpoint);
      return createResponse(200, res);
    }

    if (path.endsWith("/collect") && httpMethod === "POST") {
      const body = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
      const res = await triggerCollectorLambda(body);
      return createResponse(200, res);
    }

    if (path.endsWith("/cities") && httpMethod === "GET") {
      const cities = ["Mumbai", "Pune", "Delhi", "Bengaluru", "London", "New York", "Tokyo", "Sydney", "Paris", "San Francisco"];
      return createResponse(200, { cities });
    }

    if (path.endsWith("/health") || path === "/") {
      return createResponse(200, {
        status: "HEALTHY",
        runtime: "JavaScript (Node.js 20.x)",
        service: "AWS Cloud Weather Data Collector & Alert System",
        students: ["Abhishek Patil (256237)", "Harshit Shelar (256247)"],
        semester: "M.Sc. Computer Science Semester III",
        timestamp: new Date().toISOString()
      });
    }

    return createResponse(404, { error: `Endpoint not found: ${httpMethod} ${path}` });

  } catch (err) {
    console.error("[UNHANDLED EXCEPTION]", err);
    return createResponse(500, { error: err.message });
  }
};
