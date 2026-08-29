/**
 * Threshold Checker Module (JavaScript / Node.js)
 * Evaluates real-time meteorological metrics against safety thresholds.
 * Detects anomalies such as Heatwaves, Coldwaves, High Winds, Extreme Humidity, and Severe Storms.
 */

const DEFAULT_THRESHOLDS = {
  max_temperature: 38.0,      // °C - Extreme heat / Heatwave alert
  min_temperature: 5.0,       // °C - Freezing / Coldwave alert
  max_wind_speed: 45.0,       // km/h - Gale-force / Storm wind warning
  max_humidity: 85.0,         // % - Extreme humidity / Heat distress
  min_humidity: 15.0,         // % - Dry air / Wildfire risk
  min_pressure: 995.0,        // hPa - Low pressure / Cyclonic depression
  severe_weather_codes: [
    65, 67, 75, 77, 82, 86, 95, 96, 99 // WMO codes: Heavy Rain, Heavy Snow, Thunderstorm, Hail
  ]
};

const WMO_WEATHER_DESCRIPTIONS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail"
};

function getWeatherDescription(code) {
  return WMO_WEATHER_DESCRIPTIONS[code] || "Unknown Meteorological Condition";
}

function evaluateWeatherData(weatherData, customThresholds = null) {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(customThresholds || {}) };
  const alerts = [];
  
  const location = weatherData.location || "Unknown Location";
  const stationId = weatherData.station_id || `STN_${location.toUpperCase().replace(/\s+/g, "_").slice(0, 8)}_01`;
  const timestamp = weatherData.timestamp || new Date().toISOString();

  const temp = weatherData.temperature;
  const humidity = weatherData.humidity;
  const windSpeed = weatherData.wind_speed;
  const pressure = weatherData.pressure;
  const weatherCode = weatherData.weather_code;

  // 1. High Temperature Alert (Heatwave)
  if (temp !== undefined && temp !== null && temp >= thresholds.max_temperature) {
    alerts.push({
      station_id: stationId,
      alert_type: "HIGH_TEMPERATURE",
      severity: temp >= (thresholds.max_temperature + 4) ? "CRITICAL" : "WARNING",
      location: location,
      metric_name: "temperature",
      metric_value: temp,
      threshold_value: thresholds.max_temperature,
      unit: "°C",
      timestamp: timestamp,
      title: `Extreme Heat Warning in ${location}`,
      message: `Temperature reached ${temp}°C, exceeding safety limit of ${thresholds.max_temperature}°C. Stay hydrated and avoid outdoor exposure.`
    });
  }

  // 2. Low Temperature Alert (Freezing/Coldwave)
  if (temp !== undefined && temp !== null && temp <= thresholds.min_temperature) {
    alerts.push({
      station_id: stationId,
      alert_type: "LOW_TEMPERATURE",
      severity: temp <= 0 ? "CRITICAL" : "WARNING",
      location: location,
      metric_name: "temperature",
      metric_value: temp,
      threshold_value: thresholds.min_temperature,
      unit: "°C",
      timestamp: timestamp,
      title: `Cold Wave / Frost Alert in ${location}`,
      message: `Temperature plunged to ${temp}°C, below minimum threshold of ${thresholds.min_temperature}°C. Frost precautions recommended.`
    });
  }

  // 3. High Wind Speed Alert (Gale / Storm Warning)
  if (windSpeed !== undefined && windSpeed !== null && windSpeed >= thresholds.max_wind_speed) {
    alerts.push({
      station_id: stationId,
      alert_type: "HIGH_WIND",
      severity: windSpeed >= (thresholds.max_wind_speed + 20) ? "CRITICAL" : "WARNING",
      location: location,
      metric_name: "wind_speed",
      metric_value: windSpeed,
      threshold_value: thresholds.max_wind_speed,
      unit: "km/h",
      timestamp: timestamp,
      title: `High Wind Advisory for ${location}`,
      message: `Wind velocity recorded at ${windSpeed} km/h (Threshold: ${thresholds.max_wind_speed} km/h). Secure outdoor items.`
    });
  }

  // 4. Extreme Humidity Alert
  if (humidity !== undefined && humidity !== null && humidity >= thresholds.max_humidity) {
    alerts.push({
      station_id: stationId,
      alert_type: "HIGH_HUMIDITY",
      severity: "WARNING",
      location: location,
      metric_name: "humidity",
      metric_value: humidity,
      threshold_value: thresholds.max_humidity,
      unit: "%",
      timestamp: timestamp,
      title: `High Humidity Warning in ${location}`,
      message: `Relative humidity surged to ${humidity}%, exceeding threshold of ${thresholds.max_humidity}%. High risk of heat distress.`
    });
  }

  // 5. Low Atmospheric Pressure (Storm / Depression)
  if (pressure !== undefined && pressure !== null && pressure <= thresholds.min_pressure) {
    alerts.push({
      station_id: stationId,
      alert_type: "LOW_PRESSURE_STORM",
      severity: "WARNING",
      location: location,
      metric_name: "pressure",
      metric_value: pressure,
      threshold_value: thresholds.min_pressure,
      unit: "hPa",
      timestamp: timestamp,
      title: `Barometric Pressure Drop in ${location}`,
      message: `Atmospheric pressure dropped to ${pressure} hPa (Threshold: ${thresholds.min_pressure} hPa), indicating storm development.`
    });
  }

  // 6. Severe Weather Event (Thunderstorm, Heavy Snow, Violent Rain)
  if (thresholds.severe_weather_codes && thresholds.severe_weather_codes.includes(weatherCode)) {
    const conditionName = getWeatherDescription(weatherCode);
    alerts.push({
      station_id: stationId,
      alert_type: "SEVERE_WEATHER_CONDITION",
      severity: "CRITICAL",
      location: location,
      metric_name: "weather_code",
      metric_value: weatherCode,
      threshold_value: `WMO Code ${weatherCode}`,
      unit: "code",
      timestamp: timestamp,
      title: `Severe Weather Alert: ${conditionName} in ${location}`,
      message: `Severe condition detected: ${conditionName}. Exercise extreme caution and monitor local advisories.`
    });
  }

  return alerts;
}

module.exports = {
  DEFAULT_THRESHOLDS,
  WMO_WEATHER_DESCRIPTIONS,
  getWeatherDescription,
  evaluateWeatherData
};
