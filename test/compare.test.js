const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pkg = require('../package.json');
const { compareFolders, sameBytes } = require('../dist/compare.js');

suite('Compare Folders (Unit)', () => {
  let tmp, A, B;
  const put = (root, rel, text) => {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, text);
  };
  setup(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-'));
    A = path.join(tmp, 'a');
    B = path.join(tmp, 'b');
    fs.mkdirSync(A);
    fs.mkdirSync(B);
  });
  teardown(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test('gleiche Ordner: nichts verschieden, alles gezaehlt', async () => {
    put(A, 'x.txt', 'hallo');
    put(B, 'x.txt', 'hallo');
    put(A, 'sub/y.txt', 'welt');
    put(B, 'sub/y.txt', 'welt');
    const r = await compareFolders(A, B);
    assert.deepStrictEqual([r.onlyA, r.onlyB, r.different, r.unreadable], [[], [], [], []]);
    assert.strictEqual(r.same, 2);
  });

  test('nur auf einer Seite, auch ganze Unterordner', async () => {
    put(A, 'nur-a.txt', '1');
    put(A, 'ordner/tief/a.txt', '2');
    put(B, 'nur-b.txt', '3');
    const r = await compareFolders(A, B);
    assert.deepStrictEqual(r.onlyA, ['nur-a.txt', 'ordner/tief/a.txt']);
    assert.deepStrictEqual(r.onlyB, ['nur-b.txt']);
  });

  test('gleiche Groesse, anderer Inhalt wird gefunden', async () => {
    put(A, 'f.txt', 'abcde');
    put(B, 'f.txt', 'abcdX');
    put(A, 'g.txt', 'abc');
    put(B, 'g.txt', 'abcd');
    const r = await compareFolders(A, B);
    assert.deepStrictEqual(r.different, ['f.txt', 'g.txt']);
    assert.strictEqual(r.same, 0);
  });

  test('Unterschied weit hinten in einer grossen Datei', async () => {
    const big = Buffer.alloc(200000, 7);
    const big2 = Buffer.from(big);
    big2[199999] = 8;
    fs.writeFileSync(path.join(A, 'big.bin'), big);
    fs.writeFileSync(path.join(B, 'big.bin'), big2);
    assert.strictEqual(await sameBytes(path.join(A, 'big.bin'), path.join(B, 'big.bin')), false);
    fs.writeFileSync(path.join(B, 'big.bin'), big);
    assert.strictEqual(await sameBytes(path.join(A, 'big.bin'), path.join(B, 'big.bin')), true);
  });

  test('Datei auf der einen, Ordner auf der anderen Seite = verschieden', async () => {
    put(A, 'x', 'datei');
    put(B, 'x/inner.txt', 'ordner');
    const r = await compareFolders(A, B);
    assert.deepStrictEqual(r.different, ['x']);
    assert.deepStrictEqual(r.onlyB, []);
  });

  test('.git und node_modules werden ignoriert', async () => {
    put(A, '.git/config', 'a');
    put(B, 'node_modules/p/i.js', 'b');
    put(A, 'same.txt', 'x');
    put(B, 'same.txt', 'x');
    const r = await compareFolders(A, B);
    assert.deepStrictEqual([r.onlyA, r.onlyB, r.different], [[], [], []]);
    assert.strictEqual(r.same, 1);
  });

  test('Befehl ist in package.json eingetragen', () => {
    assert.ok(pkg.contributes.commands.some((c) => c.command === 'compareFolders.compare'));
  });
});
