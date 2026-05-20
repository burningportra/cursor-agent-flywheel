/**
 * WebSocket protocol tests for flywheel visual-prototype server.
 * Ported from obra/superpowers tests/brainstorm-server/ws-protocol.test.js (MIT).
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');

const SERVER_PATH = path.join(
  __dirname,
  '../../skills/visual-prototype/scripts/server.cjs',
);

const ws = require(SERVER_PATH);
const { computeAcceptKey, encodeFrame, decodeFrame, OPCODES } = ws;

function makeClientFrame(opcode, payload, fin = true) {
  const buf = Buffer.from(payload);
  const mask = crypto.randomBytes(4);
  const masked = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    masked[i] = buf[i] ^ mask[i % 4];
  }

  const finBit = fin ? 0x80 : 0x00;
  let header;
  if (buf.length < 126) {
    header = Buffer.alloc(6);
    header[0] = finBit | opcode;
    header[1] = 0x80 | buf.length;
    mask.copy(header, 2);
  } else if (buf.length < 65536) {
    header = Buffer.alloc(8);
    header[0] = finBit | opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(buf.length, 2);
    mask.copy(header, 4);
  } else {
    header = Buffer.alloc(14);
    header[0] = finBit | opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(buf.length), 2);
    mask.copy(header, 10);
  }

  return Buffer.concat([header, masked]);
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL: ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

test('computeAcceptKey (RFC 6455 example)', () => {
  const clientKey = 'dGhlIHNhbXBsZSBub25jZQ==';
  assert.strictEqual(computeAcceptKey(clientKey), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('encodeFrame small text (server, unmasked)', () => {
  const frame = encodeFrame(OPCODES.TEXT, Buffer.from('Hello'));
  assert.strictEqual(frame[0], 0x81);
  assert.strictEqual(frame[1], 5);
  assert.strictEqual(frame.slice(2).toString(), 'Hello');
});

test('decodeFrame masked client text', () => {
  const frame = makeClientFrame(0x01, '{"type":"ping"}');
  const result = decodeFrame(frame);
  assert.ok(result);
  assert.strictEqual(result.opcode, OPCODES.TEXT);
  assert.strictEqual(result.payload.toString(), '{"type":"ping"}');
});

test('decodeFrame returns null when incomplete', () => {
  const frame = makeClientFrame(0x01, 'hi');
  assert.strictEqual(decodeFrame(frame.subarray(0, 2)), null);
});

test('rejects unmasked client frame', () => {
  const frame = encodeFrame(OPCODES.TEXT, Buffer.from('bad'));
  assert.throws(() => decodeFrame(frame), /Client frames must be masked/);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
