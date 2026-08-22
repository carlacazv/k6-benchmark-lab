import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { summaryOutputs } from '../../tests/lib/summary.js';
import {
  decodePacket,
  encodeEvent,
  encodeNamespaceConnect,
  toWebSocketUrl,
} from './socketio-protocol.js';

const PRESETS = {
  baseline: { rooms: 1, participantsPerRoom: 5, arrivalWindowMs: 0 },
  load: { rooms: 4, participantsPerRoom: 5, arrivalWindowMs: 10000 },
  stress: { rooms: 10, participantsPerRoom: 5, arrivalWindowMs: 15000 },
  spike: { rooms: 20, participantsPerRoom: 5, arrivalWindowMs: 1000 },
  'fanout-5': { rooms: 1, participantsPerRoom: 5, arrivalWindowMs: 0 },
  'fanout-10': { rooms: 1, participantsPerRoom: 10, arrivalWindowMs: 0 },
  'fanout-20': { rooms: 1, participantsPerRoom: 20, arrivalWindowMs: 0 },
  'fanout-40': { rooms: 1, participantsPerRoom: 40, arrivalWindowMs: 0 },
};

const scenario = String(__ENV.PP_SCENARIO || __ENV.SCENARIO || 'baseline').toLowerCase();
const preset = PRESETS[scenario];
if (!preset) {
  throw new Error(`Unsupported PP_SCENARIO=${scenario}. Use ${Object.keys(PRESETS).join('|')}.`);
}

const baseUrl = __ENV.TARGET_BASE_URL || 'http://127.0.0.1:3000';
const socketUrl = toWebSocketUrl(baseUrl);
const rooms = Number(__ENV.ROOMS || preset.rooms);
const participantsPerRoom = Number(__ENV.PARTICIPANTS_PER_ROOM || preset.participantsPerRoom);
const arrivalWindowMs = Number(__ENV.ARRIVAL_WINDOW_MS ?? preset.arrivalWindowMs);
const totalVus = rooms * participantsPerRoom;
const sessionTimeoutMs = Number(__ENV.SESSION_TIMEOUT_MS || 14000);
const roundStartDelayMs = Number(__ENV.ROUND_START_DELAY_MS || 3500);
const voteDelayMs = Number(__ENV.VOTE_DELAY_MS || 5000);
const provisionalP95Ms = Number(__ENV.PLANNING_POKER_SOCKET_P95_MS || 2000);

if (!Number.isInteger(rooms) || rooms < 1) throw new Error('ROOMS must be a positive integer.');
if (!Number.isInteger(participantsPerRoom) || participantsPerRoom < 2) throw new Error('PARTICIPANTS_PER_ROOM must be an integer >= 2.');
if (!Number.isFinite(arrivalWindowMs) || arrivalWindowMs < 0) throw new Error('ARRIVAL_WINDOW_MS must be >= 0.');

const socketConnect = new Trend('planning_poker_socket_connect_ms', true);
const roomJoinAck = new Trend('planning_poker_room_join_ack_ms', true);
const roundStartAck = new Trend('planning_poker_round_start_ack_ms', true);
const roundSelectAck = new Trend('planning_poker_round_select_ack_ms', true);
const consensusAck = new Trend('planning_poker_consensus_ack_ms', true);
const roomStateBytes = new Trend('planning_poker_room_state_bytes', true);
const roomStateEvents = new Counter('planning_poker_room_state_events');
const roomStateBytesTotal = new Counter('planning_poker_room_state_bytes_total');
const eventsSent = new Counter('planning_poker_socket_events_sent');
const sessionFailures = new Rate('planning_poker_session_failures');
const ackFailures = new Rate('planning_poker_ack_failures');

export const options = {
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    [`planning_poker_${scenario}`]: {
      executor: 'per-vu-iterations',
      vus: totalVus,
      iterations: 1,
      maxDuration: `${Math.ceil((arrivalWindowMs + sessionTimeoutMs + 10000) / 1000)}s`,
    },
  },
  thresholds: {
    checks: ['rate>0.99'],
    planning_poker_session_failures: ['rate<0.01'],
    planning_poker_ack_failures: ['rate<0.01'],
    planning_poker_socket_connect_ms: [`p(95)<${provisionalP95Ms}`],
    planning_poker_room_join_ack_ms: [`p(95)<${provisionalP95Ms}`],
    planning_poker_round_select_ack_ms: [`p(95)<${provisionalP95Ms}`],
  },
  tags: {
    protocol: 'socket.io',
    scenario,
    use_case: 'planning-poker',
  },
};

function ackBody(packet) {
  return Array.isArray(packet.data) ? packet.data[0] : null;
}

