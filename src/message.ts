/**
 * Sockeon message encode/decode helpers
 */

import type { SockeonMessage } from "./types";

export const EVENT_NAME_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function isValidEventName(event: string): boolean {
	return event.length > 0 && EVENT_NAME_PATTERN.test(event);
}

/**
 * Normalize decoded `data` to object or array; scalars → {}.
 */
export function normalizeData(
	data: unknown,
): Record<string, unknown> | unknown[] {
	if (data !== null && typeof data === "object") {
		return data as Record<string, unknown> | unknown[];
	}
	return {};
}

export function encodeMessage(message: SockeonMessage): string {
	return JSON.stringify({ event: message.event, data: message.data });
}

export function decodeMessage(raw: string): SockeonMessage {
	const decoded: unknown = JSON.parse(raw);

	if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
		throw new Error("Sockeon frame is not a JSON object");
	}

	const msg = decoded as Record<string, unknown>;

	if (typeof msg.event !== "string" || msg.event.length === 0) {
		throw new Error('Sockeon frame is missing a string "event"');
	}

	return {
		event: msg.event,
		data: normalizeData(msg.data),
	};
}
