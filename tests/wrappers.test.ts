/**
 * Tests for wrapper functions
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { traceMCPTool } from "../src/wrappers";
import { HeimdallClient } from "../src/client";

// Mock the client module
vi.mock("../src/client", () => ({
  HeimdallClient: {
    getInstance: vi.fn().mockReturnValue(null),
  },
}));

describe("traceMCPTool", () => {
  beforeEach(() => {
    vi.mocked(HeimdallClient.getInstance).mockReturnValue(null);
  });

  it("should wrap a sync function", async () => {
    const originalFn = (query: string, limit: number) => {
      return { results: [query], limit };
    };

    const wrapped = traceMCPTool(originalFn, { name: "search-tool" });
    const result = await wrapped("test query", 10);

    expect(result).toEqual({ results: ["test query"], limit: 10 });
  });

  it("should wrap an async function", async () => {
    const originalFn = async (query: string) => {
      return { results: [query] };
    };

    const wrapped = traceMCPTool(originalFn, { name: "async-search" });
    const result = await wrapped("test");

    expect(result).toEqual({ results: ["test"] });
  });

  it("should propagate errors", async () => {
    const originalFn = () => {
      throw new Error("test error");
    };

    const wrapped = traceMCPTool(originalFn, { name: "failing-tool" });

    await expect(wrapped()).rejects.toThrow("test error");
  });

  it("should use function name as default span name", async () => {
    function namedFunction() {
      return "result";
    }

    const wrapped = traceMCPTool(namedFunction);
    const result = await wrapped();

    expect(result).toBe("result");
  });

  it("should handle multiple arguments", async () => {
    const searchTool = (query: string, limit: number, offset: number) => {
      return { query, limit, offset };
    };

    const wrapped = traceMCPTool(searchTool, { name: "search" });
    const result = await wrapped("test", 10, 5);

    expect(result).toEqual({ query: "test", limit: 10, offset: 5 });
  });

  it("should handle dictionary return values", async () => {
    const calculator = (a: number, b: number) => {
      return { sum: a + b, product: a * b, difference: a - b };
    };

    const wrapped = traceMCPTool(calculator, { name: "calculator" });
    const result = await wrapped(10, 3);

    expect(result).toEqual({ sum: 13, product: 30, difference: 7 });
  });

  it("should handle async errors", async () => {
    const failingAsyncFn = async () => {
      throw new Error("async error");
    };

    const wrapped = traceMCPTool(failingAsyncFn, { name: "failing-async" });

    await expect(wrapped()).rejects.toThrow("async error");
  });

  it("should handle functions with default parameters", async () => {
    const weatherTool = (city: string, units: string = "celsius") => {
      return { city, units, temp: 20 };
    };

    const wrapped = traceMCPTool(weatherTool, { name: "weather" });

    const result1 = await wrapped("NYC");
    expect(result1).toEqual({ city: "NYC", units: "celsius", temp: 20 });

    const result2 = await wrapped("LA", "fahrenheit");
    expect(result2).toEqual({ city: "LA", units: "fahrenheit", temp: 20 });
  });

  it("should accept paramNames option", async () => {
    const searchTool = (query: string, limit: number) => {
      return { query, limit };
    };

    const wrapped = traceMCPTool(searchTool, {
      name: "search",
      paramNames: ["query", "limit"],
    });

    const result = await wrapped("test", 10);
    expect(result).toEqual({ query: "test", limit: 10 });
  });
});

