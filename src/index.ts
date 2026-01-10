/**
 * Sockeon WebSocket Client
 *
 * Main client class for connecting to Sockeon WebSocket server.
 * Provides event-based API matching the Sockeon protocol exactly.
 *
 * @example
 * ```ts
 * import { Sockeon } from '@sockeon/client';
 *
 * const socket = new Sockeon({
 *   url: 'ws://localhost:6001',
 *   namespace: '/',
 *   auth: { token: 'your-token' },
 *   reconnect: true,
 * });
 *
 * socket.on('connect', () => console.log('Connected'));
 * socket.on('chat.message', (data) => console.log('Message:', data));
 *
 * socket.emit('chat.send', { body: 'Hello!' });
 * ```
 */

import { EventEmitter } from "./events";
import { WebSocketTransport } from "./transport";
import type {
	ConnectionInfo,
	ConnectionState,
	EventHandler,
	HeartbeatConfig,
	NormalizedSockeonOptions,
	ReconnectConfig,
	SockeonMessage,
	SockeonOptions,
} from "./types";

/**
 * Main Sockeon WebSocket client
 */
export class Sockeon {
	private options: NormalizedSockeonOptions;
	private transport: WebSocketTransport;
	private events: EventEmitter;
	private state: ConnectionState = "disconnected";
	private reconnectAttempts: number = 0;
	private reconnectTimer: number | null = null;
	private heartbeatTimer: number | null = null;
	private connectedAt: number | null = null;
	private rooms: Set<string> = new Set();
	private manualDisconnect: boolean = false;

	constructor(options: SockeonOptions) {
		this.options = this.normalizeOptions(options);
		this.events = new EventEmitter(this.options.debug);
		this.transport = new WebSocketTransport({
			url: this.options.url,
			auth: this.options.auth,
			query: this.options.query,
			protocols: this.options.protocols,
			debug: this.options.debug,
		});

		this.setupTransportHandlers();
	}

