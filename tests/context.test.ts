/**
 * Tests for MCP context management and JWT parsing
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseJwtClaims,
  extractUserIdFromToken,
  createMCPContext,
  getMCPContext,
  runWithMCPContext,
  runWithMCPContextAsync,
  MCP_SESSION_ID_HEADER,
  AUTHORIZATION_HEADER,
} from "../src/context";

/**
 * Helper to create a JWT token for testing (without signature verification)
 */
function createJwtToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
    .toString("base64url");
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = "test_signature";
  return `${header}.${payload}.${signature}`;
}

describe("parseJwtClaims", () => {
  it("should parse a valid JWT token", () => {
    const token = createJwtToken({ sub: "user-123", name: "Test User" });
    const claims = parseJwtClaims(token);
    expect(claims.sub).toBe("user-123");
    expect(claims.name).toBe("Test User");
  });

  it("should parse JWT with Bearer prefix", () => {
    const token = createJwtToken({ sub: "user-456" });
    const claims = parseJwtClaims(`Bearer ${token}`);
    expect(claims.sub).toBe("user-456");
  });

  it("should parse JWT with lowercase bearer prefix", () => {
    const token = createJwtToken({ sub: "user-789" });
    const claims = parseJwtClaims(`bearer ${token}`);
    expect(claims.sub).toBe("user-789");
  });

  it("should return empty object for invalid JWT", () => {
    expect(parseJwtClaims("not-a-jwt")).toEqual({});
    expect(parseJwtClaims("only.two")).toEqual({});
    expect(parseJwtClaims("")).toEqual({});
  });

  it("should return empty object for invalid base64", () => {
    expect(parseJwtClaims("header.!!!invalid!!!.signature")).toEqual({});
  });
});

describe("extractUserIdFromToken", () => {
  it("should extract user ID from 'sub' claim", () => {
    const token = createJwtToken({ sub: "user-123" });
    expect(extractUserIdFromToken(token)).toBe("user-123");
  });

  it("should extract user ID from 'user_id' claim", () => {
    const token = createJwtToken({ user_id: "user-456" });
    expect(extractUserIdFromToken(token)).toBe("user-456");
  });

  it("should extract user ID from 'userId' claim", () => {
    const token = createJwtToken({ userId: "user-789" });
    expect(extractUserIdFromToken(token)).toBe("user-789");
  });

  it("should extract user ID from 'uid' claim", () => {
    const token = createJwtToken({ uid: "user-abc" });
    expect(extractUserIdFromToken(token)).toBe("user-abc");
  });

  it("should prefer 'sub' claim over others", () => {
    const token = createJwtToken({ sub: "primary", user_id: "secondary" });
    expect(extractUserIdFromToken(token)).toBe("primary");
  });

  it("should return undefined for missing claims", () => {
    const token = createJwtToken({ name: "Test", email: "test@example.com" });
    expect(extractUserIdFromToken(token)).toBeUndefined();
  });

  it("should return undefined for invalid token", () => {
    expect(extractUserIdFromToken("invalid-token")).toBeUndefined();
  });
});

describe("createMCPContext", () => {
  it("should extract session ID from headers", () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "session-abc123" };
    const ctx = createMCPContext(headers);
    expect(ctx.sessionId).toBe("session-abc123");
  });

  it("should extract session ID case-insensitively", () => {
    const headers = { "mcp-session-id": "session-xyz" };
    const ctx = createMCPContext(headers);
    expect(ctx.sessionId).toBe("session-xyz");
  });

  it("should extract user ID from Authorization header", () => {
    const token = createJwtToken({ sub: "user-123" });
    const headers = { [AUTHORIZATION_HEADER]: `Bearer ${token}` };
    const ctx = createMCPContext(headers);
    expect(ctx.userId).toBe("user-123");
  });

  it("should extract both session ID and user ID", () => {
    const token = createJwtToken({ sub: "user-456" });
    const headers = {
      [MCP_SESSION_ID_HEADER]: "session-789",
      [AUTHORIZATION_HEADER]: `Bearer ${token}`,
    };
    const ctx = createMCPContext(headers);
    expect(ctx.sessionId).toBe("session-789");
    expect(ctx.userId).toBe("user-456");
  });

  it("should store raw headers", () => {
    const headers = { "X-Custom-Header": "custom-value", [MCP_SESSION_ID_HEADER]: "sess" };
    const ctx = createMCPContext(headers);
    expect(ctx.headers).toEqual(headers);
  });

  it("should store token claims", () => {
    const token = createJwtToken({ sub: "user", role: "admin" });
    const headers = { [AUTHORIZATION_HEADER]: `Bearer ${token}` };
    const ctx = createMCPContext(headers);
    expect(ctx.tokenClaims.sub).toBe("user");
    expect(ctx.tokenClaims.role).toBe("admin");
  });

  it("should handle empty headers", () => {
    const ctx = createMCPContext({});
    expect(ctx.sessionId).toBeUndefined();
    expect(ctx.userId).toBeUndefined();
  });
});

