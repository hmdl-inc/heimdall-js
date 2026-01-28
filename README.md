# hmdl - Heimdall Observability SDK for JavaScript/TypeScript

[![npm version](https://badge.fury.io/js/hmdl.svg)](https://badge.fury.io/js/hmdl)
[![Node.js 18+](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Observability SDK for MCP (Model Context Protocol) servers, built on OpenTelemetry.

## Installation

```bash
npm install hmdl
# or
yarn add hmdl
# or
pnpm add hmdl
```

## Quick Start

### 1. Set up environment variables

```bash
# Required for local development
export HEIMDALL_ENDPOINT="http://localhost:4318"  # Your Heimdall backend
export HEIMDALL_PROJECT_ID="your-project-id"      # From Heimdall Settings page
export HEIMDALL_ENABLED="true"

# Optional
export HEIMDALL_SERVICE_NAME="my-mcp-server"
export HEIMDALL_ENVIRONMENT="development"

# For production (with API key)
export HEIMDALL_API_KEY="your-api-key"
export HEIMDALL_ENDPOINT="https://api.heimdall.dev"
```

### 2. Initialize the client

```typescript
import { HeimdallClient } from 'hmdl';

// Initialize (uses environment variables by default)
const client = new HeimdallClient();

// Or with explicit configuration
const client = new HeimdallClient({
  endpoint: 'http://localhost:4318',
  projectId: 'your-project-id',
  serviceName: 'my-mcp-server',
  environment: 'development',
});
```

### 3. Instrument your MCP functions

#### Using wrapper functions

```typescript
import { traceMCPTool, traceMCPResource, traceMCPPrompt, observe } from 'hmdl';

// Wrap MCP tool functions
const searchDocuments = traceMCPTool(
  async (query: string, limit: number = 10) => {
    // Your implementation here
    return results;
  },
  { name: 'search-documents' }
);

// Wrap MCP resource functions
const readFile = traceMCPResource(
  async (uri: string) => {
    return fs.readFile(uri, 'utf-8');
  },
  { name: 'read-file' }
);

// Wrap MCP prompt functions
const generatePrompt = traceMCPPrompt(
  async (context: string) => {
    return [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: `Summarize: ${context}` },
    ];
  },
  { name: 'generate-summary-prompt' }
);

// General observation for any function
const processData = observe(
  async (data: Record<string, unknown>) => {
    return { processed: true, ...data };
  },
  { name: 'process-data' }
);
```

#### Using TypeScript decorators

```typescript
import { HeimdallClient, MCPTool, MCPResource, MCPPrompt, Observe } from 'hmdl';

// Initialize client first
new HeimdallClient();

class MyMCPServer {
  @MCPTool()
  async searchDocuments(query: string, limit: number = 10) {
    // Your implementation
    return results;
  }

  @MCPResource({ name: 'file-reader' })
  async readFile(uri: string) {
    return fs.readFile(uri, 'utf-8');
  }

  @MCPPrompt()
  async generatePrompt(context: string) {
    return [{ role: 'user', content: context }];
  }

  @Observe({ captureOutput: false })
  async internalProcess(data: unknown) {
    // Sensitive output won't be captured
    return processedData;
  }
}
```

### 4. Flush on shutdown

```typescript
// Ensure spans are flushed before exit
process.on('beforeExit', async () => {
  await client.flush();
});

// Or for graceful shutdown
process.on('SIGTERM', async () => {
  await client.shutdown();
  process.exit(0);
});
```

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `HEIMDALL_ENDPOINT` | Heimdall backend URL | `http://localhost:4318` |
| `HEIMDALL_PROJECT_ID` | Project ID (from Settings page) | `default` |
| `HEIMDALL_ENABLED` | Enable/disable tracing | `true` |
| `HEIMDALL_SERVICE_NAME` | Service name for traces | `mcp-server` |
| `HEIMDALL_ENVIRONMENT` | Deployment environment | `development` |
| `HEIMDALL_API_KEY` | API key (optional for local dev) | - |
| `HEIMDALL_DEBUG` | Enable debug logging | `false` |
| `HEIMDALL_BATCH_SIZE` | Spans per batch | `100` |
| `HEIMDALL_FLUSH_INTERVAL_MS` | Flush interval (ms) | `5000` |

### Local Development

For local development, you don't need an API key. Just set:

```bash
export HEIMDALL_ENDPOINT="http://localhost:4318"
export HEIMDALL_PROJECT_ID="your-project-id"  # Copy from Settings page
export HEIMDALL_ENABLED="true"
```

## Advanced Usage

### Manual spans

```typescript
import { HeimdallClient } from 'hmdl';

const client = new HeimdallClient();

await client.startSpan('my-operation', async (span) => {
  span.setAttribute('custom.attribute', 'value');
  // Your code here
  return result;
});
```

### Wrapper options

```typescript
const myTool = traceMCPTool(fn, {
  name: 'custom-name',      // Custom span name
  captureInput: true,       // Capture function arguments (default: true)
  captureOutput: false,     // Don't capture return value
});
```

## What gets tracked?

For each MCP function call, Heimdall tracks:

- **Input parameters**: Function arguments (serialized to JSON)
- **Output/response**: Return value (serialized to JSON)
- **Status**: Success or error
- **Latency**: Execution time in milliseconds
- **Errors**: Exception type, message, and stack trace
- **Metadata**: Service name, environment, timestamps

## OpenTelemetry Integration

This SDK is built on OpenTelemetry, making it compatible with the broader observability ecosystem.

## License

MIT License - see [LICENSE](LICENSE) for details.

