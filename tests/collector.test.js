/**
 * Unit Tests for Weather Data Collector & Threshold Engine (JavaScript)
 * Uses Node.js native test runner (node:test)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { evaluateWeatherData, getWeatherDescription } = require("../backend/lambda_collector/threshold_checker");
const { resolveCityCoordinates } = require("../backend/lambda_collector/weather_collector.js");

describe("Threshold Checker Engine", () => {

  it("should generate 0 alerts for normal weather conditions", () => {
    const normalReading = {
      location: "Mumbai",
      temperature: 28.0,
      humidity: 65.0,
      wind_speed: 15.0,
      pressure: 1012.0,
      weather_code: 1
    };
    const alerts = evaluateWeatherData(normalReading);
    assert.strictEqual(alerts.length, 0);
  });

  it("should trigger HIGH_TEMPERATURE alert when temp exceeds 38°C", () => {
    const hotReading = {
      location: "Delhi",
      temperature: 42.5,
      humidity: 40.0,
      wind_speed: 12.0,
      pressure: 1008.0,
      weather_code: 0
    };
    const alerts = evaluateWeatherData(hotReading);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].alert_type, "HIGH_TEMPERATURE");
    assert.strictEqual(alerts[0].severity, "CRITICAL");
    assert.strictEqual(alerts[0].metric_value, 42.5);
  });

  it("should trigger LOW_TEMPERATURE alert when temp drops below 5°C", () => {
    const freezingReading = {
      location: "Shimla",
      temperature: 1.5,
      humidity: 75.0,
      wind_speed: 10.0,
      pressure: 1022.0,
      weather_code: 71
    };
    const alerts = evaluateWeatherData(freezingReading);
    assert.ok(alerts.some(a => a.alert_type === "LOW_TEMPERATURE"));
  });

  it("should trigger HIGH_WIND alert when wind speed >= 45 km/h", () => {
    const windyReading = {
      location: "Pune",
      temperature: 25.0,
      humidity: 60.0,
      wind_speed: 55.0,
      pressure: 1002.0,
      weather_code: 2
    };
    const alerts = evaluateWeatherData(windyReading);
    assert.ok(alerts.some(a => a.alert_type === "HIGH_WIND"));
  });

  it("should trigger SEVERE_WEATHER_CONDITION on thunderstorm code 95", () => {
    const stormReading = {
      location: "Bengaluru",
      temperature: 21.0,
      humidity: 95.0,
      wind_speed: 30.0,
      pressure: 994.0,
      weather_code: 95
    };
    const alerts = evaluateWeatherData(stormReading);
    assert.ok(alerts.some(a => a.alert_type === "SEVERE_WEATHER_CONDITION"));
    assert.ok(alerts.some(a => a.alert_type === "LOW_PRESSURE_STORM"));
  });

  it("should respect custom threshold overrides", () => {
    const reading = {
      location: "London",
      temperature: 32.0, // Below default 38°C, but above custom 30°C
      humidity: 50.0,
      wind_speed: 10.0,
      pressure: 1015.0,
      weather_code: 0
    };
    const custom = { max_temperature: 30.0 };
    const alerts = evaluateWeatherData(reading, custom);
    assert.strictEqual(alerts.length, 1);
    assert.strictEqual(alerts[0].alert_type, "HIGH_TEMPERATURE");
  });

});

describe("Geocoding & City Coordinate Resolver", () => {

  it("should resolve coordinates for known city Mumbai", async () => {
    const res = await resolveCityCoordinates("Mumbai");
    assert.strictEqual(res.name, "Mumbai");
    assert.strictEqual(Math.round(res.lat), 19);
  });

  it("should resolve coordinates for known city Pune", async () => {
    const res = await resolveCityCoordinates("Pune");
    assert.strictEqual(res.name, "Pune");
    assert.strictEqual(Math.round(res.lat), 19);
  });

});
