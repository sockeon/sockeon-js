/**
 * Sockeon Event Emitter
 *
 * - on / once / off
 * - Wildcard (*)
 * - Subscription.cancel()
 */

import type { EventHandler, Subscription } from "./types";

interface HandlerWrapper {
	handler: EventHandler;
	once: boolean;
}

/**
 * Event emitter for Sockeon client
 */
export class EventEmitter {
	private events: Map<string, HandlerWrapper[]> = new Map();
	private debug: boolean = false;

	constructor(debug: boolean = false) {
		this.debug = debug;
	}

	/**
	 * Register an event handler; returns cancellable subscription
	 */
	on(event: string, handler: EventHandler): Subscription {
		if (typeof handler !== "function") {
			throw new Error("Event handler must be a function");
		}

		const handlers = this.events.get(event) || [];
		handlers.push({ handler, once: false });
		this.events.set(event, handlers);

		this.log(`Registered handler for event: ${event}`);

		return {
			cancel: () => this.off(event, handler),
		};
	}

	/**
	 * Register a one-time event handler
	 */
	once(event: string, handler: EventHandler): Subscription {
		if (typeof handler !== "function") {
			throw new Error("Event handler must be a function");
		}

		const handlers = this.events.get(event) || [];
		handlers.push({ handler, once: true });
		this.events.set(event, handlers);

		this.log(`Registered once handler for event: ${event}`);

		return {
			cancel: () => this.off(event, handler),
		};
	}

	/**
	 * Remove event handler(s)
	 */
	off(event: string, handler?: EventHandler): void {
		if (!this.events.has(event)) {
			return;
		}

		if (!handler) {
			this.events.delete(event);
			this.log(`Removed all handlers for event: ${event}`);
			return;
		}

		const handlers = this.events.get(event) || [];
		const filtered = handlers.filter((wrapper) => wrapper.handler !== handler);

		if (filtered.length === 0) {
			this.events.delete(event);
		} else {
			this.events.set(event, filtered);
		}

		this.log(`Removed handler for event: ${event}`);
	}

	/**
	 * Emit an event with data
	 */
	emit(event: string, data?: unknown): void {
		this.log(`Emitting event: ${event}`, data);

		const handlers = this.events.get(event) || [];
		this.callHandlers(event, handlers, data);

		const wildcardHandlers = this.events.get("*") || [];
		if (wildcardHandlers.length > 0) {
			this.callHandlers("*", wildcardHandlers, data);
		}
	}

	private callHandlers(
		event: string,
		handlers: HandlerWrapper[],
		data?: unknown,
	): void {
		const toRemove: EventHandler[] = [];

		for (const wrapper of [...handlers]) {
			try {
				wrapper.handler(data);

				if (wrapper.once) {
					toRemove.push(wrapper.handler);
				}
			} catch (error) {
				console.error(`Error in event handler for '${event}':`, error);
			}
		}

		if (toRemove.length > 0) {
			const remaining = handlers.filter(
				(wrapper) => !toRemove.includes(wrapper.handler),
			);
			if (remaining.length === 0) {
				this.events.delete(event);
			} else {
				this.events.set(event, remaining);
			}
		}
	}

	removeAllListeners(): void {
		this.events.clear();
		this.log("Removed all event handlers");
	}

	eventNames(): string[] {
		return Array.from(this.events.keys());
	}

	listenerCount(event: string): number {
		return (this.events.get(event) || []).length;
	}

	hasListeners(event: string): boolean {
		return this.listenerCount(event) > 0;
	}

	private log(...args: unknown[]): void {
		if (this.debug) {
			console.log("[Sockeon Events]", ...args);
		}
	}
}
