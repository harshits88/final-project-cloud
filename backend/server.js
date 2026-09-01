

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const crypto = require("crypto");
const { exec } = require("child_process");

const { evaluateWeatherData, getWeatherDescription, DEFAULT_THRESHOLDS } = require("./lambda_collector/threshold_checker");
const { resolveCityCoordinates, fetchLiveWeather } = require("./lambda_collector/weather_collector");

const PORT = process.env.PORT || 8000;
const DATA_STORE_PATH = path.join(__dirname, "data_store.json");
const FRONTEND_DIR = path.join(__dirname, "..", "frontend");


class CloudDataStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = this.load();
    }

    load() {
        if (fs.existsSync(this.filePath)) {
            try {
                const raw = fs.readFileSync(this.filePath, "utf-8");
                return JSON.parse(raw);
            } catch (err) {
                console.warn("[STORE] Initializing fresh data store.");
            }
        }
        return {
            WeatherDataHistory: [],
            WeatherAlerts: [],
            ThresholdConfigs: {},
            SNSSubscriptions: [
                {
                    subscription_arn: "arn:aws:sns:local:default-email",
                    protocol: "email",
                    endpoint: "admin@weatheralert.aws",
                    confirmed: true
                }
            ],
            SNSDispatchedLogs: []
        };
    }

    save() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
        } catch (err) {
            console.error("[ERROR] Failed saving store:", err.message);
        }
    }

    putWeatherReading(reading) {
        const history = this.data.WeatherDataHistory || (this.data.WeatherDataHistory = []);
        history.push(reading);
        if (history.length > 1000) {
            this.data.WeatherDataHistory = history.slice(-1000);
        }
        this.save();
    }

    getWeatherHistory(location, limit = 48) {
        const history = (this.data.WeatherDataHistory || []).filter(
            item => (item.location || "").toLowerCase() === (location || "").toLowerCase() ||
                (item.station_id || "").toLowerCase() === (location || "").toLowerCase()
        );
        return history.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || "")).slice(-limit);
    }

    getLatestWeather(location) {
        const history = this.getWeatherHistory(location, 1);
        return history.length > 0 ? history[0] : null;
    }

    putAlert(alert) {
        alert.alert_id = crypto.randomUUID();
        const alerts = this.data.WeatherAlerts || (this.data.WeatherAlerts = []);
        alerts.push(alert);
        if (alerts.length > 500) {
            this.data.WeatherAlerts = alerts.slice(-500);
        }
        this.save();
    }

    getAlerts(location = null, limit = 30) {
        let alerts = this.data.WeatherAlerts || [];
        if (location) {
            alerts = alerts.filter(a => (a.location || "").toLowerCase() === location.toLowerCase());
        }
        return alerts.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || "")).slice(0, limit);
    }

    setThresholds(location, thresholds) {
        this.data.ThresholdConfigs = this.data.ThresholdConfigs || {};
        this.data.ThresholdConfigs[location] = thresholds;
        this.save();
    }

    getThresholds(location) {
        const custom = (this.data.ThresholdConfigs || {})[location];
        return { ...DEFAULT_THRESHOLDS, ...(custom || {}), location };
    }

    addSubscription(protocol, endpoint) {
        const sub = {
            subscription_arn: `arn:aws:sns:local:sub-${crypto.randomUUID().slice(0, 8)}`,
            protocol,
            endpoint,
            confirmed: true,
            created_at: new Date().toISOString()
        };
        (this.data.SNSSubscriptions || (this.data.SNSSubscriptions = [])).push(sub);
        this.save();
        return sub;
    }

    logSnsPublish(alert) {
        const entry = {
            message_id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            topic_arn: "arn:aws:sns:us-east-1:123456789012:WeatherAlertTopic",
            severity: alert.severity,
            location: alert.location,
            title: alert.title,
            message: alert.message,
            recipients_count: (this.data.SNSSubscriptions || []).length
        };
        (this.data.SNSDispatchedLogs || (this.data.SNSDispatchedLogs = [])).push(entry);
        this.save();

        console.log("\n[LOCAL SIMULATOR - SNS ALERT DISPATCH]");
        console.log(`To: ${(this.data.SNSSubscriptions || []).length} Subscriber(s)`);
        console.log(`Subject: [${entry.severity}] ${entry.title}`);
        console.log(`Message: ${entry.message}\n`);
        return entry;
    }
}

const STORE = new CloudDataStore(DATA_STORE_PATH);

