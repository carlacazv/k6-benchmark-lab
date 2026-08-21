import assert from 'node:assert/strict';
import {
  decodePacket,
  encodeEvent,
  encodeNamespaceConnect,
  toWebSocketUrl,
} from './socketio-protocol.js';

assert.equal(
  toWebSocketUrl('http://127.0.0.1:3000/'),
  'ws://127.0.0.1:3000/realtime/?EIO=4&transport=websocket',
);
assert.equal(
  toWebSocketUrl('https://example.test'),
  'wss://example.test/realtime/?EIO=4&transport=websocket',
);
assert.equal(encodeNamespaceConnect(), '40');
assert.equal(
  encodeEvent('room:join', { code: 'ABCDE', name: 'Ana' }, 12),
  '4212["room:join",{"code":"ABCDE","name":"Ana"}]',
);

assert.deepEqual(decodePacket('2'), { kind: 'engine-ping' });
assert.equal(decodePacket('0{"sid":"engine-1"}').payload.sid, 'engine-1');
assert.equal(decodePacket('40{"sid":"socket-1"}').kind, 'socket-connect');

const event = decodePacket('42["room:state",{"code":"ABCDE"}]');
assert.equal(event.kind, 'event');
assert.equal(event.event, 'room:state');
assert.equal(event.payload.code, 'ABCDE');

const ack = decodePacket('4312[{"ok":true,"roomId":"room-1"}]');
assert.equal(ack.kind, 'ack');
assert.equal(ack.ackId, 12);
assert.equal(ack.data[0].ok, true);

console.log('Planning Poker Socket.IO protocol codec tests passed');
