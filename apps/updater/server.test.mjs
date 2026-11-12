// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.UPDATER_TOKEN = 'token-de-teste-com-mais-de-16';
process.env.INSTALL_DIR = '/caminho/que/nao/existe';
const { createServer, isVersion, readVersion, withVersion } = await import('./server.mjs');

test('só aceita versões no formato X.Y.Z', () => {
  assert.equal(isVersion('1.2.3'), true);
  for (const bad of ['1.2', 'v1.2.3', '1.2.3; rm -rf /', '', null, 123, '1.2.3-beta', 'latest']) assert.equal(isVersion(bad), false);
});

test('lê e troca a versão no .env sem tocar no resto', () => {
  const env = 'DOMAIN=office.exemplo.com\nOFFICE_IMP_VERSION=1.0.0\nAPP_SECRET=abc\n';
  assert.equal(readVersion(env), '1.0.0');
  const next = withVersion(env, '1.1.0');
  assert.equal(next, 'DOMAIN=office.exemplo.com\nOFFICE_IMP_VERSION=1.1.0\nAPP_SECRET=abc\n');
  assert.equal(readVersion(withVersion('A=1', '2.0.0')), '2.0.0');
});

test('exige o token e recusa versão inválida', async () => {
  const server = createServer().listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/status`)).status, 401);
    assert.equal((await fetch(`${base}/status`, { headers: { authorization: 'Bearer errado' } })).status, 401);
    const auth = { authorization: `Bearer ${process.env.UPDATER_TOKEN}`, 'content-type': 'application/json' };
    const st = await fetch(`${base}/status`, { headers: auth });
    assert.equal(st.status, 200);
    assert.equal((await st.json()).state, 'idle');
    assert.equal((await fetch(`${base}/update`, { method: 'POST', headers: auth, body: JSON.stringify({ version: 'latest; reboot' }) })).status, 400);
    // instalação inexistente: recusa sem executar nada
    assert.equal((await fetch(`${base}/update`, { method: 'POST', headers: auth, body: JSON.stringify({ version: '1.2.3' }) })).status, 500);
  } finally {
    server.close();
  }
});
