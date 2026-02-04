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

  describe("session and user extraction", () => {
    it("should accept sessionExtractor option", async () => {
      const myTool = (ctx: { sessionId: string }, query: string) => {
        return { query, ctx };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        sessionExtractor: (args) => (args[0] as { sessionId: string })?.sessionId,
      });

      const result = await wrapped({ sessionId: "session-123" }, "test");
      expect(result).toEqual({ query: "test", ctx: { sessionId: "session-123" } });
    });

    it("should accept userExtractor option", async () => {
      const myTool = (ctx: { userId: string }, query: string) => {
        return { query, ctx };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        userExtractor: (args) => (args[0] as { userId: string })?.userId,
      });

      const result = await wrapped({ userId: "user-456" }, "test");
      expect(result).toEqual({ query: "test", ctx: { userId: "user-456" } });
    });

    it("should accept headers option", async () => {
      const myTool = (query: string) => {
        return { query };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        headers: {
          "Mcp-Session-Id": "header-session-123",
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoZWFkZXItdXNlci00NTYifQ.sig",
        },
      });

      const result = await wrapped("test");
      expect(result).toEqual({ query: "test" });
    });

    it("should handle case-insensitive headers", async () => {
      const myTool = (query: string) => {
        return { query };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        headers: {
          "mcp-session-id": "lowercase-session",
          "authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJsb3dlcmNhc2UtdXNlciJ9.sig",
        },
      });

      const result = await wrapped("test");
      expect(result).toEqual({ query: "test" });
    });

    it("should handle extractors that throw errors gracefully", async () => {
      const myTool = (query: string) => {
        return { query };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        sessionExtractor: () => {
          throw new Error("Extraction failed");
        },
        userExtractor: () => {
          throw new Error("Extraction failed");
        },
      });

      // Should not throw, just ignore the extraction error
      const result = await wrapped("test");
      expect(result).toEqual({ query: "test" });
    });

    it("should handle undefined values from extractors", async () => {
      const myTool = (query: string) => {
        return { query };
      };

      const wrapped = traceMCPTool(myTool, {
        name: "my-tool",
        sessionExtractor: () => undefined,
        userExtractor: () => undefined,
      });

      const result = await wrapped("test");
      expect(result).toEqual({ query: "test" });
    });
  });
});