async function executeCollectionForCity(cityName, simulatedOverride = null) {
    const geo = await resolveCityCoordinates(cityName);
    let weatherData = null;

    if (simulatedOverride) {
        const now = new Date();
        const stationId = `STN_${geo.name.toUpperCase().replace(/\s+/g, "_").slice(0, 8)}_01`;
        weatherData = {
            station_id: stationId,
            location: geo.name,
            latitude: geo.lat,
            longitude: geo.lon,
            timestamp: now.toISOString(),
            recorded_at: now.toISOString().replace("T", " ").substring(0, 19) + " UTC",
            temperature: Number(simulatedOverride.temperature || 30.0),
            feels_like: Number(simulatedOverride.feels_like || 32.0),
            humidity: Number(simulatedOverride.humidity || 60.0),
            wind_speed: Number(simulatedOverride.wind_speed || 15.0),
            wind_direction: 180.0,
            pressure: Number(simulatedOverride.pressure || 1010.0),
            precipitation: Number(simulatedOverride.precipitation || 0.0),
            weather_code: Number(simulatedOverride.weather_code || 0),
            condition: simulatedOverride.condition || getWeatherDescription(Number(simulatedOverride.weather_code || 0)),
            source: "Local Cloud Weather Simulator"
        };
    } else {
        weatherData = await fetchLiveWeather(geo.lat, geo.lon, geo.name);
    }

    STORE.putWeatherReading(weatherData);

    const thresholds = STORE.getThresholds(geo.name);
    const alerts = evaluateWeatherData(weatherData, thresholds);

    for (const alert of alerts) {
        STORE.putAlert(alert);
        STORE.logSnsPublish(alert);
    }

    return {
        weather: weatherData,
        alerts_triggered: alerts.length,
        alerts
    };
}

async function populateInitialSampleData() {
    const existing = STORE.getWeatherHistory("Mumbai", 1);
    if (existing && existing.length > 0) return;

    console.log("[INITIALIZATION] Pre-populating historical weather time-series...");
    const profiles = {
        "Mumbai": { temp: 32.0, humidity: 75.0, wind: 14.0, press: 1008.0, code: 1 },
        "Pune": { temp: 28.5, humidity: 58.0, wind: 11.0, press: 1012.0, code: 0 },
        "Delhi": { temp: 35.2, humidity: 45.0, wind: 18.0, press: 1005.0, code: 1 },
        "Bengaluru": { temp: 25.0, humidity: 65.0, wind: 12.0, press: 1014.0, code: 2 },
        "London": { temp: 16.5, humidity: 78.0, wind: 22.0, press: 1018.0, code: 3 },
        "New York": { temp: 21.0, humidity: 55.0, wind: 16.0, press: 1015.0, code: 1 },
        "Tokyo": { temp: 24.0, humidity: 70.0, wind: 13.0, press: 1011.0, code: 2 }
    };

    const now = Date.now();
    for (const [cityName, prof] of Object.entries(profiles)) {
        const geo = await resolveCityCoordinates(cityName);
        for (let i = 24; i > 0; i--) {
            const t = new Date(now - i * 3600 * 1000);
            const variation = Math.sin(i * 0.3) * 3.5;
            const tempVal = parseFloat((prof.temp + variation).toFixed(1));
            const humVal = parseFloat(Math.min(98, Math.max(20, prof.humidity - variation * 2)).toFixed(1));
            const windVal = parseFloat(Math.max(3, prof.wind + Math.cos(i * 0.4) * 4).toFixed(1));
            const pressVal = parseFloat((prof.press + Math.sin(i * 0.2) * 2).toFixed(1));

            STORE.putWeatherReading({
                location: geo.name,
                latitude: geo.lat,
                longitude: geo.lon,
                timestamp: t.toISOString(),
                recorded_at: t.toISOString().replace("T", " ").substring(0, 19) + " UTC",
                temperature: tempVal,
                feels_like: parseFloat((tempVal + 1.8).toFixed(1)),
                humidity: humVal,
                wind_speed: windVal,
                wind_direction: 210.0,
                pressure: pressVal,
                precipitation: 0.0,
                weather_code: prof.code,
                condition: getWeatherDescription(prof.code),
                source: "Open-Meteo Historical Log"
            });
        }


        try {
            await executeCollectionForCity(cityName);
        } catch (e) {
            console.warn(`[WARN] Initial live fetch failed for ${cityName}:`, e.message);
        }
    }
    console.log("[INITIALIZATION] Sample history ready.");
}

function startBackgroundEventBridgeSimulator(intervalSeconds = 300) {
    console.log(`[EVENTBRIDGE SIMULATOR] Running background scheduled trigger every ${intervalSeconds}s...`);
    setInterval(async () => {
        try {
            for (const c of ["Mumbai", "Pune", "Delhi", "Bengaluru"]) {
                await executeCollectionForCity(c);
            }
            console.log(`[EVENTBRIDGE SIMULATOR] Scheduled ingestion executed at ${new Date().toISOString()}`);
        } catch (err) {
            console.error("[EVENTBRIDGE SIMULATOR ERROR]", err.message);
        }
    }, intervalSeconds * 1000);
}


