const assert = require('node:assert/strict');
const test = require('node:test');

const { createUsageTracker } = require('../../server/usageTracker');

test('usage tracker counts active software clients by device heartbeat', () => {
  let nextId = 0;
  const tracker = createUsageTracker({ now: () => 1000, makeId: () => `connection-${++nextId}` });

  tracker.reportClientOnline({
    roomCode: '123456',
    userId: 'alice',
    nickname: 'Alice',
    deviceId: 'device-1',
    deviceLabel: 'Office PC',
    appVersion: '0.3.8',
    platform: 'win32',
    ip: '127.0.0.1',
    userAgent: 'DesktopCat/0.3.8'
  });
  tracker.reportClientOnline({
    roomCode: '654321',
    userId: 'alice-copy',
    nickname: 'Alice',
    deviceId: 'device-1',
    appVersion: '0.3.8',
    platform: 'win32',
    ip: '127.0.0.2',
    userAgent: 'DesktopCat/0.3.8'
  });

  const snapshot = tracker.snapshot({
    getLicenseStatusForDevice: (deviceId) => deviceId === 'device-1' ? 'active' : 'unlicensed'
  });

  assert.equal(snapshot.metrics.onlineConnections, 1);
  assert.equal(snapshot.metrics.onlineDevices, 1);
  assert.equal(snapshot.metrics.authorizedOnlineDevices, 1);
  assert.equal(snapshot.metrics.unauthorizedOnlineDevices, 0);
  assert.equal(snapshot.connections[0].licenseStatus, 'active');
  assert.equal(snapshot.connections[0].ip, '127.0.0.2');
  assert.equal(snapshot.connections[0].roomCode, '654321');
});

test('usage tracker normalizes IPv4-mapped IPv6 addresses for display', () => {
  const tracker = createUsageTracker({ now: () => 1000, makeId: () => 'connection-1' });

  tracker.reportClientOnline({
    path: '/room',
    ip: '::ffff:203.0.113.9',
    userAgent: 'DesktopCat/0.3.8',
    deviceId: 'device-1'
  });

  assert.equal(tracker.snapshot().connections[0].ip, '203.0.113.9');
});

test('usage tracker expires software clients after heartbeat timeout', () => {
  let timestamp = 1000;
  const tracker = createUsageTracker({ now: () => timestamp, clientTtlMs: 5000 });

  tracker.reportClientOnline({
    deviceId: 'device-1',
    ip: '127.0.0.1'
  });

  timestamp = 5500;
  assert.equal(tracker.snapshot().metrics.onlineConnections, 1);

  timestamp = 7000;
  assert.equal(tracker.snapshot().metrics.onlineConnections, 0);
});