describe("getMCPContext", () => {
  it("should return undefined when no context is set", () => {
    expect(getMCPContext()).toBeUndefined();
  });
});

describe("runWithMCPContext", () => {
  it("should make context available within callback", () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "session-run" };

    const result = runWithMCPContext(headers, () => {
      const ctx = getMCPContext();
      expect(ctx).toBeDefined();
      expect(ctx?.sessionId).toBe("session-run");
      return "success";
    });

    expect(result).toBe("success");
  });

  it("should clear context after callback completes", () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "session-temp" };

    runWithMCPContext(headers, () => {
      expect(getMCPContext()?.sessionId).toBe("session-temp");
    });

    // Context should be cleared after
    expect(getMCPContext()).toBeUndefined();
  });

  it("should handle nested contexts", () => {
    const outerHeaders = { [MCP_SESSION_ID_HEADER]: "outer-session" };
    const innerHeaders = { [MCP_SESSION_ID_HEADER]: "inner-session" };

    runWithMCPContext(outerHeaders, () => {
      expect(getMCPContext()?.sessionId).toBe("outer-session");

      runWithMCPContext(innerHeaders, () => {
        expect(getMCPContext()?.sessionId).toBe("inner-session");
      });

      // Should restore outer context
      expect(getMCPContext()?.sessionId).toBe("outer-session");
    });
  });

  it("should extract user from JWT in headers", () => {
    const token = createJwtToken({ sub: "jwt-user" });
    const headers = {
      [MCP_SESSION_ID_HEADER]: "jwt-session",
      [AUTHORIZATION_HEADER]: `Bearer ${token}`,
    };

    runWithMCPContext(headers, () => {
      const ctx = getMCPContext();
      expect(ctx?.sessionId).toBe("jwt-session");
      expect(ctx?.userId).toBe("jwt-user");
    });
  });

  it("should propagate errors from callback", () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "error-session" };

    expect(() => {
      runWithMCPContext(headers, () => {
        throw new Error("test error");
      });
    }).toThrow("test error");
  });
});

describe("runWithMCPContextAsync", () => {
  it("should make context available within async callback", async () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "async-session" };

    const result = await runWithMCPContextAsync(headers, async () => {
      const ctx = getMCPContext();
      expect(ctx).toBeDefined();
      expect(ctx?.sessionId).toBe("async-session");
      return "async-success";
    });

    expect(result).toBe("async-success");
  });

  it("should maintain context across await points", async () => {
    const token = createJwtToken({ sub: "async-user" });
    const headers = {
      [MCP_SESSION_ID_HEADER]: "await-session",
      [AUTHORIZATION_HEADER]: `Bearer ${token}`,
    };

    await runWithMCPContextAsync(headers, async () => {
      expect(getMCPContext()?.sessionId).toBe("await-session");

      // Simulate async operation
      await new Promise(resolve => setTimeout(resolve, 10));

      // Context should still be available
      expect(getMCPContext()?.sessionId).toBe("await-session");
      expect(getMCPContext()?.userId).toBe("async-user");
    });
  });

  it("should propagate async errors", async () => {
    const headers = { [MCP_SESSION_ID_HEADER]: "error-async" };

    await expect(
      runWithMCPContextAsync(headers, async () => {
        throw new Error("async error");
      })
    ).rejects.toThrow("async error");
  });

  it("should handle nested async contexts", async () => {
    const outerHeaders = { [MCP_SESSION_ID_HEADER]: "outer-async" };
    const innerHeaders = { [MCP_SESSION_ID_HEADER]: "inner-async" };

    await runWithMCPContextAsync(outerHeaders, async () => {
      expect(getMCPContext()?.sessionId).toBe("outer-async");

      await runWithMCPContextAsync(innerHeaders, async () => {
        expect(getMCPContext()?.sessionId).toBe("inner-async");
      });

      expect(getMCPContext()?.sessionId).toBe("outer-async");
    });
  });
});

