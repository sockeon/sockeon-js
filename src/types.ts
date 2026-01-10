/**
 * Sockeon WebSocket Client - Type Definitions
 *
 * Protocol specification based on Sockeon PHP framework:
 * - Message format: { event: string, data: object }
 * - Event names: /^[a-zA-Z0-9._-]+$/
 * - Authentication: query parameter (?key=token)
 * - Namespaces: supported (default: '/')
 * - Rooms: supported per namespace
 */

/**
 * Sockeon message format - matches server protocol exactly
 * Server validates: { "event": string (regex: /^[a-zA-Z0-9._-]+$/), "data": object|array }
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
}

/**
 * Ping/Pong heartbeat configuration
 */
export interface HeartbeatConfig {
	/** Enable periodic ping frames */
	enabled: boolean;
	/** Ping interval in milliseconds */
	interval: number;
	/** Pong timeout in milliseconds */
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
 * Main client configuration options
 */
export interface SockeonOptions {
	/** WebSocket URL (ws:// or wss://) */
	url: string;

	/** Namespace to connect to (default: '/') */
	namespace?: string;

	/** Authentication configuration */
	auth?: AuthConfig;

	/** Auto-reconnect configuration */
	reconnect?: boolean | Partial<ReconnectConfig>;

	/** Heartbeat/ping configuration */
	heartbeat?: boolean | Partial<HeartbeatConfig>;

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
 * - 'error': Server-sent error messages
 * - Client-side events: 'connect', 'disconnect', 'reconnect', etc.
 */
export const SYSTEM_EVENTS = {
	// Client-side lifecycle events
	CONNECT: "connect",
	DISCONNECT: "disconnect",
	RECONNECT: "reconnect",
	RECONNECT_ATTEMPT: "reconnect_attempt",
	RECONNECT_FAILED: "reconnect_failed",
	RECONNECT_ERROR: "reconnect_error",
	// Server-sent events
	ERROR: "error",
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
 * Default configuration values
 */
export const DEFAULT_OPTIONS: Omit<NormalizedSockeonOptions, "url"> = {
	namespace: "/",
	reconnect: {
		enabled: true,
		maxAttempts: 5,
		delay: 1000,
		maxDelay: 30000,
		factor: 1.5,
	},
	heartbeat: {
		enabled: true,
		interval: 30000,
		timeout: 5000,
	},
	query: {},
	debug: false,
};

/**
 * Room tracking
 */
export interface RoomInfo {
	/** Room name */
	name: string;
	/** Namespace the room belongs to */
	namespace: string;
	/** Timestamp when joined */
	joinedAt: number;
}

/**
 * Namespace client interface
 */
export interface NamespaceClient {
	/** Namespace path */
	readonly namespace: string;

	/** Emit event to server */
	emit(event: string, data?: Record<string, unknown> | unknown[]): void;

	/** Listen to event */
	on(event: string, handler: EventHandler): void;

	/** Remove event listener */
	off(event: string, handler?: EventHandler): void;

	/** Join a room */
	joinRoom(room: string): void;

	/** Leave a room */
	leaveRoom(room: string): void;

	/** Get current rooms */
	getRooms(): string[];
}

/**
 * Connection info
 */
export interface ConnectionInfo {
	/** Current connection state */
	state: ConnectionState;
	/** WebSocket URL */
	url: string;
	/** Current namespace */
	namespace: string;
	/** Connected timestamp (null if not connected) */
	connectedAt: number | null;
	/** Reconnection attempt count */
	reconnectAttempts: number;
	/** Is reconnecting */
	isReconnecting: boolean;
}
