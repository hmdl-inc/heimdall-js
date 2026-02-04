/**
 * Wrapper functions for instrumenting MCP functions with Heimdall observability
 */

import { SpanKind as OtelSpanKind, SpanStatusCode, Span } from "@opentelemetry/api";
import { HeimdallClient } from "./client";
import { HeimdallAttributes, SpanKind, SpanStatus } from "./types";

/** MCP Session ID header name */
const MCP_SESSION_ID_HEADER = "Mcp-Session-Id";
/** Authorization header name */
const AUTHORIZATION_HEADER = "Authorization";

/**
 * Parse JWT claims from a token string (without verification)
 */
function parseJwtClaims(token: string): Record<string, unknown> {
  try {
    let tokenStr = token;
    if (tokenStr.toLowerCase().startsWith("bearer ")) {
      tokenStr = tokenStr.slice(7);
    }
    const parts = tokenStr.split(".");
    if (parts.length !== 3) {
      return {};
    }
    const payload = parts[1];
    if (!payload) {
      return {};
    }
    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return {};
  }
}

/**
 * Extract user ID from a JWT token
 */
function extractUserIdFromToken(token: string): string | undefined {
  const claims = parseJwtClaims(token);
  // Check common user ID claims in order of preference
  for (const claim of ["sub", "user_id", "userId", "uid"]) {
    if (typeof claims[claim] === "string") {
      return claims[claim] as string;
    }
  }
  return undefined;
}

/**
 * Extract session ID and user ID from HTTP headers
 */
function extractFromHeaders(headers: Record<string, string | undefined>): {
  sessionId?: string;
  userId?: string;
} {
  // Look for relevant headers with a single pass and case-insensitive comparison
  const sessionHeaderKey = MCP_SESSION_ID_HEADER.toLowerCase();
  const authHeaderKey = AUTHORIZATION_HEADER.toLowerCase();

  let sessionId: string | undefined;
  let authHeader: string | undefined;

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey === sessionHeaderKey) {
      sessionId = value;
    } else if (lowerKey === authHeaderKey) {
      authHeader = value;
    }
    // Early exit if both found
    if (sessionId !== undefined && authHeader !== undefined) {
      break;
    }
  }
  const userId = authHeader ? extractUserIdFromToken(authHeader) : undefined;

  return { sessionId, userId };
}

type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Safely serialize a value to string for span attributes
 */
function serializeValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Record an error on a span
 */
function recordError(span: Span, error: unknown): void {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  span.setAttribute(HeimdallAttributes.STATUS, SpanStatus.ERROR);
  span.setAttribute(HeimdallAttributes.ERROR_MESSAGE, errorObj.message);
  span.setAttribute(HeimdallAttributes.ERROR_TYPE, errorObj.name);
  span.setStatus({ code: SpanStatusCode.ERROR, message: errorObj.message });
  span.recordException(errorObj);
}

/**
 * Function to extract user ID from the function arguments.
 * This is useful for extracting user/session info from MCP Context or other sources.
 *
 * @param args - The arguments passed to the wrapped function
 * @returns The user ID string, or undefined to use the default
 *
 * @example
 * ```typescript
 * // Extract user from MCP Context (first argument)
 * const userExtractor = (args: unknown[]) => {
 *   const ctx = args[0] as any;
 *   return ctx?.session?.clientInfo?.name ?? ctx?.sessionId;
 * };
 * ```
 */
export type UserExtractor = (args: unknown[]) => string | undefined;

/**
 * Function to extract session ID from the function arguments.
 * This is useful for extracting session info from MCP Context or other sources.
 *
 * @param args - The arguments passed to the wrapped function
 * @returns The session ID string, or undefined to use the default
 *
 * @example
 * ```typescript
 * // Extract session from MCP Context (first argument)
 * const sessionExtractor = (args: unknown[]) => {
 *   const ctx = args[0] as any;
 *   return ctx?.sessionId ?? ctx?.meta?.sessionId;
 * };
 * ```
 */
export type SessionExtractor = (args: unknown[]) => string | undefined;

export interface WrapperOptions {
  /**
   * Custom name for the span (defaults to function name)
   */
  name?: string;
  /**
   * Parameter names for the function arguments (for better input display)
   * @example ["query", "limit", "offset"]
   */
  paramNames?: string[];
  /**
   * Whether to capture input arguments
   * @default true
   */
  captureInput?: boolean;
  /**
   * Whether to capture output/return value
   * @default true
   */
  captureOutput?: boolean;
  /**
   * HTTP headers from the MCP request.
   * Used to automatically extract session ID from `Mcp-Session-Id` header
   * and user ID from JWT token in `Authorization` header.
   *
   * @example
   * ```typescript
   * traceMCPTool(myFn, { headers: req.headers })
   * ```
   */
  headers?: Record<string, string | undefined>;
  /**
   * Function to extract user ID from the function arguments.
   * Takes precedence over headers and client.setUserId().
   *
   * @example
   * ```typescript
   * userExtractor: (args) => args[0]?.userId
   * ```
   */
  userExtractor?: UserExtractor;
  /**
   * Function to extract session ID from the function arguments.
   * Takes precedence over headers and client.setSessionId().
   *
   * @example
   * ```typescript
   * sessionExtractor: (args) => args[0]?.sessionId
   * ```
   */
  sessionExtractor?: SessionExtractor;
}

