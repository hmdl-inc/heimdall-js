/**
 * Heimdall client for OpenTelemetry-based observability
 */

import { trace, Tracer, Span, SpanKind as OtelSpanKind, context } from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { HeimdallConfig, ResolvedHeimdallConfig, resolveConfig } from "./config";
import { HeimdallAttributes } from "./types";

/**
 * Client for sending observability data to Heimdall platform.
 *
 * This client sets up OpenTelemetry tracing and provides methods for
 * creating spans and recording MCP operations.
 *
 * @example
 * ```typescript
 * import { HeimdallClient } from 'hmdl';
 *
 * const client = new HeimdallClient({ apiKey: 'your-api-key' });
 *
 * await client.startSpan('my-operation', async (span) => {
 *   span.setAttribute('custom.attribute', 'value');
 *   // Your code here
 * });
 * ```
 */
export class HeimdallClient {
  private static instance: HeimdallClient | null = null;
  private config!: ResolvedHeimdallConfig;
  private provider: NodeTracerProvider | null = null;
  private tracer: Tracer | null = null;

  constructor(config: HeimdallConfig = {}) {
    // Singleton pattern
    if (HeimdallClient.instance) {
      return HeimdallClient.instance;
    }

    this.config = resolveConfig(config);

    if (this.config.enabled) {
      this.setupTracing();
    }

    HeimdallClient.instance = this;
  }

  private setupTracing(): void {
    if (this.config.debug) {
      console.debug("[Heimdall] Setting up tracing...");
    }

    // Create resource with service information
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: this.config.serviceName,
      [HeimdallAttributes.HEIMDALL_ENVIRONMENT]: this.config.environment,
      [HeimdallAttributes.HEIMDALL_ORG_ID]: this.config.orgId,
      [HeimdallAttributes.HEIMDALL_PROJECT_ID]: this.config.projectId,
    });

    // Create tracer provider
    this.provider = new NodeTracerProvider({ resource });

    // Set up OTLP HTTP exporter
    const otlpEndpoint = `${this.config.endpoint}/v1/traces`;

    // Only add auth header if API key is provided
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const exporter = new OTLPTraceExporter({
      url: otlpEndpoint,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    });

    // Add batch processor for efficient span export
    const processor = new BatchSpanProcessor(exporter, {
      maxQueueSize: this.config.maxQueueSize,
      maxExportBatchSize: this.config.batchSize,
      scheduledDelayMillis: this.config.flushIntervalMs,
    });

    this.provider.addSpanProcessor(processor);

    // Register as global tracer provider
    this.provider.register();

    // Get tracer
    this.tracer = trace.getTracer("hmdl", "0.1.0");

    if (this.config.debug) {
      console.debug(`[Heimdall] Tracing initialized for service: ${this.config.serviceName}`);
    }
  }

  /**
   * Get the OpenTelemetry tracer
   */
  getTracer(): Tracer {
    if (!this.tracer) {
      // Return a no-op tracer if not initialized
      return trace.getTracer("hmdl-noop");
    }
    return this.tracer;
  }

  /**
   * Start a new span and execute a function within it
   */
  async startSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    options: {
      kind?: OtelSpanKind;
      attributes?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<T> {
    const tracer = this.getTracer();
    const span = tracer.startSpan(name, {
      kind: options.kind ?? OtelSpanKind.INTERNAL,
      attributes: options.attributes,
    });

    try {
      const result = await context.with(trace.setSpan(context.active(), span), () => fn(span));
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Get the current active span
   */
  getCurrentSpan(): Span | undefined {
    return trace.getActiveSpan();
  }

  /**
   * Flush all pending spans
   */
  async flush(): Promise<void> {
    if (this.provider) {
      await this.provider.forceFlush();
    }
  }

  /**
   * Shutdown the client and flush remaining spans
   */
  async shutdown(): Promise<void> {
    if (this.provider) {
      await this.provider.shutdown();
      if (this.config.debug) {
        console.debug("[Heimdall] Client shutdown complete");
      }
    }
  }

  /**
   * Get the singleton client instance
   */
  static getInstance(): HeimdallClient | null {
    return HeimdallClient.instance;
  }

  /**
   * Reset the singleton instance (mainly for testing)
   */
  static async reset(): Promise<void> {
    if (HeimdallClient.instance) {
      await HeimdallClient.instance.shutdown();
      HeimdallClient.instance = null;
    }
  }
}

