/**
 * Runnable self-check for protocol helpers (no test framework).
 * Run: node --experimental-strip-types check.ts
 * or after build: node check.mjs
 */
import assert from "node:assert/strict";
import {
	decodeMessage,
	encodeMessage,
	isValidEventName,
} from "./src/message.ts";

assert.equal(isValidEventName("room.join_1-a"), true);
assert.equal(isValidEventName(""), false);
assert.equal(isValidEventName("bad name"), false);
assert.equal(isValidEventName("bad/name"), false);

assert.equal(
	encodeMessage({ event: "message.send", data: { text: "hi" } }),
	'{"event":"message.send","data":{"text":"hi"}}',
);
assert.equal(
	encodeMessage({ event: "ping", data: {} }),
	'{"event":"ping","data":{}}',
);

const welcome = decodeMessage('{"event":"welcome","data":{"id":1}}');
assert.equal(welcome.event, "welcome");
assert.equal((welcome.data as { id: number }).id, 1);

const coerced = decodeMessage('{"event":"x","data":"nope"}');
assert.deepEqual(coerced.data, {});

assert.throws(() => decodeMessage("[]"), /not a JSON object/);
assert.throws(() => decodeMessage('{"data":{}}'), /missing a string "event"/);

const withArray = decodeMessage('{"event":"batch","data":[1,2]}');
assert.deepEqual(withArray.data, [1, 2]);

console.log("ok: message encode/decode + event names");
