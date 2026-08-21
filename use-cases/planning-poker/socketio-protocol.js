export function toWebSocketUrl(baseUrl) {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!normalized) throw new Error('TARGET_BASE_URL is required');
  const websocketBase = normalized
    .replace(/^https:/i, 'wss:')
    .replace(/^http:/i, 'ws:');
  return `${websocketBase}/realtime/?EIO=4&transport=websocket`;
}

export function encodeNamespaceConnect() {
  // Engine.IO message (4) + Socket.IO CONNECT (0)
  return '40';
}

export function encodeEvent(eventName, payload = {}, ackId = null) {
  const id = ackId === null || ackId === undefined ? '' : String(ackId);
  // Engine.IO message (4) + Socket.IO EVENT (2) + optional ack id + JSON payload
  return `42${id}${JSON.stringify([eventName, payload])}`;
}

function parseJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function decodeSocketPayload(kind, remainder) {
  const payloadIndex = remainder.indexOf('[');
  if (payloadIndex < 0) return { kind: 'unknown', raw: remainder };
  const idText = remainder.slice(0, payloadIndex);
  const data = parseJson(remainder.slice(payloadIndex), []);
  return {
    kind,
    ackId: idText ? Number(idText) : null,
    data,
    event: kind === 'event' && Array.isArray(data) ? data[0] : null,
    payload: Array.isArray(data) ? data[1] : null,
  };
}

export function decodePacket(rawMessage) {
  const message = String(rawMessage ?? '');

  if (message === '2') return { kind: 'engine-ping' };
  if (message === '1') return { kind: 'engine-close' };
  if (message.startsWith('0')) {
    return { kind: 'engine-open', payload: parseJson(message.slice(1), {}) };
  }

  // Engine.IO message (4) + Socket.IO packet type.
  if (message.startsWith('40')) {
    return { kind: 'socket-connect', payload: parseJson(message.slice(2), {}) };
  }
  if (message.startsWith('44')) {
    return { kind: 'socket-connect-error', payload: parseJson(message.slice(2), {}) };
  }
  if (message.startsWith('42')) return decodeSocketPayload('event', message.slice(2));
  if (message.startsWith('43')) return decodeSocketPayload('ack', message.slice(2));

  return { kind: 'unknown', raw: message };
}
