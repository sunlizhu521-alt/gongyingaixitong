import test from 'node:test';
import assert from 'node:assert/strict';
import { requestAuthSource } from '../server/request-auth.js';

test('reads authenticated GET session fields from request headers', () => {
  const headers = {
    'x-user-id': 'user-1',
    'x-session-token': 'session-1',
    'x-device-id': 'device-1'
  };
  const source = requestAuthSource({
    query: {},
    body: undefined,
    get: (name) => headers[name] || ''
  });

  assert.equal(source.userId, 'user-1');
  assert.equal(source.sessionToken, 'session-1');
  assert.equal(source.deviceId, 'device-1');
});

test('keeps request body credentials ahead of headers for existing POST clients', () => {
  const source = requestAuthSource({
    query: { userId: 'query-user' },
    body: {
      user: 'existing-user',
      userId: 'body-user',
      sessionToken: 'body-token',
      deviceId: 'body-device'
    },
    get: () => 'header-value'
  });

  assert.equal(source.user, 'existing-user');
  assert.equal(source.userId, 'body-user');
  assert.equal(source.sessionToken, 'body-token');
  assert.equal(source.deviceId, 'body-device');
});