function createFixture(index) {
  const hostName = `host-${index}`;
  let created = null;
  let latestState = null;
  let storyAcked = false;
  let fixture = null;
  let failure = null;

  const maybeFinish = (socket) => {
    const story = latestState?.stories?.[0];
    if (created?.ok === true && storyAcked && story?.id) {
      fixture = {
        roomId: created.roomId,
        code: created.code,
        hostName,
        storyId: story.id,
      };
      socket.close();
    }
  };

  const response = ws.connect(
    socketUrl,
    { tags: { use_case: 'planning-poker', phase: 'fixture', room_index: String(index) } },
    (socket) => {
      socket.on('message', (raw) => {
        const packet = decodePacket(raw);
        if (packet.kind === 'engine-ping') {
          socket.send('3');
          return;
        }
        if (packet.kind === 'engine-open') {
          socket.send(encodeNamespaceConnect());
          return;
        }
        if (packet.kind === 'socket-connect') {
          socket.send(encodeEvent('room:create', { name: hostName }, 1));
          return;
        }
        if (packet.kind === 'socket-connect-error') {
          failure = `Socket.IO namespace connect failed: ${JSON.stringify(packet.payload)}`;
          socket.close();
          return;
        }
        if (packet.kind === 'event' && packet.event === 'room:state') {
          latestState = packet.payload;
          maybeFinish(socket);
          return;
        }
        if (packet.kind === 'ack' && packet.ackId === 1) {
          created = ackBody(packet);
          if (created?.ok !== true) {
            failure = `room:create failed: ${JSON.stringify(created)}`;
            socket.close();
            return;
          }
          socket.send(encodeEvent('story:add', {
            title: `Performance story ${index}`,
            description: 'Synthetic controlled-lab fixture',
            acceptanceCriteria: 'Created only for the benchmark execution',
          }, 2));
          return;
        }
        if (packet.kind === 'ack' && packet.ackId === 2) {
          const body = ackBody(packet);
          storyAcked = body?.ok === true;
          if (!storyAcked) {
            failure = `story:add failed: ${JSON.stringify(body)}`;
            socket.close();
            return;
          }
          maybeFinish(socket);
        }
      });

      socket.on('error', (error) => {
        failure = failure || `fixture websocket error: ${error.error()}`;
      });

      socket.setTimeout(() => {
        if (!fixture) failure = failure || `Timed out creating fixture ${index}`;
        socket.close();
      }, 8000);
    },
  );

  if (!response || response.status !== 101) {
    throw new Error(`Fixture ${index} websocket upgrade failed with status ${response?.status}`);
  }
  if (failure) throw new Error(failure);
  if (!fixture) throw new Error(`Fixture ${index} was not created.`);
  return fixture;
}

export function setup() {
  const fixtures = [];
  for (let index = 0; index < rooms; index += 1) fixtures.push(createFixture(index));
  return {
    fixtures,
    scenario,
    rooms,
    participantsPerRoom,
    totalVus,
    arrivalWindowMs,
  };
}

function metricForEvent(eventName) {
  if (eventName === 'room:join') return roomJoinAck;
  if (eventName === 'round:start') return roundStartAck;
  if (eventName === 'round:select') return roundSelectAck;
  if (eventName === 'round:consensus') return consensusAck;
  return null;
}

