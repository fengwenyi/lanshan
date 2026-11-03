// Focused SSR regression checks; no browser/server or user files are accessed.
const { createRequire } = require('node:module');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '..');
const req = createRequire(path.join(appRoot, 'package.json'));
const esbuild = createRequire(req.resolve('vite'))('esbuild');
const fixture = '# 览山\n\n**加粗**与~~删除~~\n\n- [x] 完成\n\n| 名称 | 状态 |\n| --- | --- |\n| 原文 | 可读 |\n\n> 引用\n\n~~~ts\nconst value = 1;\n~~~\n\n[网页](https://example.com)\n\n[危险](javascript:alert(1))\n\n<script>alert(1)</script>\n\n![外部图片](https://example.com/tracker.png)';
const code = `
import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MarkdownPreview } from './src/features/explorer/MarkdownPreview.tsx';
const text = ${JSON.stringify(fixture)};
const entry = { name: 'README.md', path: 'E:/docs/README.md', extension: 'md', size: text.length, modified: 1, isDirectory: false, isSymlink: false };
const data = { kind: 'text', path: null, text, encoding: 'UTF-8', size: text.length, truncated: false };
const client = new QueryClient();
try {
 const html = renderToStaticMarkup(<QueryClientProvider client={client}><MarkdownPreview entry={entry} data={data} expanded /></QueryClientProvider>);
 assert.match(html, /<h1[^>]*>览山<\\/h1>/);
 assert.match(html, /<table>/);
 assert.match(html, /class="task-list-item"/);
 assert.match(html, /<del>删除<\\/del>/);
 assert.match(html, /markdown-code-block/);
 assert.match(html, /Markdown 原文/);
 assert.doesNotMatch(html, /<script[\\s>]/i);
 assert.doesNotMatch(html, /href="javascript:/i);
 assert.doesNotMatch(html, /<img[^>]*src="https:/i);
 console.log('Markdown SSR: 9 assertions passed.');
} finally { client.clear(); }
`;
const result = esbuild.buildSync({ stdin: { contents: code, loader: 'tsx', resolveDir: appRoot }, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false, logLevel: 'silent' });
const compiled = { exports: {} };
new Function('require', 'module', 'exports', result.outputFiles[0].text)(req, compiled, compiled.exports);
