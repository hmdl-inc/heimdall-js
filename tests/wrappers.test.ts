/**
 * Tests for wrapper functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  traceMCPTool,
  traceMCPResource,
  traceMCPPrompt,
  observe,
} from "../src/wrappers";
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
});

describe("traceMCPResource", () => {
  beforeEach(() => {
    vi.mocked(HeimdallClient.getInstance).mockReturnValue(null);
  });

  it("should wrap a resource function", async () => {
    const readFile = (uri: string) => {
      return `content of ${uri}`;
    };

    const wrapped = traceMCPResource(readFile, { name: "read-file" });
    const result = await wrapped("file://test.txt");

    expect(result).toBe("content of file://test.txt");
  });

  it("should handle async resource functions", async () => {
    const readFile = async (uri: string) => {
      return `async content of ${uri}`;
    };

    const wrapped = traceMCPResource(readFile);
    const result = await wrapped("file://test.txt");

    expect(result).toBe("async content of file://test.txt");
  });
});

describe("traceMCPPrompt", () => {
  beforeEach(() => {
    vi.mocked(HeimdallClient.getInstance).mockReturnValue(null);
  });

  it("should wrap a prompt function", async () => {
    const generatePrompt = (context: string) => {
      return [{ role: "user", content: context }];
    };

    const wrapped = traceMCPPrompt(generatePrompt, { name: "generate-prompt" });
    const result = await wrapped("hello world");

    expect(result).toEqual([{ role: "user", content: "hello world" }]);
  });
});

describe("observe", () => {
  beforeEach(() => {
    vi.mocked(HeimdallClient.getInstance).mockReturnValue(null);
  });

  it("should wrap a sync function", async () => {
    const processData = (data: { value: number }) => {
      return { ...data, processed: true };
    };

    const wrapped = observe(processData, { name: "process-data" });
    const result = await wrapped({ value: 42 });

    expect(result).toEqual({ value: 42, processed: true });
  });

  it("should wrap an async function", async () => {
    const asyncProcess = async (x: number) => {
      return x * 2;
    };

    const wrapped = observe(asyncProcess);
    const result = await wrapped(5);

    expect(result).toBe(10);
  });

  it("should propagate errors", async () => {
    const failingFn = () => {
      throw new Error("observe error");
    };

    const wrapped = observe(failingFn);

    await expect(wrapped()).rejects.toThrow("observe error");
  });

  it("should work with options", async () => {
    const fn = (secret: string) => {
      return `processed: ${secret}`;
    };

    const wrapped = observe(fn, {
      name: "custom-name",
      captureInput: false,
      captureOutput: false,
    });

    const result = await wrapped("secret-data");
    expect(result).toBe("processed: secret-data");
  });
});

