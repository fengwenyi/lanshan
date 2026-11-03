// Isolated regression checks. All queue IO is mocked; no user files are changed.
const { createRequire } = require('node:module');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '..');
const req = createRequire(path.join(appRoot, 'package.json'));
const esbuild = createRequire(req.resolve('vite'))('esbuild');
const code = String.raw`
import assert from 'node:assert/strict';
import { emptyFilters, matchesSearch } from './src/features/explorer/search';
import { useQueue } from './src/features/explorer/queue';
export async function run() {
 const now = 1800000000000;
 const file = { name: '季度 报告.PDF', path: 'E:/docs/季度 报告.PDF', extension: 'PDF', size: 100 * 1024 ** 2, modified: now / 1000, isDirectory: false, isSymlink: false };
 assert.equal(matchesSearch(file, '季度 报告', emptyFilters, now), true);
 assert.equal(matchesSearch(file, '季度 预算', emptyFilters, now), false);
 assert.equal(matchesSearch(file, '', { ...emptyFilters, extension: '.pdf，docx', kind: 'pdf', size: 'large', modified: '7' }, now), true);
 assert.equal(matchesSearch({ ...file, modified: now / 1000 - 8 * 86400 }, '', { ...emptyFilters, modified: '7' }, now), false);
 assert.equal(matchesSearch({ ...file, isDirectory: true }, '', { ...emptyFilters, size: 'large' }, now), false);
 assert.equal(matchesSearch(file, '', { ...emptyFilters, kind: 'image' }, now), false);
 assert.equal(matchesSearch(file, '', { ...emptyFilters, extension: 'docx' }, now), false);
 globalThis.window = new EventTarget();
 const tick = () => new Promise((resolve) => setImmediate(resolve));
 const drain = async () => { for (let n = 0; n < 100; n++) { await tick(); if (!useQueue.getState().jobs.some((j) => ['waiting','running'].includes(j.status))) return; } throw new Error('queue did not settle'); };
 const reset = () => useQueue.setState({ jobs: [], paused: false, open: false });
 const folder = { action: 'createFolder', source: 'E:/docs', name: 'PDF' };
 const move = { action: 'move', source: file.path, destination: 'E:\\docs\\PDF' };
 const independent = { action: 'move', source: 'E:/docs/another.txt', destination: 'E:/existing' };
 let calls = [];
 globalThis.__queueTestRun = async (request) => { calls.push(request); if (request.action === 'createFolder') throw new Error('cannot create'); };
 reset(); useQueue.getState().enqueue([folder, move, independent]); await drain();
 assert.deepEqual(useQueue.getState().jobs.map((j) => j.status), ['failed','skipped','done']);
 assert.equal(calls.length, 2);
 reset(); useQueue.getState().togglePause(); useQueue.getState().enqueue([folder, move]);
 useQueue.getState().cancel(useQueue.getState().jobs[0].id); useQueue.getState().togglePause(); await drain();
 assert.deepEqual(useQueue.getState().jobs.map((j) => j.status), ['cancelled','skipped']);
 let release;
 globalThis.__queueTestRun = (request) => request.action === 'move' ? new Promise((resolve) => { release = resolve; }) : Promise.resolve();
 reset(); useQueue.getState().enqueue([folder, move]); await tick();
 useQueue.getState().clearFinished();
 assert.equal(useQueue.getState().jobs.length, 2, 'creation must stay while dependent move is active');
 release(); await drain();
 assert.deepEqual(useQueue.getState().jobs.map((j) => j.status), ['done','done']);
 useQueue.getState().clearFinished(); assert.equal(useQueue.getState().jobs.length, 0);
 delete globalThis.__queueTestRun;
 console.log('Search and organize queue: 13 assertions passed; all filesystem IO mocked.');
}
`;
async function main() {
  const result = await esbuild.build({ stdin: { contents: code, loader: 'ts', resolveDir: appRoot }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent', plugins: [{ name: 'mock-files', setup(build) {
    build.onResolve({ filter: /^\.\/api$/ }, () => ({ path: 'mock-api', namespace: 'mock' }));
    build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: String.raw`
      export const files = { run: (...args) => globalThis.__queueTestRun(...args), cancel: async () => {} };
      export const normalizedPath = (value) => value.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
      export const pathLabel = (value) => value.split(/[\\/]/).pop();
      export const errorCode = () => '';
      export const errorMessage = (error) => error.message;
    ` }));
  } }] });
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(req, compiled, compiled.exports);
  await compiled.exports.run();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
