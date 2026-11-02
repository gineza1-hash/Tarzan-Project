const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');

test('health endpoint reports the API is available', async () => {
  const response = await request(app).get('/health');

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'ok');
});

test('protected endpoint rejects requests without authentication', async () => {
  const response = await request(app).get('/api/reports/dashboard');

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'Authentication required.');
});

test('USSD endpoint validates required callback fields', async () => {
  const response = await request(app)
    .post('/ussd')
    .type('form')
    .send({ text: '' });

  assert.equal(response.statusCode, 400);
  assert.match(response.text, /^END Invalid request\.$/);
});
