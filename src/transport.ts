/**
 * Sockeon WebSocket Transport Layer
 *
 * Handles low-level WebSocket communication:
 * - Connection management
 * - Authentication via ?key= query parameter
 * - Message encoding/decoding (JSON text or binary frames)
 * - Protocol validation
 */

import { decodeMessage, encodeMessage } from "./message";
import type { AuthConfig, SockeonMessage } from "./types";

/**
 * Transport event handlers
 */
export interface TransportEventHandlers {
	onOpen?: () => void;
	onMessage?: (message: SockeonMessage) => void;
	onClose?: (code: number, reason: string) => void;
	onError?: (error: Error) => void;
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

		if (this.options.auth?.token) {
			url.searchParams.set("key", this.options.auth.token);
		}

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
			// Binary frames carry the same JSON blob as text frames.
			this.ws.binaryType = "arraybuffer";
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
			this.handlers.onOpen?.();
		};

		this.ws.onmessage = (event: MessageEvent) => {
			this.handleMessage(event.data);
		};

		this.ws.onclose = (event: CloseEvent) => {
			this.log("WebSocket closed:", event.code, event.reason);
			this.handlers.onClose?.(event.code, event.reason);
		};

		this.ws.onerror = () => {
			this.log("WebSocket error");
			this.handlers.onError?.(new Error("WebSocket error occurred"));
		};
	}

	/**
	 * Handle incoming message (text or binary JSON)
	 */
	private handleMessage(data: string | ArrayBuffer | Blob): void {
		let text: string;

		if (typeof data === "string") {
			text = data;
		} else if (data instanceof ArrayBuffer) {
			text = new TextDecoder().decode(data);
		} else if (typeof Blob !== "undefined" && data instanceof Blob) {
			// binaryType is arraybuffer; Blob path kept for unusual hosts.
			void data.text().then(
				(t) => this.parseAndDispatch(t),
				() => this.handlers.onError?.(new Error("Failed to read binary frame")),
			);
			return;
		} else {
			return;
		}

		this.parseAndDispatch(text);
	}

	private parseAndDispatch(text: string): void {
		try {
			const message = decodeMessage(text);
			this.log("Received message:", message.event, message.data);
			this.handlers.onMessage?.(message);
		} catch (error) {
			this.log("Failed to parse message:", error);
			this.handlers.onError?.(
				error instanceof Error ? error : new Error("Failed to parse message"),
			);
		}
	}

	/**
	 * Send message to server
	 */
	send(message: SockeonMessage): void {
		if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
			throw new Error("WebSocket is not connected");
		}

		try {
			const json = encodeMessage(message);
			this.log("Sending message:", message.event, message.data);
			this.ws.send(json);
		} catch {
			this.log("Failed to send message");
			throw new Error("Failed to send message");
		}
	}

	/**
	 * Disconnect from server
	 */
	disconnect(code: number = 1000, reason: string = "Normal closure"): void {
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
	 * Abort an in-flight handshake without waiting for close handshake.
	 */
	abort(): void {
		if (!this.ws) return;
		try {
			this.ws.onopen = null;
			this.ws.onmessage = null;
			this.ws.onerror = null;
			this.ws.onclose = null;
			if (
				this.ws.readyState === WebSocket.OPEN ||
				this.ws.readyState === WebSocket.CONNECTING
			) {
				this.ws.close(1000, "Aborted");
			}
		} catch {
			// ignore
		}
		this.ws = null;
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
