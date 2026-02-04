/**
 * Tests for HeimdallClient
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HeimdallClient } from "../src/client";

// Mock OpenTelemetry modules
vi.mock("@opentelemetry/sdk-trace-node", () => ({
  NodeTracerProvider: vi.fn().mockImplementation(() => ({
    addSpanProcessor: vi.fn(),
    register: vi.fn(),
    forceFlush: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@opentelemetry/sdk-trace-base", () => ({
  BatchSpanProcessor: vi.fn(),
}));

vi.mock("@opentelemetry/exporter-trace-otlp-grpc", () => ({
  OTLPTraceExporter: vi.fn(),
}));

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue({
      startSpan: vi.fn().mockReturnValue({
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn(),
      }),
    }),
    setSpan: vi.fn(),
    getActiveSpan: vi.fn(),
  },
  context: {
    active: vi.fn(),
    with: vi.fn((ctx, fn) => fn()),
  },
  SpanKind: {
    INTERNAL: 0,
    SERVER: 1,
    CLIENT: 2,
  },
  SpanStatusCode: {
    UNSET: 0,
    OK: 1,
    ERROR: 2,
  },
}));

describe("HeimdallClient", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.HEIMDALL_ENABLED = "false";
  });

  afterEach(async () => {
    process.env = originalEnv;
    await HeimdallClient.reset();
  });

  describe("singleton pattern", () => {
    it("should return the same instance", () => {
      const client1 = new HeimdallClient();
      const client2 = new HeimdallClient();

      expect(client1).toBe(client2);
    });

    it("should return instance via getInstance", () => {
      expect(HeimdallClient.getInstance()).toBeNull();

      const client = new HeimdallClient();

      expect(HeimdallClient.getInstance()).toBe(client);
    });

    it("should reset instance", async () => {
      new HeimdallClient();
      expect(HeimdallClient.getInstance()).not.toBeNull();

      await HeimdallClient.reset();

      expect(HeimdallClient.getInstance()).toBeNull();
    });
  });

  describe("disabled client", () => {
    it("should not set up tracing when disabled", () => {
      process.env.HEIMDALL_ENABLED = "false";

      const client = new HeimdallClient();

      expect(client["provider"]).toBeNull();
      expect(client["tracer"]).toBeNull();
    });

    it("should return a tracer even when disabled", () => {
      process.env.HEIMDALL_ENABLED = "false";

      const client = new HeimdallClient();
      const tracer = client.getTracer();

      expect(tracer).toBeDefined();
    });
  });

  describe("configuration", () => {
    it("should accept config object", () => {
      const client = new HeimdallClient({
        apiKey: "test-key",
        serviceName: "test-service",
        enabled: false,
      });

      expect(client["config"].apiKey).toBe("test-key");
      expect(client["config"].serviceName).toBe("test-service");
    });
  });

  describe("flush and shutdown", () => {
    it("should not throw when flushing disabled client", async () => {
      const client = new HeimdallClient({ enabled: false });

      await expect(client.flush()).resolves.not.toThrow();
    });

    it("should not throw when shutting down disabled client", async () => {
      const client = new HeimdallClient({ enabled: false });

      await expect(client.shutdown()).resolves.not.toThrow();
    });
  });

  describe("getCurrentSpan", () => {
    it("should return undefined when no active span", () => {
      const client = new HeimdallClient({ enabled: false });

      // Should not throw, returns undefined when no active span
      const span = client.getCurrentSpan();
      expect(span).toBeUndefined();
    });
  });

  describe("session and user ID management", () => {
    it("should get and set session ID", () => {
      const client = new HeimdallClient({ enabled: false });

      expect(client.getSessionId()).toBeUndefined();

      client.setSessionId("session-123");
      expect(client.getSessionId()).toBe("session-123");

      client.setSessionId(undefined);
      expect(client.getSessionId()).toBeUndefined();
    });

    it("should get and set user ID", () => {
      const client = new HeimdallClient({ enabled: false });

      expect(client.getUserId()).toBeUndefined();

      client.setUserId("user-456");
      expect(client.getUserId()).toBe("user-456");

      client.setUserId(undefined);
      expect(client.getUserId()).toBeUndefined();
    });

    it("should initialize session ID from environment variable", async () => {
      await HeimdallClient.reset();
      process.env.HEIMDALL_SESSION_ID = "env-session-id";
      process.env.HEIMDALL_ENABLED = "false";

      const client = new HeimdallClient();

      expect(client.getSessionId()).toBe("env-session-id");

      delete process.env.HEIMDALL_SESSION_ID;
    });

    it("should initialize user ID from environment variable", async () => {
      await HeimdallClient.reset();
      process.env.HEIMDALL_USER_ID = "env-user-id";
      process.env.HEIMDALL_ENABLED = "false";

      const client = new HeimdallClient();

      expect(client.getUserId()).toBe("env-user-id");

      delete process.env.HEIMDALL_USER_ID;
    });
  });

  describe("getConfig", () => {
    it("should return config without API key for security", () => {
      const client = new HeimdallClient({
        apiKey: "secret-api-key",
        serviceName: "test-service",
        enabled: false,
      });

      const config = client.getConfig();

      expect(config.serviceName).toBe("test-service");
      expect((config as Record<string, unknown>).apiKey).toBeUndefined();
    });
  });
});