function runParticipant(fixture, positionInRoom) {
  const isHost = positionInRoom === 0;
  const name = isHost ? fixture.hostName : `participant-${fixture.roomId.slice(0, 8)}-${positionInRoom}`;
  const connectStartedAt = Date.now();
  let nextAckId = 10;
  const pending = new Map();
  let namespaceConnected = false;
  let joined = false;
  let startAcked = !isHost;
  let voteAcked = false;
  let consensusAcked = !isHost;
  let finalStateSeen = false;
  let roundStartScheduled = false;
  let voteScheduled = false;
  let consensusSent = false;
  let failure = null;

  const response = ws.connect(
    socketUrl,
    {
      tags: {
        use_case: 'planning-poker',
        phase: 'workload',
        scenario,
        room: fixture.code,
        role: isHost ? 'host' : 'participant',
      },
    },
    (socket) => {
      const sendWithAck = (eventName, payload) => {
        const ackId = nextAckId;
        nextAckId += 1;
        pending.set(ackId, { eventName, startedAt: Date.now() });
        eventsSent.add(1);
        socket.send(encodeEvent(eventName, payload, ackId));
      };

      socket.on('message', (raw) => {
        const packet = decodePacket(raw);

        if (packet.kind === 'engine-ping') {
          socket.send('3');
          return;
        }
        if (packet.kind === 'engine-open') {
          socket.send(encodeNamespaceConnect());
          return;
        }
        if (packet.kind === 'socket-connect-error') {
          failure = `Socket.IO namespace connect failed: ${JSON.stringify(packet.payload)}`;
          socket.close();
          return;
        }
        if (packet.kind === 'socket-connect') {
          namespaceConnected = true;
          socketConnect.add(Date.now() - connectStartedAt);
          sendWithAck('room:join', { code: fixture.code, name });
          return;
        }
        if (packet.kind === 'event' && packet.event === 'room:state') {
          const rawSize = String(raw).length;
          const state = packet.payload;
          roomStateEvents.add(1);
          roomStateBytes.add(rawSize);
          roomStateBytesTotal.add(rawSize);

          const story = state?.stories?.find((item) => item.id === fixture.storyId);
          if (story?.estimate !== null && story?.estimate !== undefined) {
            finalStateSeen = true;
            socket.setTimeout(() => socket.close(), 150);
            return;
          }

          if (isHost && joined && state?.round?.phase === 'revealed' && !consensusSent) {
            consensusSent = true;
            sendWithAck('round:consensus', { value: 5 });
          }
          return;
        }
        if (packet.kind !== 'ack') return;

        const pendingAck = pending.get(packet.ackId);
        if (!pendingAck) return;
        pending.delete(packet.ackId);
        const body = ackBody(packet);
        const ok = body?.ok === true;
        ackFailures.add(ok ? 0 : 1);
        const metric = metricForEvent(pendingAck.eventName);
        metric?.add(Date.now() - pendingAck.startedAt);

        if (!ok) {
          failure = `${pendingAck.eventName} failed: ${JSON.stringify(body)}`;
          socket.close();
          return;
        }

        if (pendingAck.eventName === 'room:join') {
          joined = true;
          if (isHost && !roundStartScheduled) {
            roundStartScheduled = true;
            socket.setTimeout(() => sendWithAck('round:start', { storyId: fixture.storyId }), roundStartDelayMs);
          }
          if (!voteScheduled) {
            voteScheduled = true;
            socket.setTimeout(() => sendWithAck('round:select', { value: 5 }), voteDelayMs);
          }
          return;
        }
        if (pendingAck.eventName === 'round:start') {
          startAcked = true;
          return;
        }
        if (pendingAck.eventName === 'round:select') {
          voteAcked = true;
          return;
        }
        if (pendingAck.eventName === 'round:consensus') {
          consensusAcked = true;
        }
      });

      socket.on('error', (error) => {
        const message = error.error();
        if (message !== 'websocket: close sent') failure = failure || `websocket error: ${message}`;
      });

      socket.setTimeout(() => {
        if (!finalStateSeen) failure = failure || 'Timed out before observing persisted consensus state';
        socket.close();
      }, sessionTimeoutMs);
    },
  );

  const transportOk = check(response, {
    'Socket.IO transport upgraded to WebSocket': (result) => result?.status === 101,
  });
  const businessOk = check(
    { namespaceConnected, joined, startAcked, voteAcked, consensusAcked, finalStateSeen, failure },
    {
      'participant joined its assigned room': (state) => state.joined === true,
      'participant submitted a valid estimate': (state) => state.voteAcked === true,
      'room reached persisted consensus': (state) => state.finalStateSeen === true,
      'Socket.IO session completed without protocol/business error': (state) => !state.failure,
      'host completed round orchestration': (state) => !isHost || (state.startAcked && state.consensusAcked),
    },
  );

  sessionFailures.add(transportOk && businessOk ? 0 : 1);
}

export default function (data) {
  const ordinal = __VU - 1;
  const roomIndex = Math.floor(ordinal / participantsPerRoom);
  const positionInRoom = ordinal % participantsPerRoom;
  const fixture = data.fixtures[roomIndex];
  if (!fixture) throw new Error(`No fixture for VU ${__VU}; roomIndex=${roomIndex}`);

  if (arrivalWindowMs > 0 && totalVus > 1) {
    const delayMs = Math.round((arrivalWindowMs * ordinal) / (totalVus - 1));
    sleep(delayMs / 1000);
  }

  runParticipant(fixture, positionInRoom);
}

export function handleSummary(data) {
  return summaryOutputs(data, {
    protocol: 'socket.io',
    scenario,
    target: baseUrl,
    useCase: 'planning-poker',
    rooms,
    participantsPerRoom,
    vus: totalVus,
    activeSockets: totalVus,
    arrivalWindowMs,
    workloadMeaning: '1 VU = 1 Planning Poker participant = 1 Socket.IO connection',
  });
}
