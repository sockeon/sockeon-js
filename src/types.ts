/**
 * Sockeon WebSocket Client - Type Definitions
 *
 * Wire protocol (Sockeon server 2.x / 3.x):
 * - Message format: { event: string, data: object|array }
 * - Event names: /^[a-zA-Z0-9._-]+$/
 * - Authentication: query parameter (?key=token)
 * - Rooms: join_room / leave_room → room_joined / room_left
 */

/**
 * Sockeon message format - matches server protocol exactly
 */
export interface SockeonMessage {
	/** Event name (alphanumeric + ._- only) */
	event: string;
	/** Event payload (must be object or array) */
	data: Record<string, unknown> | unknown[];
}

/**
 * Event handler function signature
 */
export type EventHandler = (data: unknown) => void;

/**
 * Cancellable listener handle returned by on/once
 */
export interface Subscription {
	cancel(): void;
}

/**
 * Connection state
 */
export type ConnectionState =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "closing";

/**
 * Reconnection configuration
 */
export interface ReconnectConfig {
	/** Enable auto-reconnect */
	enabled: boolean;
	/** Maximum reconnection attempts (0 = unlimited) */
	maxAttempts: number;
	/** Initial delay in milliseconds */
	delay: number;
	/** Maximum delay in milliseconds */
	maxDelay: number;
	/** Delay multiplier for exponential backoff */
	factor: number;
	/** Re-emit join_room for tracked rooms after reconnect */
	rejoinRooms: boolean;
}

/**
 * Browser WebSocket stacks handle ping/pong themselves.
 * This option is retained for API stability; enabling it is a no-op.
 */
export interface HeartbeatConfig {
	/** @deprecated No-op in browsers; keep-alive is native WS ping/pong */
	enabled: boolean;
	/** @deprecated */
	interval: number;
	/** @deprecated */
	timeout: number;
}

/**
 * Authentication options
 * Sockeon uses query parameters for authentication
 */
export interface AuthConfig {
	/** Authentication token (sent as ?key= query parameter) */
	token?: string;
}

/**
 * Per-call room options
 */
export interface RoomOptions {
	/** Namespace for this room op (default: client namespace option) */
	namespace?: string;
}

/**
 * Main client configuration options
 */
export interface SockeonOptions {
	/** WebSocket URL (ws:// or wss://) */
	url: string;

	/**
	 * Default namespace for room operations (default: '/').
	 * Not a connect-time path — server namespaces are joined server-side.
	 */
	namespace?: string;

	/** Authentication configuration */
	auth?: AuthConfig;

	/** Auto-reconnect configuration */
	reconnect?: boolean | Partial<ReconnectConfig>;

	/**
	 * @deprecated No-op in browsers. Keep-alive uses native WebSocket ping/pong.
	 */
	heartbeat?: boolean | Partial<HeartbeatConfig>;

	/** Handshake timeout in ms (default: 10000) */
	connectTimeout?: number;

	/** Room join/leave ack timeout in ms (default: 10000) */
	ackTimeout?: number;

	/** Additional query parameters */
	query?: Record<string, string>;

	/** WebSocket protocols */
	protocols?: string | string[];

	/** Debug logging */
	debug?: boolean;
}

/**
 * Normalized client configuration (internal use)
 */
export interface NormalizedSockeonOptions {
	url: string;
	namespace: string;
	auth?: AuthConfig;
	reconnect: ReconnectConfig;
	heartbeat: HeartbeatConfig;
	connectTimeout: number;
	ackTimeout: number;
	query: Record<string, string>;
	protocols?: string | string[];
	debug: boolean;
}

/**
 * Error event data
 */
export interface SockeonError {
	message: string;
	code?: string | number;
	timestamp?: number;
	details?: unknown;
}

/**
 * System event names
 */
export const SYSTEM_EVENTS = {
	CONNECT: "connect",
	DISCONNECT: "disconnect",
	RECONNECT: "reconnect",
	RECONNECT_ATTEMPT: "reconnect_attempt",
	RECONNECT_FAILED: "reconnect_failed",
	RECONNECT_ERROR: "reconnect_error",
	ERROR: "error",
	ROOM_JOINED: "room_joined",
	ROOM_LEFT: "room_left",
	RATE_LIMIT_EXCEEDED: "rate_limit_exceeded",
} as const;

/**
 * WebSocket close codes
 */
export const CLOSE_CODES = {
	NORMAL: 1000,
	GOING_AWAY: 1001,
	PROTOCOL_ERROR: 1002,
	UNSUPPORTED_DATA: 1003,
	INVALID_FRAME_PAYLOAD: 1007,
	POLICY_VIOLATION: 1008,
	MESSAGE_TOO_BIG: 1009,
	INTERNAL_ERROR: 1011,
} as const;

/**
 * Room tracking
 */
export interface RoomInfo {
	/** Room name */
	name: string;
	/** Namespace the room belongs to */
	namespace: string;
	/** Timestamp when join was requested / acked */
	joinedAt: number;
}

/**
 * Connection info
 */
export interface ConnectionInfo {
	/** Current connection state */
	state: ConnectionState;
	/** WebSocket URL */
	url: string;
	/** Default namespace for room ops */
	namespace: string;
	/** Connected timestamp (null if not connected) */
	connectedAt: number | null;
	/** Reconnection attempt count */
	reconnectAttempts: number;
	/** Is reconnecting */
	isReconnecting: boolean;
}
