const crypto = require('node:crypto');

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function createUsageTracker({ now = Date.now, makeId = () => crypto.randomUUID() } = {}) {
  const connections = new Map();

  function registerConnection({ path = '', ip = '', userAgent = '' } = {}) {
    const connectionId = makeId();
    const timestamp = now();
    connections.set(connectionId, {
      connectionId,
      path: normalizeText(path, 128),
      ip: normalizeText(ip, 128),
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

  function snapshot({ getLicenseStatusForDevice = () => 'unlicensed' } = {}) {
    const rows = Array.from(connections.values()).map((connection) => ({
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
    snapshot
  };
}

module.exports = {
  createUsageTracker
};
