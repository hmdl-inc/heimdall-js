/**
 * Tests for configuration module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig, validateConfig, HeimdallConfig } from "../src/config";

describe("resolveConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("should use default values when no config or env vars provided", () => {
    delete process.env.HEIMDALL_API_KEY;
    delete process.env.HEIMDALL_ENDPOINT;
    delete process.env.HEIMDALL_SERVICE_NAME;

    const config = resolveConfig({});

    expect(config.endpoint).toBe("https://api.heimdall.dev");
    expect(config.serviceName).toBe("mcp-server");
    expect(config.environment).toBe("development");
    expect(config.enabled).toBe(true);
    expect(config.debug).toBe(false);
    expect(config.batchSize).toBe(100);
    expect(config.flushIntervalMs).toBe(5000);
    expect(config.maxQueueSize).toBe(1000);
  });

  it("should use environment variables", () => {
    process.env.HEIMDALL_API_KEY = "env-api-key";
    process.env.HEIMDALL_ENDPOINT = "https://env.heimdall.dev";
    process.env.HEIMDALL_SERVICE_NAME = "env-service";
    process.env.HEIMDALL_ENVIRONMENT = "production";
    process.env.HEIMDALL_ENABLED = "false";
    process.env.HEIMDALL_DEBUG = "true";

    const config = resolveConfig({});

    expect(config.apiKey).toBe("env-api-key");
    expect(config.endpoint).toBe("https://env.heimdall.dev");
    expect(config.serviceName).toBe("env-service");
    expect(config.environment).toBe("production");
    expect(config.enabled).toBe(false);
    expect(config.debug).toBe(true);
  });

  it("should prefer explicit config over environment variables", () => {
    process.env.HEIMDALL_API_KEY = "env-api-key";
    process.env.HEIMDALL_SERVICE_NAME = "env-service";

    const config = resolveConfig({
      apiKey: "explicit-api-key",
      serviceName: "explicit-service",
    });

    expect(config.apiKey).toBe("explicit-api-key");
    expect(config.serviceName).toBe("explicit-service");
  });

  it("should handle numeric environment variables", () => {
    process.env.HEIMDALL_BATCH_SIZE = "200";
    process.env.HEIMDALL_FLUSH_INTERVAL_MS = "10000";
    process.env.HEIMDALL_MAX_QUEUE_SIZE = "2000";

    const config = resolveConfig({});

    expect(config.batchSize).toBe(200);
    expect(config.flushIntervalMs).toBe(10000);
    expect(config.maxQueueSize).toBe(2000);
  });

  it("should use default for invalid numeric environment variables", () => {
    process.env.HEIMDALL_BATCH_SIZE = "invalid";

    const config = resolveConfig({});

    expect(config.batchSize).toBe(100);
  });

  it("should include custom metadata", () => {
    const config = resolveConfig({
      metadata: { custom: "value", version: "1.0.0" },
    });

    expect(config.metadata).toEqual({ custom: "value", version: "1.0.0" });
  });
});

describe("validateConfig", () => {
  it("should not throw when API key is missing (API key is optional for local dev)", () => {
    const config = resolveConfig({ enabled: true });

    // API key is now optional for local development
    expect(() => validateConfig(config)).not.toThrow();
  });

  it("should not throw when API key is missing but disabled", () => {
    const config = resolveConfig({ enabled: false });

    expect(() => validateConfig(config)).not.toThrow();
  });

  it("should throw for invalid batch size", () => {
    const config = resolveConfig({
      apiKey: "test-key",
      batchSize: 0,
    });

    expect(() => validateConfig(config)).toThrow("batchSize must be at least 1");
  });

  it("should throw for invalid flush interval", () => {
    const config = resolveConfig({
      apiKey: "test-key",
      flushIntervalMs: 50,
    });

    expect(() => validateConfig(config)).toThrow("flushIntervalMs must be at least 100");
  });

  it("should throw when max queue size is less than batch size", () => {
    const config = resolveConfig({
      apiKey: "test-key",
      batchSize: 100,
      maxQueueSize: 50,
    });

    expect(() => validateConfig(config)).toThrow("maxQueueSize must be at least batchSize");
  });

  it("should pass validation with valid config", () => {
    const config = resolveConfig({
      apiKey: "test-key",
      batchSize: 100,
      flushIntervalMs: 5000,
      maxQueueSize: 1000,
    });

    expect(() => validateConfig(config)).not.toThrow();
  });
});

