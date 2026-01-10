/**
 * Sockeon WebSocket Transport Layer
 *
 * Handles low-level WebSocket communication:
 * - Connection management
 * - Authentication via ?key= query parameter
 * - Standard WebSocket ping/pong frames
 * - Message encoding/decoding (JSON)
 * - Protocol validation
 */

import type { AuthConfig, SockeonMessage } from "./types";

/**
 * Transport event handlers
 */
export interface TransportEventHandlers {
	onOpen?: () => void;
	onMessage?: (message: SockeonMessage) => void;
	onClose?: (code: number, reason: string) => void;
	onError?: (error: Error) => void;
	onPong?: () => void;
}

/**
 * Transport options
 */
export interface TransportOptions {
	url: string;
	auth?: AuthConfig;
	query?: Record<string, string>;
	protocols?: string | string[];
	debug?: boolean;
}

/**
 * WebSocket transport wrapper
 */
export class WebSocketTransport {
	private ws: WebSocket | null = null;
	private handlers: TransportEventHandlers = {};
	private options: TransportOptions;
	private pingInterval: number | null = null;
	private pongTimeout: number | null = null;
	private lastPongTime: number = 0;
	private debug: boolean = false;

	constructor(options: TransportOptions) {
		this.options = options;
		this.debug = options.debug ?? false;
	}

	/**
	 * Build WebSocket URL with query parameters
	 */
	private buildUrl(): string {
		const url = new URL(this.options.url);

		// Add auth token if provided (server expects ?key=)
		if (this.options.auth?.token) {
			url.searchParams.set("key", this.options.auth.token);
		}

		// Add additional query parameters
		if (this.options.query) {
			Object.entries(this.options.query).forEach(([key, value]) => {
				url.searchParams.set(key, value);
			});
		}

		return url.toString();
	}

	/**
	 * Connect to WebSocket server
	 */
	connect(): void {
		if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
			this.log("Already connected or connecting");
			return;
		}

		const url = this.buildUrl();
		this.log("Connecting to:", url.replace(/key=[^&]+/, "key=***"));

		try {
			this.ws = new WebSocket(url, this.options.protocols);
			this.setupEventHandlers();
		} catch (error) {
			this.log("Connection error:", error);
			this.handlers.onError?.(error as Error);
		}
	}

	/**
	 * Setup WebSocket event handlers
	 */
	private setupEventHandlers(): void {
		if (!this.ws) return;

		this.ws.onopen = () => {
			this.log("WebSocket connected");
			this.lastPongTime = Date.now();
			this.handlers.onOpen?.();
		};

		this.ws.onmessage = (event: MessageEvent) => {
			this.handleMessage(event.data);
		};

		this.ws.onclose = (event: CloseEvent) => {
			this.log("WebSocket closed:", event.code, event.reason);
			this.stopHeartbeat();
			this.handlers.onClose?.(event.code, event.reason);
		};

		this.ws.onerror = (event: Event) => {
			this.log("WebSocket error:", event);
			const error = new Error("WebSocket error occurred");
			this.handlers.onError?.(error);
		};
	}

	/**
	 * Handle incoming message
	 */
	private handleMessage(data: string | ArrayBuffer | Blob): void {
		// Handle binary data (ping/pong frames)
		if (data instanceof ArrayBuffer || data instanceof Blob) {
			this.log("Received binary frame (likely pong)");
			this.lastPongTime = Date.now();
			this.handlers.onPong?.();
			return;
		}

		// Parse JSON message
		try {
			const message = JSON.parse(data);

			// Validate message structure
			if (!this.isValidMessage(message)) {
				this.log("Invalid message structure:", message);
				this.handlers.onError?.(new Error("Invalid message format"));
				return;
			}

			this.log("Received message:", message.event, message.data);
			this.handlers.onMessage?.(message);
		} catch (error) {
			this.log("Failed to parse message:", error);
			this.handlers.onError?.(new Error("Failed to parse message"));
		}
	}

	/**
	 * Validate message structure matches Sockeon protocol
	 * Server expects: { "event": "string", "data": {} }
	 */
	private isValidMessage(message: unknown): message is SockeonMessage {
		if (!message || typeof message !== "object") {
			return false;
		}

		const msg = message as Record<string, unknown>;

		// Event must be a non-empty string
		if (typeof msg.event !== "string" || msg.event.length === 0) {
			return false;
		}

		// Data must exist (can be empty object/array)
		if (!("data" in msg)) {
			return false;
		}

		return true;
	}

	/**
	 * Send message to server
	 */
	send(message: SockeonMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		try {
			const json = JSON.stringify(message);
			this.log("Sending message:", message.event, message.data);
			this.ws.send(json);
		} catch (error) {
			this.log("Failed to send message:", error);
			throw new Error("Failed to send message");
		}
	}

	/**
	 * Send ping frame to server
	 * Note: Browser WebSocket API doesn't expose ping control directly,
	 * but the browser automatically handles ping/pong frames.
	 * This is a placeholder for manual heartbeat if needed.
	 */
	sendPing(): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			return;
		}

		// Browser WebSocket automatically handles ping/pong
		// We just update the timestamp to track connectivity
		this.log("Heartbeat check");
	}

	/**
	 * Start heartbeat (periodic ping)
	 */
	startHeartbeat(interval: number, timeout: number): void {
		this.stopHeartbeat();

		this.pingInterval = window.setInterval(() => {
			const timeSinceLastPong = Date.now() - this.lastPongTime;

			// Check if we've received pong recently
			if (timeSinceLastPong > timeout) {
				this.log("Heartbeat timeout - no pong received");
				this.disconnect(1000, "Heartbeat timeout");
				return;
			}

			this.sendPing();
		}, interval);

		this.log("Heartbeat started:", interval, "ms");
	}

	/**
	 * Stop heartbeat
	 */
	stopHeartbeat(): void {
		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
			this.log("Heartbeat stopped");
		}

		if (this.pongTimeout !== null) {
			clearTimeout(this.pongTimeout);
			this.pongTimeout = null;
		}
	}

	/**
	 * Disconnect from server
	 */
	disconnect(code: number = 1000, reason: string = "Normal closure"): void {
		this.stopHeartbeat();

		if (this.ws) {
			if (
				this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING
			) {
				this.log("Disconnecting:", code, reason);
				this.ws.close(code, reason);
			}
			this.ws = null;
		}
	}

	/**
	 * Register event handlers
	 */
	on(handlers: TransportEventHandlers): void {
		this.handlers = { ...this.handlers, ...handlers };
	}

	/**
	 * Get current WebSocket state
	 */
	getState(): number {
		return this.ws?.readyState ?? WebSocket.CLOSED;
	}

	/**
	 * Check if connected
	 */
	isConnected(): boolean {
		return this.ws?.readyState === WebSocket.OPEN;
	}

	/**
	 * Debug logging
	 */
	private log(...args: unknown[]): void {
		if (this.debug) {
			console.log("[Sockeon Transport]", ...args);
		}
	}
}
