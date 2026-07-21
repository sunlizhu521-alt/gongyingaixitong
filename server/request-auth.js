export function requestAuthSource(req) {
  const query = req?.query || {};
  const body = req?.body || {};
  const getHeader = typeof req?.get === 'function' ? (name) => req.get(name) : () => '';

  return {
    ...query,
    ...body,
    userId: body.userId || query.userId || getHeader('x-user-id'),
    sessionToken: body.sessionToken || body.token || query.sessionToken || query.token || getHeader('x-session-token'),
    deviceId: body.deviceId || query.deviceId || getHeader('x-device-id')
  };
}
