const assert = require('node:assert/strict');
const test = require('node:test');

const { createUsageTracker } = require('../../server/usageTracker');

test('usage tracker counts connections and unique devices', () => {
  let nextId = 0;
  const tracker = createUsageTracker({ now: () => 1000, makeId: () => `connection-${++nextId}` });

  const first = tracker.registerConnection({
    path: '/room',
    ip: '127.0.0.1',
    userAgent: 'DesktopCat/0.3.8'
  });
  const second = tracker.registerConnection({
    path: '/room',
    ip: '127.0.0.2',
    userAgent: 'DesktopCat/0.3.8'
  });

  tracker.updateConnection(first.connectionId, {
    roomCode: '123456',
    userId: 'alice',
    nickname: 'Alice',
    deviceId: 'device-1',
    deviceLabel: 'Office PC',
    appVersion: '0.3.8',
    platform: 'win32'
  });
  tracker.updateConnection(second.connectionId, {
    roomCode: '654321',
    userId: 'alice-copy',
    nickname: 'Alice',
    deviceId: 'device-1',
    appVersion: '0.3.8',
    platform: 'win32'
  });

  const snapshot = tracker.snapshot({
    getLicenseStatusForDevice: (deviceId) => deviceId === 'device-1' ? 'active' : 'unlicensed'
  });

  assert.equal(snapshot.metrics.onlineConnections, 2);
  assert.equal(snapshot.metrics.onlineDevices, 1);
  assert.equal(snapshot.metrics.authorizedOnlineDevices, 1);
  assert.equal(snapshot.metrics.unauthorizedOnlineDevices, 0);
  assert.equal(snapshot.connections[0].licenseStatus, 'active');
});

test('usage tracker removes connections and updates lastSeenAt', () => {
  let timestamp = 1000;
  const tracker = createUsageTracker({ now: () => timestamp });
  const { connectionId } = tracker.registerConnection({ path: '/room', ip: '127.0.0.1' });

  timestamp = 2000;
  tracker.markSeen(connectionId);
  assert.equal(tracker.snapshot().connections[0].lastSeenAt, 2000);

  tracker.removeConnection(connectionId);
  assert.equal(tracker.snapshot().metrics.onlineConnections, 0);
});
