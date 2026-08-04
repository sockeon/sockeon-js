/**
 * Sockeon WebSocket Client
 *
 * Event-based API matching Sockeon protocol (server 2.x / 3.x).
 *
 * @example
 * ```ts
 * import { Sockeon } from '@sockeon/client';
 *
 * const socket = new Sockeon({
 *   url: 'ws://localhost:6001',
 *   auth: { token: 'your-token' },
 * });
 *
 * socket.on('chat.message', (data) => console.log(data));
 * await socket.connect();
 * await socket.joinRoom('general');
 * socket.emit('chat.send', { body: 'Hello!' });
 * ```
 */

import { EventEmitter } from "./events";
import { isValidEventName } from "./message";
import { WebSocketTransport } from "./transport";
import type {
	ConnectionInfo,
	ConnectionState,
	EventHandler,
	HeartbeatConfig,
	NormalizedSockeonOptions,
	ReconnectConfig,
	RoomInfo,
	RoomOptions,
	SockeonMessage,
	SockeonOptions,
	Subscription,
} from "./types";

interface RoomKey {
	room: string;
	namespace: string;
}

function roomKeyId(key: RoomKey): string {
	return `${key.namespace}\0${key.room}`;
}

/**
 * Main Sockeon WebSocket client
 */
export class Sockeon {
	private options: NormalizedSockeonOptions;
	private transport: WebSocketTransport;
	private events: EventEmitter;
	private state: ConnectionState = "disconnected";
	private reconnectAttempts: number = 0;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectTimer: ReturnType<typeof setTimeout> | null = null;
	private connectedAt: number | null = null;
	private rooms: Map<string, RoomInfo> = new Map();
	private manualDisconnect: boolean = false;
	private connectPromise: Promise<void> | null = null;
	private connectResolve: (() => void) | null = null;
	private connectReject: ((err: Error) => void) | null = null;

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

