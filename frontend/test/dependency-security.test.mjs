import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const store = fileURLToPath(new URL('../node_modules/.pnpm/', import.meta.url));
const require = createRequire(import.meta.url);
function patchedPackage(name, version, entry = '') {
  // pnpm shortens long virtual-store directory names on Windows.
  const folder = readdirSync(store).find(value => value.startsWith(`${name}@${version}_patch_`));
  assert.ok(folder, `The committed ${name} security patch must be installed.`);
  return path.join(store, folder, 'node_modules', name, entry);
}

test('brace parsers and AST walkers bound hostile nesting while preserving ordinary glob behavior', () => {
  const braces = require(patchedPackage('braces', '3.0.3'));
  assert.deepEqual(braces.expand('src/{app,lib}/{a,b}.ts'), ['src/app/a.ts', 'src/app/b.ts', 'src/lib/a.ts', 'src/lib/b.ts']);
  assert.equal(braces.compile('src/{app,lib}/*.ts'), 'src/(app|lib)/*.ts');
  for (const pattern of ['{'.repeat(4000) + 'x' + '}'.repeat(4000), '('.repeat(4000) + 'x' + ')'.repeat(4000), '{'.repeat(4000)]) {
    for (const method of ['parse', 'compile', 'expand', 'stringify']) assert.throws(() => braces[method](pattern), /safe depth limit/);
  }
  // Direct AST callers also get a bound; they do not pass through the string parser.
  for (const method of ['compile', 'expand', 'stringify']) {
    let node = { type: 'text', value: 'x' };
    for (let index = 0; index < 5000; index++) node = { type: 'root', nodes: [node] };
    assert.throws(() => braces[method](node), /safe depth limit/);
  }
});

test('bigint conversion never loads native bindings and preserves exact endian values', () => {
  const filename = patchedPackage('bigint-buffer', '1.1.5');
  const script = `
    const assert = require('node:assert/strict');
    const Module = require('node:module');
    const original = Module._load;
    let nativeLoads = 0;
    Module._load = function(name, ...args) {
      if (name === 'bindings') { nativeLoads++; throw new Error('Native addon must not load'); }
      return original.call(this, name, ...args);
    };
    const converter = require(process.argv[1]);
    const input = Buffer.from([0x12, 0xab]);
    assert.equal(converter.toBigIntLE(input), 0xab12n);
    assert.equal(converter.toBigIntBE(input), 0x12abn);
    assert.deepEqual(converter.toBufferLE(0xab12n, 2), input);
    assert.deepEqual(converter.toBufferBE(0x12abn, 2), input);
    assert.deepEqual(input, Buffer.from([0x12, 0xab]));
    assert.equal(converter.toBigIntLE(Buffer.alloc(0)), 0n);
    const large = Buffer.alloc(4096, 0xff);
    assert.equal(converter.toBigIntLE(large), (1n << 32768n) - 1n);
    assert.equal(nativeLoads, 0);
  `;
  const result = spawnSync(process.execPath, ['-e', script, filename], { encoding: 'utf8', timeout: 6000 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
});

test('stream filters reject pathological nesting through their error channel and process normal documents', async () => {
  const directory = patchedPackage('stream-json', '1.9.1');
  const { parser } = require(directory);
  const StreamValues = require(path.join(directory, 'streamers/StreamValues'));
  const Pick = require(path.join(directory, 'filters/Pick'));
  const values = [];
  await pipeline(Readable.from(['{"safe":{"value":7},"other":9}']), parser(), new Pick({ filter: 'safe' }), StreamValues.streamValues(),
    new Writable({ objectMode: true, write(value, _encoding, callback) { values.push(value.value); callback(); } }));
  assert.deepEqual(values, [{ value: 7 }]);
  for (const name of ['Pick', 'Ignore', 'Filter', 'Replace']) {
    const Filter = require(path.join(directory, 'filters', name));
    await assert.rejects(pipeline(Readable.from(['['.repeat(2000) + '0' + ']'.repeat(2000)]), parser(), new Filter({ filter: 'missing' }),
      new Writable({ objectMode: true, write(_value, _encoding, callback) { callback(); } })), /safe depth limit/);
  }
});
