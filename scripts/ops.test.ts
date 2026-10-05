import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundedResponse, safeUrl, publishedUrl, address, reserve } from './ops-common.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { concatHex, keccak256, type Hex } from 'viem';
import { blockRoot } from './ops-merkle.js';

test('public upload endpoints reject credentials, insecure remote transport and zero wallet addresses', () => {
  assert.throws(() => safeUrl('https://user:secret@example.com/', 'endpoint'));
  assert.throws(() => safeUrl('http://example.com/', 'endpoint', true));
  assert.equal(safeUrl('http://127.0.0.1:8080/', 'endpoint', true).hostname, '127.0.0.1');
  assert.throws(() => address(`0x${'0'.repeat(40)}`, 'owner'));
  assert.throws(() => publishedUrl('https://example.com/mcp?token=private', 'published MCP'));
  assert.throws(() => publishedUrl('https://example.com/image#private', 'published image'));
  assert.equal(publishedUrl('https://example.com/mcp', 'published MCP').href, 'https://example.com/mcp');
});

test('untrusted pin/gateway responses enforce byte bounds and HTTP success', async () => {
  await assert.rejects(boundedResponse(new Response('abcdef'), 5), /size limit/);
  await assert.rejects(boundedResponse(new Response('secret provider body', { status: 403 })), /HTTP 403/);
  assert.equal(await boundedResponse(new Response('valid'), 5), 'valid');
  let canceled = false;
  const rejected = new Response(new ReadableStream({ cancel() { canceled = true; } }), { status: 429 });
  await assert.rejects(boundedResponse(rejected), /HTTP 429/);
  assert.equal(canceled, true);
});

test('deployment reservation cannot be overwritten by a competing invocation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aetheris-reservation-'));
  try {
    const file = join(directory, 'intent.json'); reserve(file, { deployer: 'first' });
    assert.throws(() => reserve(file, { deployer: 'second' }), { code: 'EEXIST' });
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).deployer, 'first');
  } finally { rmSync(directory, { recursive: true }); }
});

test('proof reconstructs the complete block including odd last leaves', () => {
  const a = `0x${'11'.repeat(32)}` as Hex; const b = `0x${'22'.repeat(32)}` as Hex; const c = `0x${'33'.repeat(32)}` as Hex;
  const ab = keccak256(concatHex([a, b])); const cc = keccak256(concatHex([c, c]));
  const expected = keccak256(concatHex(ab < cc ? [ab, cc] : [cc, ab]));
  assert.equal(blockRoot([a, b, c]), expected);
  assert.notEqual(blockRoot([a, b]), expected);
  assert.equal(blockRoot([a]), a);
  assert.throws(() => blockRoot([]));
});
