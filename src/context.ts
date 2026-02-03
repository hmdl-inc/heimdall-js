/**
 * MCP request context management for automatic session and user tracking.
 *
 * This module provides utilities for capturing and propagating MCP HTTP request context
 * (headers, tokens) to be automatically used by wrappers for session and user tracking.
 */

import { AsyncLocalStorage } from "async_hooks";

// MCP Header names
export const MCP_SESSION_ID_HEADER = "Mcp-Session-Id";
export const AUTHORIZATION_HEADER = "Authorization";

/**
 * Context object containing MCP request information.
 *
 * This captures HTTP headers from an MCP request, allowing automatic
 * extraction of session ID and user ID from headers and tokens.
 */
export interface MCPRequestContext {
  /** The MCP session ID from the Mcp-Session-Id header */
  sessionId?: string;
  /** The user ID extracted from the OAuth/JWT token */
  userId?: string;
  /** Raw headers dictionary for additional access */
  headers: Record<string, string>;
  /** Decoded JWT claims (if Authorization header contained a JWT) */
  tokenClaims: Record<string, unknown>;
}

// AsyncLocalStorage for context propagation
const mcpContextStorage = new AsyncLocalStorage<MCPRequestContext | undefined>();

/**
 * Parse claims from a JWT token without verification.
 *
 * This extracts the payload claims from a JWT token. Note that this does NOT
 * verify the token signature - that should be done by your authentication layer.
 *
 * @param token - The JWT token string (with or without 'Bearer ' prefix)
 * @returns Object of claims from the JWT payload, or empty object if parsing fails
 *
 * @example
 * ```typescript
 * const claims = parseJwtClaims("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.xxx");
 * console.log(claims.sub); // 'user-123'
 * ```
 */
export function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    // Remove 'Bearer ' prefix if present
    let cleanToken = token;
    if (cleanToken.toLowerCase().startsWith("bearer ")) {
      cleanToken = cleanToken.slice(7);
    }

    // JWT format: header.payload.signature
    const parts = cleanToken.split(".");
    if (parts.length !== 3) {
      return {};
    }

    // Decode the payload (middle part) using base64url
    const payload = parts[1];
    if (!payload) {
      return {};
    }

    // Handle base64url encoding (replace - with + and _ with /)
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");

    // Add padding if needed
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);

    // Decode
    const decoded = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

/**
 * Extract user ID from a JWT token.
 *
 * Looks for the 'sub' (subject) claim which is the standard JWT claim for user ID.
 * Also checks for common alternative claims like 'user_id', 'userId', 'uid'.
 *
 * @param token - The JWT token string (with or without 'Bearer ' prefix)
 * @returns The user ID string if found, undefined otherwise
 */
export function extractUserIdFromToken(token: string): string | undefined {
  const claims = parseJwtClaims(token);

  // Try standard 'sub' claim first, then common alternatives
  for (const claimName of ["sub", "user_id", "userId", "uid", "user"]) {
    const value = claims[claimName];
    if (typeof value === "string" && value) {
      return value;
    }
  }

  return undefined;
}

/**
 * Create an MCPRequestContext from HTTP headers.
 *
 * This extracts the MCP session ID from the Mcp-Session-Id header and
 * the user ID from the Authorization header (if it contains a JWT).
 *
 * @param headers - Record of HTTP headers (case-insensitive keys supported)
 * @returns MCPRequestContext with sessionId and userId populated
 *
 * @example
 * ```typescript
 * const headers = {
 *   "Mcp-Session-Id": "session-abc123",
 *   "Authorization": "Bearer eyJhbGciOi..."
 * };
 * const ctx = createMCPContext(headers);
 * console.log(ctx.sessionId); // 'session-abc123'
 * ```
 */
