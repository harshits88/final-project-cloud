/**
 * Unit Tests for Weather API Handler (JavaScript)
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { handler } = require("../backend/lambda_api/api_handler");

describe("Weather API Gateway Handler", () => {

  it("should return HEALTHY status and student names on /api/health", async () => {
    const event = {
      httpMethod: "GET",
      path: "/api/health"
    };
    const res = await handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.status, "HEALTHY");
    assert.ok(body.students.some(s => s.includes("Abhishek Patil")));
  });

  it("should handle CORS preflight OPTIONS request", async () => {
    const event = {
      httpMethod: "OPTIONS",
      path: "/api/weather/current"
    };
    const res = await handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "*");
  });

  it("should return pre-configured major cities list on /api/cities", async () => {
    const event = {
      httpMethod: "GET",
      path: "/api/cities"
    };
    const res = await handler(event, {});
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.ok(body.cities.includes("Mumbai"));
    assert.ok(body.cities.includes("Pune"));
  });

  it("should return 404 for unknown routes", async () => {
    const event = {
      httpMethod: "GET",
      path: "/api/unknown-route"
    };
    const res = await handler(event, {});
    assert.strictEqual(res.statusCode, 404);
  });

});