/**
 * Convert args array to named object using paramNames
 */
function argsToNamedObject(
  args: unknown[],
  paramNames?: string[]
): Record<string, unknown> | unknown[] {
  if (!paramNames || paramNames.length === 0) {
    return args;
  }
  const result: Record<string, unknown> = {};
  for (let i = 0; i < args.length; i++) {
    const name = paramNames[i] ?? `arg${i}`;
    result[name] = args[i];
  }
  return result;
}

/**
 * Create a wrapper for MCP-specific functions
 */
function createMCPWrapper(
  spanKind: SpanKind,
  nameAttr: string,
  argsAttr: string,
  resultAttr: string
) {
  return function wrapper<T extends AnyFunction>(
    fn: T,
    options: WrapperOptions = {}
  ): T {
    const spanName = options.name ?? fn.name ?? "anonymous";
    const paramNames = options.paramNames;
    const captureInput = options.captureInput ?? true;
    const captureOutput = options.captureOutput ?? true;
    const userExtractor = options.userExtractor;
    const sessionExtractor = options.sessionExtractor;
    const headers = options.headers;

    const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const client = HeimdallClient.getInstance();
      if (!client) {
        return fn.apply(this, args);
      }

      // Extract from headers at call time (not wrapper creation time)
      const headerData = headers ? extractFromHeaders(headers) : undefined;

      const tracer = client.getTracer();
      const span = tracer.startSpan(spanName, {
        kind: OtelSpanKind.SERVER,
      });

      const startTime = performance.now();

      try {
        // Set input attributes
        span.setAttribute(nameAttr, spanName);
        span.setAttribute("heimdall.span_kind", spanKind);

        // Extract session ID - priority: extractor > headers > client
        let sessionId: string | undefined;
        if (sessionExtractor) {
          try {
            sessionId = sessionExtractor(args);
          } catch {
            // Ignore extraction errors
          }
        }
        // Fallback to headers
        if (!sessionId && headerData?.sessionId) {
          sessionId = headerData.sessionId;
        }
        // Fallback to client's session ID
        if (!sessionId) {
          sessionId = client.getSessionId();
        }
        if (sessionId) {
          span.setAttribute(HeimdallAttributes.HEIMDALL_SESSION_ID, sessionId);
        }

        // Extract user ID - priority: extractor > headers > client > "anonymous"
        let userId: string | undefined;
        if (userExtractor) {
          try {
            userId = userExtractor(args);
          } catch {
            // Ignore extraction errors
          }
        }
        // Fallback to headers
        if (!userId && headerData?.userId) {
          userId = headerData.userId;
        }
        // Fallback to client's user ID
        if (!userId) {
          userId = client.getUserId();
        }
        // Set user ID (default to "anonymous" if still not set)
        span.setAttribute(HeimdallAttributes.HEIMDALL_USER_ID, userId ?? "anonymous");

        if (captureInput) {
          const namedArgs = argsToNamedObject(args, paramNames);
          span.setAttribute(argsAttr, serializeValue(namedArgs));
        }

        // Execute the function
        const result = await fn.apply(this, args);

        // Set output attributes
        if (captureOutput) {
          span.setAttribute(resultAttr, serializeValue(result));
        }
        span.setAttribute(HeimdallAttributes.STATUS, SpanStatus.OK);
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        recordError(span, error);
        throw error;
      } finally {
        const durationMs = performance.now() - startTime;
        span.setAttribute(HeimdallAttributes.DURATION_MS, durationMs);
        span.end();
      }
    };

    // Preserve function name and properties
    Object.defineProperty(wrapped, "name", { value: fn.name });
    return wrapped as T;
  };
}

/**
 * Wrap an MCP tool function with observability tracking
 *
 * @example
 * ```typescript
 * const searchDocuments = traceMCPTool(
 *   async (query: string, limit: number) => {
 *     // Your implementation
 *     return results;
 *   },
 *   { name: 'search-documents' }
 * );
 * ```
 */
export const traceMCPTool = createMCPWrapper(
  SpanKind.MCP_TOOL,
  HeimdallAttributes.MCP_TOOL_NAME,
  HeimdallAttributes.MCP_TOOL_ARGUMENTS,
  HeimdallAttributes.MCP_TOOL_RESULT
);

/**
 * Wrap an MCP resource function with observability tracking
 *
 * @example
 * ```typescript
 * const readFile = traceMCPResource(
 *   async (uri: string) => {
 *     return fs.readFile(uri, 'utf-8');
 *   },
 *   { name: 'read-file' }
 * );
 * ```
 */
