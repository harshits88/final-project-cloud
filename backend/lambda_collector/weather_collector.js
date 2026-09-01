const https = require("https");

// --------------------------------------------------
// Known city coordinates
// --------------------------------------------------

const KNOWN_COORDINATES = {
    mumbai: {
        lat: 19.0760,
        lon: 72.8777,
        name: "Mumbai",
        country: "India"
    },

    pune: {
        lat: 18.5204,
        lon: 73.8567,
        name: "Pune",
        country: "India"
    },

    delhi: {
        lat: 28.6139,
        lon: 77.2090,
        name: "Delhi",
        country: "India"
    },

    bengaluru: {
        lat: 12.9716,
        lon: 77.5946,
        name: "Bengaluru",
        country: "India"
    }
};

// --------------------------------------------------
// Weather descriptions
// --------------------------------------------------

const WMO_WEATHER_CODES = {
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
    95: "Thunderstorm",
    96: "Thunderstorm with Hail",
    99: "Severe Thunderstorm with Heavy Hail"
};

function getWeatherDescription(code) {
    return WMO_WEATHER_CODES[code] ||
        `Weather Condition (Code ${code})`;
}

// --------------------------------------------------
// Resolve city coordinates
// --------------------------------------------------

async function resolveCityCoordinates(cityName) {

    const cleanName = String(cityName).trim().toLowerCase();

    // First use known cities
    if (KNOWN_COORDINATES[cleanName]) {
        return KNOWN_COORDINATES[cleanName];
    }

    // Dynamic Open-Meteo geocoding
    const url =
        "https://geocoding-api.open-meteo.com/v1/search" +
        `?name=${encodeURIComponent(cityName)}` +
        "&count=1&language=en&format=json";

    return new Promise((resolve, reject) => {

        https.get(url, {
            headers: {
                "User-Agent": "AWS-Weather-Collector"
            }
        }, response => {

            let data = "";

            response.on("data", chunk => {
                data += chunk;
            });

            response.on("end", () => {

                try {

                    const json = JSON.parse(data);

                    if (json.results && json.results.length > 0) {

                        const r = json.results[0];

                        resolve({
                            lat: Number(r.latitude),
                            lon: Number(r.longitude),
                            name: r.name,
                            country: r.country || "Global"
                        });

                    } else {
                        reject(
                            new Error(`City not found: ${cityName}`)
                        );
                    }

                } catch (error) {
                    reject(error);
                }

            });

        }).on("error", reject);
    });
}

// --------------------------------------------------
// Fetch live weather
// --------------------------------------------------

async function fetchLiveWeather(lat, lon, locationName) {

    const url =
        "https://api.open-meteo.com/v1/forecast" +
        `?latitude=${lat}` +
        `&longitude=${lon}` +
        "&current=temperature_2m,relative_humidity_2m," +
        "apparent_temperature,precipitation,weather_code," +
        "surface_pressure,wind_speed_10m,wind_direction_10m" +
        "&timezone=auto";

    return new Promise((resolve, reject) => {

        https.get(url, {
            headers: {
                "User-Agent": "AWS-Weather-Collector"
            }
        }, response => {

            let data = "";

            response.on("data", chunk => {
                data += chunk;
            });

            response.on("end", () => {

                try {

                    const json = JSON.parse(data);
                    const current = json.current || {};

                    const weatherCode =
                        Number(current.weather_code || 0);

                    resolve({
                        location: locationName,
                        latitude: lat,
                        longitude: lon,
                        timestamp: new Date().toISOString(),

                        temperature:
                            Number(current.temperature_2m || 0),

                        feels_like:
                            Number(current.apparent_temperature || 0),

                        humidity:
                            Number(current.relative_humidity_2m || 0),

                        wind_speed:
                            Number(current.wind_speed_10m || 0),

                        wind_direction:
                            Number(current.wind_direction_10m || 0),

                        pressure:
                            Number(current.surface_pressure || 1013),

                        precipitation:
                            Number(current.precipitation || 0),

                        weather_code: weatherCode,

                        condition:
                            getWeatherDescription(weatherCode),

                        source:
                            "Open-Meteo Meteorological API"
                    });

                } catch (error) {
                    reject(error);
                }

            });

        }).on("error", reject);
    });
}

// --------------------------------------------------
// Process one city
// --------------------------------------------------

async function processCityWeather(cityName) {

    const geo = await resolveCityCoordinates(cityName);

    const weather = await fetchLiveWeather(
        geo.lat,
        geo.lon,
        geo.name
    );

    return {
        ...weather,
        country: geo.country
    };
}

// --------------------------------------------------
// Lambda handler
// --------------------------------------------------

// Environment Configurations
const AWS_REGION = process.env.AWS_REGION || "ap-south-1";
const WEATHER_TABLE_NAME = process.env.WEATHER_TABLE_NAME || "weather-alert-dynamoDB";
const ALERTS_TABLE_NAME = process.env.ALERTS_TABLE_NAME || "weather-alert-dynamoDB";
const THRESHOLDS_TABLE_NAME = process.env.THRESHOLDS_TABLE_NAME || "ThresholdConfigs";
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN || "arn:aws:sns:ap-south-1:133197206940:weather-alert-SNS";
const DEFAULT_LOCATIONS = (process.env.LOCATIONS || "Mumbai,Pune,Delhi,Bengaluru,London,New York,Tokyo").split(",");

async function handler(event = {}) {

    console.log(
        "[WEATHER COLLECTOR] Event:",
        JSON.stringify(event)
    );

    const cities =
        Array.isArray(event.locations)
            ? event.locations
            : event.city
                ? [event.city]
                : DEFAULT_LOCATIONS;

    const results = [];

    for (const city of cities) {

        try {

            const result =
                await processCityWeather(city);

            results.push({
                status: "SUCCESS",
                ...result
            });

        } catch (error) {

            results.push({
                status: "ERROR",
                location: city,
                error: error.message
            });
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
            status: "SUCCESS",
            processed_locations: results.length,
            results
        })
    };
}

// --------------------------------------------------
// EXPORTS
// IMPORTANT: exports are at the VERY BOTTOM
// --------------------------------------------------

module.exports = {
    handler,
    resolveCityCoordinates,
    fetchLiveWeather,
    processCityWeather,
    getWeatherDescription
};