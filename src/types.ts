/**
 * Sockeon WebSocket Client - Type Definitions
 * 
 * Protocol specification based on Sockeon PHP framework:
 * - Message format: { event: string, data: object }
 * - Event names: alphanumeric + dots, underscores, hyphens
 * - System events: connect, disconnect
 * - Authentication: query parameter (?key=)
 */

/**
 * Sockeon message format - matches server protocol exactly
 * Server expects: { "event": "string", "data": {} }
 */
export interface SockeonMessage {
  /** Event name (alphanumeric + ._- only) */
  event: string;
  /** Event payload (must be object or array) */
  data: Record<string, any> | any[];
}

/**
 * Event handler function signature
 */
export type EventHandler = (data: any) => void;

/**
 * Connection state
 */
export enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  CLOSING = 'closing',
}

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
 */
export interface AuthConfig {
  /** Authentication key (sent as ?key= query parameter) */
  key?: string;
}

/**
 * Main client configuration options
 */
export interface SockeonOptions {
  /** WebSocket URL (ws:// or wss://) */
  url: string;
  
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
  details?: any;
}

/**
 * System event names (reserved by Sockeon)
 */
export const SYSTEM_EVENTS = {
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'error',
  RECONNECT: 'reconnect',
  RECONNECT_ATTEMPT: 'reconnect_attempt',
  RECONNECT_FAILED: 'reconnect_failed',
  RECONNECT_ERROR: 'reconnect_error',
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
export const DEFAULT_OPTIONS: Omit<NormalizedSockeonOptions, 'url'> = {
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
  emit(event: string, data?: any): void;
  
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