const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon"
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(data, null, 2));
}


const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url, `http://${req.headers.host || "localhost:8000"}`);
    const pathname = reqUrl.pathname;
    const query = Object.fromEntries(reqUrl.searchParams.entries());
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") {
        res.writeHead(200, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        });
        res.end();
        return;
    }

    if (pathname.startsWith("/api/")) {
        const city = query.city || "Mumbai";

        if (pathname === "/api/weather/current" && method === "GET") {
            let item = STORE.getLatestWeather(city);
            if (!item) {
                const fetchRes = await executeCollectionForCity(city);
                item = fetchRes.weather;
            }
            return sendJson(res, 200, item);
        }

        if (pathname === "/api/weather/history" && method === "GET") {
            const limit = parseInt(query.limit || "48", 10);
            let history = STORE.getWeatherHistory(city, limit);
            if (!history || history.length === 0) {
                await executeCollectionForCity(city);
                history = STORE.getWeatherHistory(city, limit);
            }
            return sendJson(res, 200, { location: city, count: history.length, history });
        }

        if (pathname === "/api/alerts" && method === "GET") {
            const filterCity = query.city || null;
            const limit = parseInt(query.limit || "30", 10);
            const alerts = STORE.getAlerts(filterCity, limit);
            return sendJson(res, 200, { count: alerts.length, alerts });
        }

        if (pathname === "/api/thresholds" && method === "GET") {
            const thresholds = STORE.getThresholds(city);
            return sendJson(res, 200, thresholds);
        }

        if (pathname === "/api/cities" && method === "GET") {
            const cities = ["Mumbai", "Pune", "Delhi", "Bengaluru", "London", "New York", "Tokyo", "Sydney", "Paris", "San Francisco"];
            return sendJson(res, 200, { cities });
        }

        if (pathname === "/api/status" && method === "GET") {
            return sendJson(res, 200, {
                status: "ONLINE",
                runtime: "JavaScript (Node.js)",
                mode: "AWS Cloud Emulation Server",
                cloud_components: {
                    compute: "AWS Lambda (JavaScript / Node.js 20.x)",
                    scheduler: "Amazon EventBridge (Rate: 10 mins)",
                    database: "Amazon DynamoDB (WeatherDataHistory & WeatherAlerts)",
                    notifications: "Amazon SNS (WeatherAlertTopic)",
                    api_gateway: "REST API with CORS"
                },
                project: "Cloud-Based Weather Data Collector and Alert System using AWS",
                active_subscribers: (STORE.data.SNSSubscriptions || []).length,
                total_readings_stored: (STORE.data.WeatherDataHistory || []).length,
                total_alerts_logged: (STORE.data.WeatherAlerts || []).length
            });
        }

        if (pathname === "/api/subscriptions" && method === "GET") {
            const topicArn = "arn:aws:sns:ap-south-1:133197206940:weather-alert-SNS";
            exec(`aws sns list-subscriptions-by-topic --topic-arn "${topicArn}" --region ap-south-1 --no-paginate`, (err, stdout) => {
                if (!err && stdout) {
                    try {
                        const parsed = JSON.parse(stdout);
                        return sendJson(res, 200, {
                            source: "AWS_SNS",
                            topic_arn: topicArn,
                            subscriptions: parsed.Subscriptions || []
                        });
                    } catch (e) { }
                }
                return sendJson(res, 200, {
                    source: "LOCAL_STORE",
                    topic_arn: topicArn,
                    subscriptions: STORE.data.SNSSubscriptions || []
                });
            });
            return;
        }


        let bodyData = "";
        req.on("data", chunk => bodyData += chunk);
        req.on("end", async () => {
            let body = {};
            try {
                body = JSON.parse(bodyData || "{}");
            } catch (e) {
                body = {};
            }

            if (pathname === "/api/collect" && method === "POST") {
                const targetCity = body.city || "Mumbai";
                const locations = body.locations || [targetCity];
                const results = [];
                for (const loc of locations) {
                    const r = await executeCollectionForCity(loc);
                    results.push(r);
                }
                return sendJson(res, 200, {
                    message: `Successfully ingested weather data for ${results.length} location(s)`,
                    timestamp: new Date().toISOString(),
                    results
                });
            }

            if (pathname === "/api/simulate" && method === "POST") {
                const simCity = body.city || "Mumbai";
                const scenario = body.scenario || "heatwave";

                let simData = {};
                if (scenario === "heatwave") {
                    simData = { temperature: 43.5, feels_like: 48.0, humidity: 82.0, wind_speed: 18.0, pressure: 1004.0, weather_code: 1, condition: "Extreme Heatwave" };
                } else if (scenario === "storm") {
                    simData = { temperature: 22.0, feels_like: 20.0, humidity: 96.0, wind_speed: 62.0, pressure: 988.0, weather_code: 95, condition: "Severe Thunderstorm & Gale" };
                } else if (scenario === "gale") {
                    simData = { temperature: 24.0, feels_like: 22.0, humidity: 70.0, wind_speed: 58.0, pressure: 992.0, weather_code: 82, condition: "Violent Rain & High Wind" };
                } else if (scenario === "coldwave") {
                    simData = { temperature: 1.5, feels_like: -2.0, humidity: 90.0, wind_speed: 28.0, pressure: 1024.0, weather_code: 75, condition: "Severe Coldwave & Heavy Snow" };
                } else {
                    simData = body.custom || {};
                }

                const simResult = await executeCollectionForCity(simCity, simData);
                return sendJson(res, 200, {
                    message: `Simulated '${scenario}' event processed for ${simCity}`,
                    result: simResult
                });
            }

            if (pathname === "/api/thresholds" && method === "POST") {
                const loc = body.location || "Mumbai";
                STORE.setThresholds(loc, body);
                return sendJson(res, 200, { success: true, message: `Updated thresholds for ${loc}`, thresholds: body });
            }

            if (pathname === "/api/subscribe" && method === "POST") {
                const protocol = body.protocol || "email";
                const endpoint = body.endpoint || "";
                if (!endpoint) {
                    return sendJson(res, 400, { error: "Endpoint (email or phone) is required." });
                }
                const sub = STORE.addSubscription(protocol, endpoint);


                const topicArn = "arn:aws:sns:ap-south-1:133197206940:weather-alert-SNS";
                const cmd = `aws sns subscribe --topic-arn "${topicArn}" --protocol "${protocol}" --notification-endpoint "${endpoint}" --region ap-south-1`;
                exec(cmd, (err, stdout, stderr) => {
                    if (err) {
                        console.warn("[SNS] Live AWS CLI subscription note:", err.message);
                    } else {
                        console.log("[SNS] Live subscription registered in AWS:", stdout.trim());
                    }
                });

                return sendJson(res, 200, {
                    success: true,
                    subscription: sub,
                    message: `Successfully subscribed ${endpoint} to Amazon SNS weather-alert-SNS! Please check your inbox to confirm.`
                });
            }

            if (pathname === "/api/unsubscribe" && method === "POST") {
                const subArn = body.subscription_arn || "";
                if (!subArn || subArn === "PendingConfirmation") {
                    return sendJson(res, 400, { error: "Valid SubscriptionArn is required to unsubscribe." });
                }
                exec(`aws sns unsubscribe --subscription-arn "${subArn}" --region ap-south-1`, (err, stdout) => {
                    STORE.data.SNSSubscriptions = (STORE.data.SNSSubscriptions || []).filter(s => s.subscription_arn !== subArn);
                    STORE.save();
                    return sendJson(res, 200, { success: true, message: `Unsubscribed ${subArn}` });
                });
                return;
            }

            return sendJson(res, 404, { error: "API Endpoint not found", path: pathname });
        });
        return;
    }


    let filePath = path.join(FRONTEND_DIR, pathname === "/" ? "index.html" : pathname);
    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || "application/octet-stream";

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === "ENOENT") {
                res.writeHead(404, { "Content-Type": "text/html" });
                res.end("<h1>404 Not Found</h1>", "utf-8");
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content, "utf-8");
        }
    });
});

async function main() {
    await populateInitialSampleData();
    startBackgroundEventBridgeSimulator(300);

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            console.error(`\n[PORT CONFLICT] Port ${PORT} is already in use by another running instance.`);
            console.error(`To free port ${PORT}, run: Stop-Process -Id (Get-NetTCPConnection -LocalPort ${PORT}).OwningProcess -Force`);
            console.error(`Or close any previous Node.js terminal windows, then re-run.\n`);
        } else {
            console.error("[SERVER ERROR]", err);
        }
        process.exit(1);
    });

    server.listen(PORT, () => {
        console.log("=".repeat(68));
        console.log(" [CLOUD] AWS WEATHER DATA COLLECTOR & ALERT SYSTEM");
        console.log(" [STACK] Full-Stack Cloud Native (Node.js + HTML5/CSS3/JS)");
        console.log("=".repeat(68));
        console.log(` [RUNNING] Web Dashboard available at: http://localhost:${PORT}`);
        console.log(` [SIMULATOR] Local Cloud: Lambda + DynamoDB + EventBridge + SNS active`);
        console.log("=".repeat(68));
    });
}

main().catch(console.error);