	private normalizeOptions(options: SockeonOptions): NormalizedSockeonOptions {
		const defaults = {
			namespace: "/",
			reconnect: {
				enabled: true,
				maxAttempts: 5,
				delay: 1000,
				maxDelay: 30000,
				factor: 1.5,
				rejoinRooms: true,
			},
			heartbeat: {
				enabled: false,
				interval: 30000,
				timeout: 5000,
			},
			connectTimeout: 10000,
			ackTimeout: 10000,
			query: {},
			debug: false,
		};

		let reconnect: ReconnectConfig;
		if (typeof options.reconnect === "boolean") {
			reconnect = { ...defaults.reconnect, enabled: options.reconnect };
		} else if (options.reconnect) {
			reconnect = { ...defaults.reconnect, ...options.reconnect };
		} else {
			reconnect = defaults.reconnect;
		}

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
			connectTimeout: options.connectTimeout ?? defaults.connectTimeout,
			ackTimeout: options.ackTimeout ?? defaults.ackTimeout,
			query: { ...defaults.query, ...options.query },
			protocols: options.protocols,
			debug: options.debug ?? defaults.debug,
		};
	}

	private setupTransportHandlers(): void {
		this.transport.on({
			onOpen: () => this.handleConnect(),
			onMessage: (message) => this.handleMessage(message),
			onClose: (code, reason) => this.handleDisconnect(code, reason),
			onError: (error) => this.handleError(error),
		});
	}

	/**
	 * Connect to the WebSocket server.
	 * Resolves when handshake succeeds; rejects on failure or connectTimeout.
	 */
	connect(): Promise<void> {
		if (this.state === "connected") {
			return Promise.resolve();
		}

		if (this.connectPromise) {
			return this.connectPromise;
		}

		this.manualDisconnect = false;

		this.connectPromise = new Promise<void>((resolve, reject) => {
			this.connectResolve = resolve;
			this.connectReject = reject;
			this.state =
				this.reconnectAttempts > 0 ? "reconnecting" : "connecting";
			this.transport.connect();

			this.connectTimer = setTimeout(() => {
				this.failConnect(
					new Error(
						`Timed out connecting to ${this.options.url} after ${this.options.connectTimeout}ms`,
					),
				);
			}, this.options.connectTimeout);
		});

		return this.connectPromise;
	}

	/**
	 * Disconnect from the WebSocket server (disables auto-reconnect)
	 */
	disconnect(): void {
		this.manualDisconnect = true;
		this.clearReconnectTimer();
		this.clearConnectTimer();
		this.rejectConnect(new Error("Client disconnect"));

		if (this.state !== "disconnected") {
			this.state = "closing";
			this.transport.disconnect(1000, "Client disconnect");
		}
	}

	/**
	 * Register event handler
	 */
	on(event: string, handler: EventHandler): Subscription {
		return this.events.on(event, handler);
	}

	/**
	 * Register one-time event handler
	 */
	once(event: string, handler: EventHandler): Subscription {
		return this.events.once(event, handler);
	}

	/**
	 * Remove event handler
	 */
	off(event: string, handler?: EventHandler): void {
		this.events.off(event, handler);
	}

	/**
	 * Emit event to server
	 */
	emit(event: string, data: Record<string, unknown> | unknown[] = {}): void {
		if (this.state !== "connected") {
			throw new Error("Cannot emit: WebSocket is not connected");
		}

		if (!isValidEventName(event)) {
			throw new Error(
				"Invalid event name: only alphanumeric characters, dots, underscores, and hyphens are allowed",
			);
		}

		if (typeof data !== "object" || data === null) {
			throw new Error("Data must be an object or array");
		}

		const message: SockeonMessage = { event, data };
		this.transport.send(message);
	}

	/**
	 * Join a room; resolves on `room_joined` ack (or ackTimeout).
	 */
	joinRoom(room: string, options?: RoomOptions): Promise<void> {
		const namespace = options?.namespace ?? this.options.namespace;
		const key: RoomKey = { room, namespace };
		this.rooms.set(roomKeyId(key), {
			name: room,
			namespace,
			joinedAt: Date.now(),
		});

		return this.roomRequest({
			emitEvent: "join_room",
			ackEvent: "room_joined",
			room,
			namespace,
		});
	}

	/**
	 * Leave a room; resolves on `room_left` ack (or ackTimeout).
	 */
	leaveRoom(room: string, options?: RoomOptions): Promise<void> {
		const namespace = options?.namespace ?? this.options.namespace;
		this.rooms.delete(roomKeyId({ room, namespace }));

		return this.roomRequest({
			emitEvent: "leave_room",
			ackEvent: "room_left",
			room,
			namespace,
		});
	}

	private roomRequest(args: {
		emitEvent: string;
		ackEvent: string;
		room: string;
		namespace: string;
	}): Promise<void> {
		const { emitEvent, ackEvent, room, namespace } = args;

		return new Promise<void>((resolve, reject) => {
			let settled = false;
			let timer: ReturnType<typeof setTimeout> | null = null;
			let sub: Subscription | null = null;

			const finish = (error?: Error) => {
				if (settled) return;
				settled = true;
				if (timer !== null) clearTimeout(timer);
				sub?.cancel();
				if (error) reject(error);
				else resolve();
			};

			sub = this.on(ackEvent, (data) => {
				const payload = data as Record<string, unknown>;
				if (payload.room === room) {
					// Namespace match when server sends it
					if (
						payload.namespace !== undefined &&
						payload.namespace !== namespace
					) {
						return;
					}
					finish();
				}
			});

			timer = setTimeout(() => {
				finish(
					new Error(
						`Timed out waiting for "${ackEvent}" acknowledgement for room "${room}"`,
					),
				);
			}, this.options.ackTimeout);

			try {
				this.emit(emitEvent, { room, namespace });
			} catch (error) {
				finish(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	/**
	 * Room names currently tracked (for rejoin)
	 */
	getRooms(): string[] {
		return Array.from(
			new Set(Array.from(this.rooms.values()).map((r) => r.name)),
		);
	}

	/**
	 * Full room info currently tracked
	 */
	getJoinedRooms(): RoomInfo[] {
		return Array.from(this.rooms.values());
	}

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

	getState(): ConnectionState {
		return this.state;
	}

	isConnected(): boolean {
		return this.state === "connected";
	}

	private handleConnect(): void {
		this.clearConnectTimer();
		this.state = "connected";
		this.connectedAt = Date.now();
		this.reconnectAttempts = 0;
		this.clearReconnectTimer();

		if (this.options.heartbeat.enabled) {
			// ponytail: browser WS cannot send ping frames; native stack handles keep-alive
			this.log(
				"heartbeat option enabled but is a no-op in browsers (native ping/pong)",
			);
		}

		this.log("Connected to Sockeon server");
		this.events.emit("connect", {
			namespace: this.options.namespace,
			timestamp: this.connectedAt,
		});

		this.rejoinRoomsIfNeeded();
		this.resolveConnect();
	}

	private rejoinRoomsIfNeeded(): void {
		if (!this.options.reconnect.rejoinRooms || this.rooms.size === 0) {
			return;
		}

		for (const info of this.rooms.values()) {
			try {
				this.emit("join_room", {
					room: info.name,
					namespace: info.namespace,
				});
			} catch (error) {
				this.log("Failed to rejoin room:", info.name, error);
			}
		}
	}

	private handleMessage(message: SockeonMessage): void {
		const { event, data } = message;
		this.log(`Received event: ${event}`, data);
		this.events.emit(event, data);
	}

	private handleDisconnect(code: number, reason: string): void {
		this.clearConnectTimer();
		const wasConnected = this.state === "connected";
		const wasConnecting =
			this.state === "connecting" || this.state === "reconnecting";

		this.state = "disconnected";
		this.connectedAt = null;
		// Keep rooms for rejoin; do not clear.

		this.log(`Disconnected (code: ${code}, reason: ${reason})`);

		if (wasConnecting && this.connectReject) {
			this.failConnect(
				new Error(`Connection closed during handshake (${code}: ${reason})`),
			);
			return;
		}

		if (wasConnected) {
			this.events.emit("disconnect", { code, reason });
		}

		if (!this.manualDisconnect && this.options.reconnect.enabled) {
			this.scheduleReconnect();
		}
	}

	private handleError(error: Error): void {
		this.log("Transport error:", error);

		if (this.connectReject) {
			// Handshake error; failConnect aborts socket → onclose may follow.
			this.failConnect(error);
			return;
		}

		this.events.emit("error", {
			message: error.message,
			timestamp: Date.now(),
		});
	}

	private resolveConnect(): void {
		const resolve = this.connectResolve;
		this.connectPromise = null;
		this.connectResolve = null;
		this.connectReject = null;
		resolve?.();
	}

	private rejectConnect(error: Error): void {
		const reject = this.connectReject;
		this.connectPromise = null;
		this.connectResolve = null;
		this.connectReject = null;
		reject?.(error);
	}

	private failConnect(error: Error): void {
		this.clearConnectTimer();
		this.transport.abort();
		this.state = "disconnected";

		const wasInitial = this.reconnectAttempts === 0;
		this.rejectConnect(error);

		// Initial connect failure: leave disconnected (caller may retry).
		// Auto-reconnect failure: keep attempting until maxAttempts.
		if (
			!wasInitial &&
			!this.manualDisconnect &&
			this.options.reconnect.enabled
		) {
			this.scheduleReconnect();
		}
	}

	private scheduleReconnect(): void {
		const { maxAttempts, delay, maxDelay, factor } = this.options.reconnect;

		if (maxAttempts > 0 && this.reconnectAttempts >= maxAttempts) {
			this.log("Max reconnection attempts reached");
			this.events.emit("reconnect_failed", {
				attempts: this.reconnectAttempts,
				maxAttempts,
			});
			return;
		}

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

		this.reconnectTimer = setTimeout(() => {
			this.log(`Reconnection attempt ${this.reconnectAttempts}`);
			this.manualDisconnect = false;
			void this.connect().catch(() => {
				// connect failure already routed; scheduleReconnect via disconnect if needed
			});
		}, currentDelay);
	}

	private clearReconnectTimer(): void {
		if (this.reconnectTimer !== null) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
	}

	private clearConnectTimer(): void {
		if (this.connectTimer !== null) {
			clearTimeout(this.connectTimer);
			this.connectTimer = null;
		}
	}

	private log(...args: unknown[]): void {
		if (this.options.debug) {
			console.log("[Sockeon Client]", ...args);
		}
	}
}

export type {
	AuthConfig,
	ConnectionInfo,
	ConnectionState,
	EventHandler,
	HeartbeatConfig,
	ReconnectConfig,
	RoomInfo,
	RoomOptions,
	SockeonMessage,
	SockeonOptions,
	Subscription,
} from "./types";

export { CLOSE_CODES, SYSTEM_EVENTS } from "./types";
export { decodeMessage, encodeMessage, isValidEventName } from "./message";
