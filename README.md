# @sockeon/client

Official JavaScript/TypeScript client for the [Sockeon](https://sockeon.github.io) WebSocket framework

Wire protocol is unchanged across v2→v3: every frame is `{"event":"<name>","data":{...}}`.

## Features

- Native WebSocket
- Zero dependencies
- `connect()` / room helpers return Promises with timeouts
- Auto-reconnect with exponential backoff and room re-join
- Event listeners: `on`, `once`, `off`, `*` wildcard, cancellable subscriptions
- Rooms via `join_room` / `leave_room` → wait for `room_joined` / `room_left`
- Auth key as `?key=`
- Text **and** binary frames (same JSON payload)
- TypeScript types included

## Installation

```bash
npm install @sockeon/client
```

## Quick start

```typescript
import { Sockeon } from '@sockeon/client';

const socket = new Sockeon({
  url: 'ws://localhost:6001',
  auth: { token: 'your-auth-token' }, // optional; sent as ?key=
  reconnect: true,
});

socket.on('chat.message', (data) => {
  console.log('New message:', data);
});

await socket.connect();
await socket.joinRoom('general');
socket.emit('chat.send', { message: 'Hello, Sockeon!' });
```

## Configuration

```typescript
interface SockeonOptions {
  url: string;

  /** Default namespace for room ops (default: '/'). Not a connect path. */
  namespace?: string;

  auth?: { token?: string };

  reconnect?: boolean | {
    enabled: boolean;      // default true
    maxAttempts: number;   // default 5; 0 = unlimited
    delay: number;         // default 1000
    maxDelay: number;      // default 30000
    factor: number;        // default 1.5
    rejoinRooms: boolean;  // default true
  };

  /** Handshake timeout ms (default 10000) */
  connectTimeout?: number;

  /** Room ack timeout ms (default 10000) */
  ackTimeout?: number;

  query?: Record<string, string>;
  protocols?: string | string[];
  debug?: boolean;
}
```

Keep-alive uses native WebSocket ping/pong (browser/runtime handles it).

## API

### Connection

```typescript
await socket.connect();           // Promise; rejects on connectTimeout
socket.disconnect();              // stops auto-reconnect
socket.isConnected();
socket.getState();                // disconnected | connecting | connected | reconnecting | closing
socket.getConnectionInfo();
```

### Events

```typescript
const sub = socket.on('user.joined', (data) => { /* ... */ });
sub.cancel();

socket.once('welcome', (data) => { /* ... */ });
socket.off('user.joined');        // all handlers
socket.on('*', (data) => { /* every event's data */ });

socket.emit('chat.message', { room: 'general', text: 'Hello!' });
// event names: /^[a-zA-Z0-9._-]+$/
```

### Rooms

```typescript
await socket.joinRoom('room-123');
await socket.joinRoom('chat', { namespace: '/app' });
await socket.leaveRoom('room-123');
socket.getRooms();                // room name strings
socket.getJoinedRooms();          // { name, namespace, joinedAt }[]
```

`joinRoom` / `leaveRoom` resolve on `room_joined` / `room_left` (matching room), or reject after `ackTimeout`.

## System events

**Client lifecycle**

- `connect` — `{ namespace, timestamp }`
- `disconnect` — `{ code, reason }`
- `reconnect_attempt` — `{ attempt, delay }`
- `reconnect_failed` — `{ attempts, maxAttempts }`
- `error` — transport / protocol errors (and server `error` payloads)

**Server**

| Event | `data` |
| --- | --- |
| `error` | `{ message, timestamp }` |
| `room_joined` | `{ room, namespace, timestamp }` |
| `room_left` | `{ room, namespace, timestamp }` |
| `rate_limit_exceeded` | `{ error, message, original_event, retry_after, limit, window, type }` |

## Protocol

```json
{ "event": "event.name", "data": { "key": "value" } }
```

- `event`: non-empty, `/^[a-zA-Z0-9._-]+$/`
- `data`: object or array
- Auth: `?key=` on handshake
- Namespace option is only the default for room messages; connection always hits the URL path you pass

## Server compatibility

Built for **Sockeon** server 2.x and 3.x (same wire protocol). Not Socket.IO.

## Browser support

Chrome/Edge 88+, Firefox 85+, Safari 14+, or any runtime with `WebSocket` (Node ≥ 18).

## License

MIT — see [LICENSE](LICENSE).

## Links

- [Sockeon docs](https://sockeon.github.io)
- [Framework](https://github.com/sockeon/sockeon)
- [Issues](https://github.com/sockeon/js-client/issues)
