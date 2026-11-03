// Coordinate/routing/storage regression checks; no DOM server or real filesystem IO.
const { createRequire } = require('node:module');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '..');
const req = createRequire(path.join(appRoot, 'package.json'));
const esbuild = createRequire(req.resolve('vite'))('esbuild');
const code = String.raw`
import assert from 'node:assert/strict';
import { arrangeIcons, canPlaceIcons, shiftIcons, MAX_COORDINATE, defaultIconLayout } from './src/features/explorer/iconLayout';
import { parseIconLayouts, useIconLayouts } from './src/features/explorer/iconLayoutStore';
export function snapshot() { return useIconLayouts.getState().directories; }
export function run() {
 let count = 0;
 const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); count++; };
 const paths = ['E:/docs/a', 'E:/docs/b', 'E:/docs/c'];
 let points = arrangeIcons(paths, {}, 288);
 equal(points[paths[0]], { x: 16, y: 16 });
 equal(points[paths[1]], { x: 144, y: 16 });
 equal(points[paths[2]], { x: 16, y: 168 });
 let moved = shiftIcons(points, paths.slice(0, 2), -100, 30);
 equal(moved[paths[0]], { x: 0, y: 46 });
 equal(moved[paths[1]], { x: 128, y: 46 }, 'group spacing survives negative clamp');
 equal(moved[paths[2]], points[paths[2]], 'other items stay put');
 moved = shiftIcons({ a: { x: MAX_COORDINATE - 1, y: 10 }, b: { x: MAX_COORDINATE - 5, y: 20 } }, ['a','b'], 100, -50);
 equal(moved.a, { x: MAX_COORDINATE, y: 0 });
 equal(moved.b, { x: MAX_COORDINATE - 4, y: 10 });
 points = arrangeIcons(paths, { [paths[0]]: { x: 35, y: 30 } }, 288);
 equal(points[paths[0]], { x: 35, y: 30 }, 'saved position survives resize');
 equal(points[paths[1]].y >= 168, true, 'new icons avoid a freely positioned tile');
 equal(shiftIcons(points, [], 10, 10), points);
 const folder = { path: 'E:/docs/folder', isDirectory: true, isSymlink: false };
 equal(canPlaceIcons('left','left',undefined,paths), true);
 equal(canPlaceIcons('right','left',undefined,paths), false, 'cross-pane drop remains file transfer');
 equal(canPlaceIcons('left','left',folder,paths), false, 'unselected folder remains transfer target');
 equal(canPlaceIcons('left','left',folder,[folder.path]), true, 'own folder icon can be repositioned');
 equal(canPlaceIcons(undefined,'left',undefined,paths), false);
 const saved = { version: 1, directories: [{ path: 'E:/docs', layout: { mode: 'free', guides: true, positions: points } }] };
 equal(parseIconLayouts(saved), saved.directories);
 equal(parseIconLayouts({ ...saved, version: 3 }), null);
 equal(parseIconLayouts({ version: 1, directories: [{ path: '../bad', layout: defaultIconLayout }] }), null);
 equal(parseIconLayouts({ version: 1, directories: [{ path: 'E:/docs', layout: { ...defaultIconLayout, positions: { 'E:/docs/a': { x: NaN, y: 0 } } } }] }), null);
 equal(parseIconLayouts({ version: 1, directories: [{ path: 'E:/docs', layout: { ...defaultIconLayout, positions: { 'E:/docs/a': { x: -1, y: 0 } } } }] }), null);
 useIconLayouts.getState().update('E:/docs', { mode: 'free', guides: true, positions: points });
 useIconLayouts.getState().update('e:\\docs\\', { guides: false });
 equal(snapshot().length, 1, 'same directory shares settings across panes');
 equal(snapshot()[0].layout.positions, points, 'guide toggle keeps custom positions');
 equal(JSON.parse(window.localStorage.getItem('lanshan.icon-layouts.v1')).directories, snapshot());
 useIconLayouts.getState().update('E:/other', { mode: 'free' });
 equal(snapshot().length, 2, 'directories remain independent');
 useIconLayouts.getState().update('E:/docs', { positions: {} });
 equal(snapshot().find((item) => item.path === 'E:/docs').layout.positions, {});
 console.log('Icon layout: ' + count + ' coordinate, routing and storage assertions passed.');
}
`;
async function main() {
  const result = await esbuild.build({ stdin: { contents: code, loader: 'ts', resolveDir: appRoot }, bundle: true, platform: 'node', format: 'cjs', write: false, logLevel: 'silent' });
  const memory = new Map();
  globalThis.window = { localStorage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) } };
  const compiled = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(req, compiled, compiled.exports);
  compiled.exports.run();
  const reloaded = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(req, reloaded, reloaded.exports);
  require('node:assert/strict').deepEqual(reloaded.exports.snapshot(), compiled.exports.snapshot());
  console.log('Icon layout: module reload restored all saved modes, guide settings and positions.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
