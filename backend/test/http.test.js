const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app } = require('../src/server');
const { parseDemoDepositAmount } = require('../src/services/ussdService');
const { validateMemberStatus } = require('../src/controllers/membersController');
const { isDemoDepositsEnabled } = require('../src/services/ussdService');

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

test('demo deposit amounts accept positive RWF values only', () => {
  assert.equal(parseDemoDepositAmount('10000'), 10000);
  assert.equal(parseDemoDepositAmount('10000.50'), 10000.5);
  assert.equal(parseDemoDepositAmount('0'), null);
  assert.equal(parseDemoDepositAmount('-100'), null);
  assert.equal(parseDemoDepositAmount('ten thousand'), null);
});

test('member status accepts only active or inactive', () => {
  assert.equal(validateMemberStatus('active'), true);
  assert.equal(validateMemberStatus('inactive'), true);
  assert.equal(validateMemberStatus('suspended'), false);
});

test('demo deposits require the Africa’s Talking sandbox account', () => {
  const previousFlag = process.env.USSD_DEMO_DEPOSITS;
  const previousUsername = process.env.AT_USERNAME;

  process.env.USSD_DEMO_DEPOSITS = 'true';
  process.env.AT_USERNAME = 'sandbox';
  assert.equal(isDemoDepositsEnabled(), true);

  process.env.AT_USERNAME = 'production-account';
  assert.equal(isDemoDepositsEnabled(), false);

  if (previousFlag === undefined) delete process.env.USSD_DEMO_DEPOSITS;
  else process.env.USSD_DEMO_DEPOSITS = previousFlag;
  if (previousUsername === undefined) delete process.env.AT_USERNAME;
  else process.env.AT_USERNAME = previousUsername;
});