export const traceMCPResource = createMCPWrapper(
  SpanKind.MCP_RESOURCE,
  HeimdallAttributes.MCP_RESOURCE_URI,
  "mcp.resource.arguments",
  "mcp.resource.result"
);

/**
 * Wrap an MCP prompt function with observability tracking
 *
 * @example
 * ```typescript
 * const generatePrompt = traceMCPPrompt(
 *   async (context: string) => {
 *     return [{ role: 'user', content: context }];
 *   },
 *   { name: 'generate-prompt' }
 * );
 * ```
 */
export const traceMCPPrompt = createMCPWrapper(
  SpanKind.MCP_PROMPT,
  HeimdallAttributes.MCP_PROMPT_NAME,
  HeimdallAttributes.MCP_PROMPT_ARGUMENTS,
  HeimdallAttributes.MCP_PROMPT_MESSAGES
);

/**
 * General-purpose wrapper to observe any function
 *
 * @example
 * ```typescript
 * const processData = observe(
 *   async (data: Record<string, unknown>) => {
 *     return { processed: true, ...data };
 *   },
 *   { name: 'process-data' }
 * );
 * ```
 */
export function observe<T extends AnyFunction>(
  fn: T,
  options: WrapperOptions = {}
): T {
  const spanName = options.name ?? fn.name ?? "anonymous";
  const paramNames = options.paramNames;
  const captureInput = options.captureInput ?? true;
  const captureOutput = options.captureOutput ?? true;

  const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
    const client = HeimdallClient.getInstance();
    if (!client) {
      return fn.apply(this, args);
    }

    const tracer = client.getTracer();
    const span = tracer.startSpan(spanName, {
      kind: OtelSpanKind.INTERNAL,
    });

    const startTime = performance.now();

    try {
      span.setAttribute("heimdall.span_kind", SpanKind.INTERNAL);

      if (captureInput) {
        const namedArgs = argsToNamedObject(args, paramNames);
        span.setAttribute("heimdall.input", serializeValue(namedArgs));
      }

      const result = await fn.apply(this, args);

      if (captureOutput) {
        span.setAttribute("heimdall.output", serializeValue(result));
      }
      span.setStatus({ code: SpanStatusCode.OK });

      return result;
    } catch (error) {
      recordError(span, error);
      throw error;
    } finally {
      const durationMs = performance.now() - startTime;
      span.setAttribute(HeimdallAttributes.DURATION_MS, durationMs);
      span.end();
    }
  };

  Object.defineProperty(wrapped, "name", { value: fn.name });
  return wrapped as T;
}

/**
 * TypeScript decorator for observing class methods
 *
 * @example
 * ```typescript
 * class MyService {
 *   @Observe()
 *   async processRequest(data: unknown) {
 *     // Your implementation
 *   }
 *
 *   @Observe({ name: 'custom-name' })
 *   async anotherMethod() {
 *     // Your implementation
 *   }
 * }
 * ```
 */
export function Observe(options: WrapperOptions = {}) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AnyFunction;
    const spanName = options.name ?? propertyKey;
    const paramNames = options.paramNames;

    descriptor.value = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const client = HeimdallClient.getInstance();
      if (!client) {
        return originalMethod.apply(this, args);
      }

      const tracer = client.getTracer();
      const span = tracer.startSpan(spanName, {
        kind: OtelSpanKind.INTERNAL,
      });

      const startTime = performance.now();

      try {
        span.setAttribute("heimdall.span_kind", SpanKind.INTERNAL);

        if (options.captureInput !== false) {
          const namedArgs = argsToNamedObject(args, paramNames);
          span.setAttribute("heimdall.input", serializeValue(namedArgs));
        }

        const result = await originalMethod.apply(this, args);

        if (options.captureOutput !== false) {
          span.setAttribute("heimdall.output", serializeValue(result));
        }
        span.setStatus({ code: SpanStatusCode.OK });

        return result;
      } catch (error) {
        recordError(span, error);
        throw error;
      } finally {
        const durationMs = performance.now() - startTime;
        span.setAttribute(HeimdallAttributes.DURATION_MS, durationMs);
        span.end();
      }
    };

    return descriptor;
  };
}

/**
 * TypeScript decorator for MCP tool methods
 */
export function MCPTool(options: WrapperOptions = {}) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AnyFunction;
    descriptor.value = traceMCPTool(originalMethod, {
      name: options.name ?? propertyKey,
      ...options,
    });
    return descriptor;
  };
}

/**
 * TypeScript decorator for MCP resource methods
 */
export function MCPResource(options: WrapperOptions = {}) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AnyFunction;
    descriptor.value = traceMCPResource(originalMethod, {
      name: options.name ?? propertyKey,
      ...options,
    });
    return descriptor;
  };
}

/**
 * TypeScript decorator for MCP prompt methods
 */
export function MCPPrompt(options: WrapperOptions = {}) {
  return function (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value as AnyFunction;
    descriptor.value = traceMCPPrompt(originalMethod, {
      name: options.name ?? propertyKey,
      ...options,
    });
    return descriptor;
  };
}