export function createMCPContext(
  headers: Record<string, string>
): MCPRequestContext {
  // Normalize header keys to handle case-insensitivity
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  // Extract session ID
  const sessionId =
    normalizedHeaders[MCP_SESSION_ID_HEADER.toLowerCase()] ||
    normalizedHeaders["mcp-session-id"] ||
    headers[MCP_SESSION_ID_HEADER];

  // Extract user ID from Authorization header
  let userId: string | undefined;
  let tokenClaims: Record<string, unknown> = {};

  const authHeader =
    normalizedHeaders[AUTHORIZATION_HEADER.toLowerCase()] ||
    normalizedHeaders["authorization"] ||
    headers[AUTHORIZATION_HEADER];

  if (authHeader) {
    tokenClaims = parseJwtClaims(authHeader);
    userId = extractUserIdFromToken(authHeader);
  }

  return {
    sessionId,
    userId,
    headers,
    tokenClaims,
  };
}

/**
 * Set the current MCP request context.
 *
 * Note: This only works within a `runWithMCPContext` callback.
 * For most use cases, use `runWithMCPContext` instead.
 *
 * @param ctx - The MCPRequestContext to set, or undefined to clear
 */
export function setMCPContext(_ctx: MCPRequestContext | undefined): void {
  // This is a no-op when called outside of runWithMCPContext
  // The context is managed by AsyncLocalStorage
  const store = mcpContextStorage.getStore();
  if (store !== undefined) {
    // We can't actually mutate the store, but we log a warning
    console.warn(
      "[Heimdall] setMCPContext called but context is managed by runWithMCPContext"
    );
  }
}

/**
 * Get the current MCP request context.
 *
 * @returns The current MCPRequestContext if set, undefined otherwise
 */
export function getMCPContext(): MCPRequestContext | undefined {
  return mcpContextStorage.getStore();
}

/**
 * Run a function with MCP request context.
 *
 * This sets up the context so that all decorated/wrapped functions
 * within the callback will have access to the session and user IDs.
 *
 * @param headers - HTTP headers dictionary to create context from
 * @param fn - The function to run with the context
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * app.post('/mcp', async (req, res) => {
 *   const result = await runWithMCPContext(req.headers, async () => {
 *     return myMCPTool(req.body);
 *   });
 *   res.json(result);
 * });
 * ```
 */
export function runWithMCPContext<T>(
  headers: Record<string, string>,
  fn: () => T
): T {
  const ctx = createMCPContext(headers);
  return mcpContextStorage.run(ctx, fn);
}

/**
 * Run an async function with MCP request context.
 *
 * This is the async version of runWithMCPContext.
 *
 * @param headers - HTTP headers dictionary to create context from
 * @param fn - The async function to run with the context
 * @returns Promise resolving to the result of the function
 *
 * @example
 * ```typescript
 * app.post('/mcp', async (req, res) => {
 *   const result = await runWithMCPContextAsync(req.headers, async () => {
 *     return await myAsyncMCPTool(req.body);
 *   });
 *   res.json(result);
 * });
 * ```
 */
export async function runWithMCPContextAsync<T>(
  headers: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const ctx = createMCPContext(headers);
  return mcpContextStorage.run(ctx, fn);
}

/**
 * Middleware factory for Express-like frameworks.
 *
 * Creates a middleware function that automatically sets up MCP context
 * for all requests.
 *
 * @returns Middleware function for Express-like frameworks
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { mcpContextMiddleware } from 'hmdl';
 *
 * const app = express();
 * app.use(mcpContextMiddleware());
 *
 * app.post('/mcp/tool', async (req, res) => {
 *   // MCP context is automatically available here
 *   const result = await myMCPTool(req.body);
 *   res.json(result);
 * });
 * ```
 */
export function mcpContextMiddleware() {
  return (
    req: { headers: Record<string, string> },
    _res: unknown,
    next: () => void
  ) => {
    const ctx = createMCPContext(req.headers as Record<string, string>);
    mcpContextStorage.run(ctx, next);
  };
}

