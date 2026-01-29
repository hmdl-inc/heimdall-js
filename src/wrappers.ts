/**
 * Wrapper functions for instrumenting MCP functions with Heimdall observability
 */

import { SpanKind as OtelSpanKind, SpanStatusCode, Span } from "@opentelemetry/api";
import { HeimdallClient } from "./client";
import { HeimdallAttributes, SpanKind, SpanStatus } from "./types";

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
type UserExtractor = (args: unknown[]) => string | undefined;

interface WrapperOptions {
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
   * Function to extract user ID from the function arguments.
   * Useful for extracting user/session info from MCP Context.
   *
   * @example
   * ```typescript
   * // Extract user from MCP Context
   * userExtractor: (args) => {
   *   const ctx = args[0] as any;
   *   return ctx?.session?.clientInfo?.name ?? ctx?.sessionId;
   * }
   * ```
   */
  userExtractor?: UserExtractor;
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

    const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const client = HeimdallClient.getInstance();
      if (!client) {
        return fn.apply(this, args);
      }

      const tracer = client.getTracer();
      const span = tracer.startSpan(spanName, {
        kind: OtelSpanKind.SERVER,
      });

      const startTime = performance.now();

      try {
        // Set input attributes
        span.setAttribute(nameAttr, spanName);
        span.setAttribute("heimdall.span_kind", spanKind);

        // Extract user ID - try userExtractor first, fallback to "anonymous"
        let userId = "anonymous";
        if (userExtractor) {
          try {
            const extractedUserId = userExtractor(args);
            if (extractedUserId) {
              userId = extractedUserId;
            }
          } catch {
            // Ignore extraction errors, use "anonymous"
          }
        }
        span.setAttribute(HeimdallAttributes.HEIMDALL_USER_ID, userId);

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