	/**
	 * Normalize and merge options with defaults
	 */
	private normalizeOptions(options: SockeonOptions): NormalizedSockeonOptions {
		const defaults = {
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

		// Handle reconnect option
		let reconnect: ReconnectConfig;
		if (typeof options.reconnect === "boolean") {
			reconnect = { ...defaults.reconnect, enabled: options.reconnect };
		} else if (options.reconnect) {
			reconnect = { ...defaults.reconnect, ...options.reconnect };
		} else {
			reconnect = defaults.reconnect;
		}

		// Handle heartbeat option
		let heartbeat: HeartbeatConfig;
		if (typeof options.heartbeat === "boolean") {
			heartbeat = { ...defaults.heartbeat, enabled: options.heartbeat };
		} else if (options.heartbeat) {
			heartbeat = { ...defaults.heartbeat, ...options.heartbeat };
		} else {
			heartbeat = defaults.heartbeat;
		}

		return {
			url: options.url,
			namespace: options.namespace || defaults.namespace,
			auth: options.auth,
			reconnect,
			heartbeat,
			query: { ...defaults.query, ...options.query },
			protocols: options.protocols,
			debug: options.debug ?? defaults.debug,
		};
	}

	/**
	 * Setup transport event handlers
	 */
	private setupTransportHandlers(): void {
		this.transport.on({
			onOpen: () => this.handleConnect(),
			onMessage: (message) => this.handleMessage(message),
			onClose: (code, reason) => this.handleDisconnect(code, reason),
			onError: (error) => this.handleError(error),
			onPong: () => this.handlePong(),
		});
	}

	/**
	 * Connect to the WebSocket server
	 */
	connect(): void {
		if (this.state === "connected" || this.state === "connecting") {
			this.log("Already connected or connecting");
			return;
		}

		this.manualDisconnect = false;
		this.state = "connecting";
		this.transport.connect();
	}

	/**
	 * Disconnect from the WebSocket server
	 */
	disconnect(): void {
		this.manualDisconnect = true;
		this.clearReconnectTimer();
		this.clearHeartbeatTimer();

		if (this.state !== "disconnected") {
			this.state = "closing";
			this.transport.disconnect(1000, "Client disconnect");
		}
	}

	/**
	 * Register event handler
	 */
	on(event: string, handler: EventHandler): void {
		this.events.on(event, handler);
	}

	/**
	 * Register one-time event handler
	 */
	once(event: string, handler: EventHandler): void {
		this.events.once(event, handler);
	}

	/**
	 * Remove event handler
	 */
	off(event: string, handler?: EventHandler): void {
		this.events.off(event, handler);
	}

	/**
	 * Emit event to server
	 * Validates event name and data structure per Sockeon protocol
	 */
	emit(event: string, data: Record<string, unknown> | unknown[] = {}): void {
		if (this.state !== "connected") {
			throw new Error("Cannot emit: WebSocket is not connected");
		}

		// Validate event name format (alphanumeric + ._- only)
		if (!/^[a-zA-Z0-9._-]+$/.test(event)) {
			throw new Error(
				"Invalid event name: only alphanumeric characters, dots, underscores, and hyphens are allowed",
			);
		}

		// Ensure data is object or array
		if (typeof data !== "object" || data === null) {
			throw new Error("Data must be an object or array");
		}

		const message: SockeonMessage = { event, data };
		this.transport.send(message);
	}

	/**
	 * Join a room in the current namespace
	 */
	joinRoom(room: string): void {
		if (this.state !== "connected") {
			throw new Error("Cannot join room: not connected");
		}

		this.rooms.add(room);
		this.emit("join_room", { room, namespace: this.options.namespace });
		this.log(`Joined room: ${room}`);
	}

	/**
	 * Leave a room in the current namespace
	 */
	leaveRoom(room: string): void {
		if (this.state !== "connected") {
			throw new Error("Cannot leave room: not connected");
		}

		this.rooms.delete(room);
		this.emit("leave_room", { room, namespace: this.options.namespace });
		this.log(`Left room: ${room}`);
	}

	/**
	 * Get current rooms
	 */
	getRooms(): string[] {
		return Array.from(this.rooms);
	}

	/**
	 * Get connection info
	 */
	getConnectionInfo(): ConnectionInfo {
		return {
			state: this.state,
			url: this.options.url,
			namespace: this.options.namespace,
			connectedAt: this.connectedAt,
			reconnectAttempts: this.reconnectAttempts,
			isReconnecting: this.state === "reconnecting",
		};
	}

	/**
	 * Get current connection state
	 */
	getState(): ConnectionState {
		return this.state;
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.state === "connected";
	}

	/**
	 * Handle successful connection
	 */
	private handleConnect(): void {
		this.state = "connected";
		this.connectedAt = Date.now();
		this.reconnectAttempts = 0;
		this.clearReconnectTimer();

		// Start heartbeat if enabled
		if (this.options.heartbeat.enabled) {
			this.startHeartbeat();
		}

		this.log("Connected to Sockeon server");
		this.events.emit("connect", {
			namespace: this.options.namespace,
			timestamp: this.connectedAt,
		});
	}

	/**
	 * Handle incoming message from server
	 */
	private handleMessage(message: SockeonMessage): void {
		const { event, data } = message;

		this.log(`Received event: ${event}`, data);
		this.events.emit(event, data);
	}

	/**
	 * Handle disconnection
	 */
	private handleDisconnect(code: number, reason: string): void {
		this.clearHeartbeatTimer();
		const wasConnected = this.state === "connected";

		this.state = "disconnected";
		this.connectedAt = null;
		this.rooms.clear();

		this.log(`Disconnected (code: ${code}, reason: ${reason})`);

		if (wasConnected) {
			this.events.emit("disconnect", { code, reason });
		}

		// Attempt reconnection if not manual disconnect
		if (!this.manualDisconnect && this.options.reconnect.enabled) {
			this.scheduleReconnect();
		}
	}

	/**
	 * Handle transport error
	 */
	private handleError(error: Error): void {
		this.log("Transport error:", error);
		this.events.emit("error", {
			message: error.message,
			timestamp: Date.now(),
		});
	}

	/**
	 * Handle pong response
	 */
	private handlePong(): void {
		this.log("Pong received");
	}

	/**
	 * Schedule reconnection attempt
	 */
	private scheduleReconnect(): void {
		const { maxAttempts, delay, maxDelay, factor } = this.options.reconnect;

		// Check if max attempts reached
		if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
			this.log("Max reconnection attempts reached");
			this.events.emit("reconnect_failed", {
				attempts: this.reconnectAttempts,
				maxAttempts,
			});
			return;
		}

		// Calculate delay with exponential backoff
		const currentDelay = Math.min(
			delay * factor ** this.reconnectAttempts,
			maxDelay,
		);

		this.reconnectAttempts++;
		this.state = "reconnecting";

		this.log(
			`Reconnecting in ${currentDelay}ms (attempt ${this.reconnectAttempts})`,
		);
		this.events.emit("reconnect_attempt", {
			attempt: this.reconnectAttempts,
			delay: currentDelay,
		});

		this.reconnectTimer = window.setTimeout(() => {
			this.log(`Reconnection attempt ${this.reconnectAttempts}`);
			this.transport.connect();
		}, currentDelay);
	}

	/**
	 * Clear reconnect timer
	 */
	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	/**
	 * Start heartbeat mechanism
	 */
	private startHeartbeat(): void {
		this.clearHeartbeatTimer();

		const { interval } = this.options.heartbeat;
		this.heartbeatTimer = window.setInterval(() => {
			if (this.state === "connected") {
				this.transport.sendPing();
			}
		}, interval);

		this.log(`Heartbeat started (interval: ${interval}ms)`);
	}

	/**
	 * Clear heartbeat timer
	 */
	private clearHeartbeatTimer(): void {
		if (this.heartbeatTimer !== null) {
			clearInterval(this.heartbeatTimer);
			this.heartbeatTimer = null;
		}
	}

	/**
	 * Debug logging
	 */
	private log(...args: unknown[]): void {
		if (this.options.debug) {
			console.log("[Sockeon Client]", ...args);
		}
	}
}

// Export types and constants
export type {
	AuthConfig,
	ConnectionInfo,
	ConnectionState,
	EventHandler,
	HeartbeatConfig,
	ReconnectConfig,
	RoomInfo,
	SockeonMessage,
	SockeonOptions,
} from "./types";

export { CLOSE_CODES, SYSTEM_EVENTS } from "./types";
