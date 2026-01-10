/**
 * Sockeon Event Emitter
 * 
 * Simple event emitter for handling:
 * - Event registration (on)
 * - Event emission (emit)
 * - Event removal (off)
 * - Once handlers
 * - Wildcard support (*)
 */

import type { EventHandler } from './types';

/**
 * Internal event handler wrapper
 */
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
   * Register an event handler
   */
  on(event: string, handler: EventHandler): void {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    const handlers = this.events.get(event) || [];
    handlers.push({ handler, once: false });
    this.events.set(event, handlers);

    this.log(`Registered handler for event: ${event}`);
  }

  /**
   * Register a one-time event handler
   */
  once(event: string, handler: EventHandler): void {
    if (typeof handler !== 'function') {
      throw new Error('Event handler must be a function');
    }

    const handlers = this.events.get(event) || [];
    handlers.push({ handler, once: true });
    this.events.set(event, handlers);

    this.log(`Registered once handler for event: ${event}`);
  }

  /**
   * Remove event handler(s)
   * If no handler provided, removes all handlers for the event
   */
  off(event: string, handler?: EventHandler): void {
    if (!this.events.has(event)) {
      return;
    }

    // Remove all handlers for this event
    if (!handler) {
      this.events.delete(event);
      this.log(`Removed all handlers for event: ${event}`);
      return;
    }

    // Remove specific handler
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
  emit(event: string, data?: any): void {
    this.log(`Emitting event: ${event}`, data);

    // Call handlers for specific event
    const handlers = this.events.get(event) || [];
    this.callHandlers(event, handlers, data);

    // Call wildcard handlers
    const wildcardHandlers = this.events.get('*') || [];
    if (wildcardHandlers.length > 0) {
      this.callHandlers(event, wildcardHandlers, data);
    }
  }

  /**
   * Call all handlers for an event
   */
  private callHandlers(event: string, handlers: HandlerWrapper[], data?: any): void {
    const toRemove: EventHandler[] = [];

    for (const wrapper of handlers) {
      try {
        wrapper.handler(data);

        // Mark once handlers for removal
        if (wrapper.once) {
          toRemove.push(wrapper.handler);
        }
      } catch (error) {
        console.error(`Error in event handler for '${event}':`, error);
      }
    }

    // Remove once handlers
    if (toRemove.length > 0) {
      const remaining = handlers.filter((wrapper) => !toRemove.includes(wrapper.handler));
      if (remaining.length === 0) {
        this.events.delete(event);
      } else {
        this.events.set(event, remaining);
      }
    }
  }

  /**
   * Remove all event handlers
   */
  removeAllListeners(): void {
    this.events.clear();
    this.log('Removed all event handlers');
  }

  /**
   * Get all registered event names
   */
  eventNames(): string[] {
    return Array.from(this.events.keys());
  }

  /**
   * Get handler count for an event
   */
  listenerCount(event: string): number {
    return (this.events.get(event) || []).length;
  }

  /**
   * Check if event has any listeners
   */
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }

  /**
   * Debug logging
   */
  private log(...args: any[]): void {
    if (this.debug) {
      console.log('[Sockeon Events]', ...args);
    }
  }
}
