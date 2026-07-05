const crypto = require('node:crypto');

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeIpAddress(value) {
  const text = normalizeText(value, 128);
  const firstAddress = text.split(',')[0].trim();
  const mappedIpv4 = firstAddress.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  return mappedIpv4 ? mappedIpv4[1] : firstAddress;
}

function createUsageTracker({
  now = Date.now,
  makeId = () => crypto.randomUUID(),
  clientTtlMs = 2 * 60 * 1000
} = {}) {
  const connections = new Map();
  const softwareClients = new Map();

  function registerConnection({ path = '', ip = '', userAgent = '' } = {}) {
    const connectionId = makeId();
    const timestamp = now();
    connections.set(connectionId, {
      connectionId,
      path: normalizeText(path, 128),
      ip: normalizeIpAddress(ip),
      userAgent: normalizeText(userAgent, 512),
      connectedAt: timestamp,
      lastSeenAt: timestamp,
      roomCode: null,
      userId: null,
      nickname: null,
      deviceId: null,
      deviceLabel: null,
      appVersion: null,
      platform: null
    });
    return { connectionId };
  }

  function updateConnection(connectionId, patch = {}) {
    const connection = connections.get(connectionId);
    if (!connection) return false;

    Object.assign(connection, {
      roomCode: patch.roomCode ? normalizeText(patch.roomCode, 16) : connection.roomCode,
      userId: patch.userId ? normalizeText(patch.userId, 64) : connection.userId,
      nickname: patch.nickname ? normalizeText(patch.nickname, 32) : connection.nickname,
      deviceId: patch.deviceId ? normalizeText(patch.deviceId, 128) : connection.deviceId,
      deviceLabel: patch.deviceLabel ? normalizeText(patch.deviceLabel, 128) : connection.deviceLabel,
      appVersion: patch.appVersion ? normalizeText(patch.appVersion, 32) : connection.appVersion,
      platform: patch.platform ? normalizeText(patch.platform, 32) : connection.platform,
      lastSeenAt: now()
    });
    return true;
  }

  function markSeen(connectionId) {
    const connection = connections.get(connectionId);
    if (!connection) return false;
    connection.lastSeenAt = now();
    return true;
  }

  function removeConnection(connectionId) {
    connections.delete(connectionId);
  }

  function reportClientOnline({
    path = '/client/online',
    ip = '',
    userAgent = '',
    roomCode = '',
    userId = '',
    nickname = '',
    deviceId = '',
    deviceLabel = '',
    appVersion = '',
    platform = ''
  } = {}) {
    const normalizedDeviceId = normalizeText(deviceId, 128);
    if (!normalizedDeviceId) return false;

    const timestamp = now();
    const existing = softwareClients.get(normalizedDeviceId);
    softwareClients.set(normalizedDeviceId, {
      connectionId: existing?.connectionId || `client:${normalizedDeviceId}`,
      path: normalizeText(path, 128),
      ip: normalizeIpAddress(ip),
      userAgent: normalizeText(userAgent, 512),
      connectedAt: existing?.connectedAt || timestamp,
      lastSeenAt: timestamp,
      roomCode: roomCode ? normalizeText(roomCode, 16) : existing?.roomCode || null,
      userId: userId ? normalizeText(userId, 64) : existing?.userId || null,
      nickname: nickname ? normalizeText(nickname, 32) : existing?.nickname || null,
      deviceId: normalizedDeviceId,
      deviceLabel: deviceLabel ? normalizeText(deviceLabel, 128) : existing?.deviceLabel || null,
      appVersion: appVersion ? normalizeText(appVersion, 32) : existing?.appVersion || null,
      platform: platform ? normalizeText(platform, 32) : existing?.platform || null
    });
    return true;
  }

  function snapshot({ getLicenseStatusForDevice = () => 'unlicensed' } = {}) {
    const timestamp = now();
    const activeClients = Array.from(softwareClients.values())
      .filter((client) => timestamp - Number(client.lastSeenAt || 0) <= clientTtlMs);
    const rows = activeClients.map((connection) => ({
      ...connection,
      licenseStatus: connection.deviceId
        ? getLicenseStatusForDevice(connection.deviceId)
        : 'unknown'
    }));
    const deviceIds = new Set(rows.map((row) => row.deviceId).filter(Boolean));
    const authorizedDeviceIds = new Set(
      rows
        .filter((row) => row.deviceId && row.licenseStatus === 'active')
        .map((row) => row.deviceId)
    );

    return {
      metrics: {
        onlineConnections: rows.length,
        onlineDevices: deviceIds.size,
        authorizedOnlineDevices: authorizedDeviceIds.size,
        unauthorizedOnlineDevices: Math.max(0, deviceIds.size - authorizedDeviceIds.size)
      },
      connections: rows
    };
  }

  return {
    registerConnection,
    updateConnection,
    markSeen,
    removeConnection,
    reportClientOnline,
    snapshot
  };
}

module.exports = {
  createUsageTracker
};
