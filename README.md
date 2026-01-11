# @sockeon/client

Official JavaScript/TypeScript client for the [Sockeon WebSocket framework](https://sockeon.com).

## Features

- 🚀 **Native WebSocket** - Built on standard WebSocket API (no Socket.IO)
- 📦 **Zero Dependencies** - Lightweight and efficient
- 🔄 **Auto-Reconnection** - Configurable exponential backoff
- 🎯 **Type-Safe** - Full TypeScript support
- 🏠 **Namespaces & Rooms** - Multi-tenant architecture support
- 🔐 **Token Authentication** - Query-based auth flow
- 💓 **Heartbeat** - Automatic connection monitoring
- 🌐 **Browser Compatible** - Works in all modern browsers

## Installation

```bash
npm install @sockeon/client
```

## Quick Start

```typescript
import { Sockeon } from '@sockeon/client';

const socket = new Sockeon({
  url: 'ws://localhost:6001',
  auth: {
    token: 'your-auth-token', // Optional
  },
  reconnect: true,
  debug: true,
});

// Listen to connection events
socket.on('connect', () => {
  console.log('Connected to Sockeon server');
  
  // Emit events after connected (required)
  socket.emit('chat.send', {
    message: 'Hello, Sockeon!',
    timestamp: Date.now(),
  });
});

socket.on('disconnect', (data) => {
  console.log('Disconnected:', data);
});

// Listen to custom events
socket.on('chat.message', (data) => {
  console.log('New message:', data);
});

// Connect
socket.connect();
```

## Configuration Options

```typescript
interface SockeonOptions {
  /** WebSocket server URL (ws:// or wss://) */
  url: string;

  /** Namespace to connect to (default: '/') */
  namespace?: string;

  /** Authentication configuration */
  auth?: {
    token?: string; // Sent as ?key= query parameter
  };

  /** Auto-reconnect configuration */
  reconnect?: boolean | {
    enabled: boolean;      // Enable auto-reconnect (default: true)
    maxAttempts: number;   // Max attempts, 0 = unlimited (default: 5)
    delay: number;         // Initial delay in ms (default: 1000)
    maxDelay: number;      // Max delay in ms (default: 30000)
    factor: number;        // Backoff multiplier (default: 1.5)
  };

  /** Heartbeat configuration */
  heartbeat?: boolean | {
    enabled: boolean;      // Enable heartbeat (default: true)
    interval: number;      // Ping interval in ms (default: 30000)
    timeout: number;       // Pong timeout in ms (default: 5000)
  };

  /** Additional query parameters */
  query?: Record<string, string>;

  /** WebSocket sub-protocols */
  protocols?: string | string[];

  /** Enable debug logging */
  debug?: boolean;
}
```

## API Reference

### Connection Management

#### `connect(): void`
Establish connection to the WebSocket server.

```typescript
socket.connect();
```

#### `disconnect(): void`
Close the WebSocket connection gracefully.

```typescript
socket.disconnect();
```

#### `isConnected(): boolean`
Check if currently connected.

```typescript
if (socket.isConnected()) {
  console.log('Socket is connected');
}
```

#### `getState(): ConnectionState`
Get current connection state: `'disconnected'` | `'connecting'` | `'connected'` | `'reconnecting'` | `'closing'`

```typescript
const state = socket.getState();
```

#### `getConnectionInfo(): ConnectionInfo`
Get detailed connection information.

```typescript
const info = socket.getConnectionInfo();
console.log(info.state, info.connectedAt, info.reconnectAttempts);
```

### Event Handling

#### `on(event: string, handler: Function): void`
Register an event listener.

```typescript
socket.on('user.joined', (data) => {
  console.log('User joined:', data.username);
});
```

#### `once(event: string, handler: Function): void`
Register a one-time event listener.

```typescript
socket.once('welcome', (data) => {
  console.log('Welcome message:', data);
});
```

#### `off(event: string, handler?: Function): void`
Remove event listener(s).

```typescript
// Remove specific handler
socket.off('user.joined', myHandler);

// Remove all handlers for event
socket.off('user.joined');
```

#### `emit(event: string, data: object | array): void`
Send event to server. Event names must match `/^[a-zA-Z0-9._-]+$/`. **Must be called after connection is established.**

```typescript
socket.on('connect', () => {
  socket.emit('chat.message', {
    room: 'general',
    text: 'Hello!',
  });
});
```

### Rooms

#### `joinRoom(room: string): void`
Join a room in the current namespace.

```typescript
socket.joinRoom('room-123');
```

#### `leaveRoom(room: string): void`
Leave a room.

```typescript
socket.leaveRoom('room-123');
```

#### `getRooms(): string[]`
Get list of currently joined rooms.

```typescript
const rooms = socket.getRooms();
console.log('In rooms:', rooms);
```

## System Events

The client emits lifecycle events you can listen to:

- **`connect`** - Successfully connected to server
- **`disconnect`** - Disconnected from server
- **`error`** - Error occurred (also server-sent errors)
- **`reconnect_attempt`** - Reconnection attempt started
- **`reconnect_failed`** - Max reconnection attempts reached

```typescript
socket.on('connect', () => {
  console.log('Connected!');
});

socket.on('reconnect_attempt', ({ attempt, delay }) => {
  console.log(`Reconnecting... (attempt ${attempt}, delay ${delay}ms)`);
});

socket.on('error', (error) => {
  console.error('Error:', error.message);
});
```

## Protocol Details

### Message Format

All messages follow Sockeon's protocol:

```json
{
  "event": "event.name",
  "data": { "key": "value" }
}
```

**Requirements:**
- `event`: Non-empty string matching `/^[a-zA-Z0-9._-]+$/`
- `data`: Object or array (required field)

### Authentication

Authentication uses query parameters:

```typescript
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  auth: {
    token: 'your-secret-token', // Sent as ?key=your-secret-token
  },
});
```

The server validates the `key` parameter during WebSocket handshake.

### Namespaces

Sockeon supports namespaces for multi-tenant applications:

```typescript
// Connect to specific namespace
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  namespace: '/admin',
});
```

Default namespace is `'/'`.

### Rooms

Rooms allow targeted broadcasting within namespaces:

```typescript
socket.on('connect', () => {
  // Join room
  socket.joinRoom('game-room-42');
  
  // Emit to room (server-side handling)
  socket.emit('game.move', {
    room: 'game-room-42',
    move: 'e4',
  });
});
```

## Error Handling

```typescript
// Handle connection errors
socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Handle emit errors
try {
  socket.emit('invalid event name!', { data: 'test' });
} catch (error) {
  console.error('Failed to emit:', error.message);
  // Error: Invalid event name: only alphanumeric characters, dots, underscores, and hyphens are allowed
}

// Emitting before connected throws error
try {
  socket.emit('some.event', { data: 'test' });
} catch (error) {
  console.error(error.message);
  // Error: Cannot emit: WebSocket is not connected
}
```

## Advanced Usage

### Custom Reconnection Strategy

```typescript
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  reconnect: {
    enabled: true,
    maxAttempts: 10,     // Try 10 times
    delay: 2000,         // Start with 2 seconds
    maxDelay: 60000,     // Max 1 minute
    factor: 2,           // Double delay each time
  },
});
```

### Disable Heartbeat

```typescript
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  heartbeat: false, // Disable automatic ping
});
```

### Additional Query Parameters

```typescript
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  query: {
    clientType: 'web',
    version: '1.0.0',
  },
});
// URL becomes: ws://localhost:6001?clientType=web&version=1.0.0
```

### Debug Mode

```typescript
const socket = new Sockeon({
  url: 'ws://localhost:6001',
  debug: true, // Logs all events to console
});
```

## Server Compatibility

This client is designed specifically for **Sockeon WebSocket framework**. It follows Sockeon's protocol exactly:

- ✅ Message format: `{ event: string, data: object }`
- ✅ Event validation: `/^[a-zA-Z0-9._-]+$/`
- ✅ Query-based authentication
- ✅ Namespace and room support
- ✅ Standard WebSocket frames (text/ping/pong)

**Not compatible with:**
- ❌ Socket.IO servers
- ❌ Other WebSocket frameworks with different protocols

## Browser Support

- Chrome/Edge 88+
- Firefox 85+
- Safari 14+
- Any browser with native WebSocket support

## TypeScript

Full TypeScript support included. All types are exported:

```typescript
import { 
  Sockeon, 
  SockeonOptions, 
  ConnectionState,
  SockeonMessage,
  SYSTEM_EVENTS 
} from '@sockeon/client';
```

## Contributing

Contributions are welcome! Please submit issues and pull requests on GitHub.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Links

- [Sockeon Framework](https://github.com/sockeon/sockeon)
- [Documentation](https://sockeon.com)
- [Issue Tracker](https://github.com/sockeon/sockeon/issues)
