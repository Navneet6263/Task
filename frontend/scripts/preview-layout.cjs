// Isolated layout smoke check: synthetic account, mocked network, no live backend.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const express = require('../../backend/node_modules/express');
const WebSocket = require('../../backend/node_modules/ws');
const assert = require('assert');
const updatesPreview = require('./updates-preview.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const build = path.resolve(__dirname, '../build');
const output = path.resolve(__dirname, '../../output/branding');

(async () => {
  const app = express();
  app.use(express.static(build));
  app.get('*', (_, res) => res.sendFile(path.join(build, 'index.html')));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'greentask-layout-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  let previewAdmin = true;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let attempt = 0; !fs.existsSync(portFile) && attempt < 100; attempt++) await pause(100);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    let sequence = 0;
    const pending = new Map();
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      if (message.id && pending.has(message.id)) {
        const task = pending.get(message.id); pending.delete(message.id); clearTimeout(task.timer);
        if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result);
      }
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params;
        if (request.url.startsWith(`${origin}/`)) send('Fetch.continueRequest', { requestId }).catch(() => {});
        else {
          const url = new URL(request.url);
          let data = [];
          if (url.pathname.endsWith('/unread-count')) data = { unread: 0 };
          if (url.pathname.endsWith('/unread/counts')) data = {};
          if (url.pathname.endsWith('/org-access')) data = { organizations: [] };
          if (url.pathname.includes('/updates')) data = updatesPreview.response(url.pathname, request.method, previewAdmin);
          send('Fetch.fulfillRequest', { requestId, responseCode: 200,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/json' },
              { name: 'Access-Control-Allow-Origin', value: origin },
              { name: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type, x-org-id' },
              { name: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
            ],
            body: Buffer.from(JSON.stringify(data)).toString('base64'),
          }).catch(() => {});
        }
      }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      localStorage.setItem('token', 'isolated-layout-preview');
      localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Preview User', role: 'admin' }));
      localStorage.setItem('shell_sidebar_collapsed', 'false');
      window.WebSocket = class extends EventTarget {
        static CONNECTING = 0; static OPEN = 1; readyState = 3; close() {} send() {}
      };
    ` });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.value;
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${origin}/dashboard` });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`Boolean(document.querySelector('.shell-header-brand img')?.naturalWidth)`)) break;
      await pause(100);
    }
    await pause(300);
    const measure = () => evaluate(`(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, bottom: r.bottom }; };
      return { header: rect('.shell-header'), sidebar: rect('.shell-sidebar'), logo: rect('.shell-header-brand img'), logoSize: parseFloat(getComputedStyle(document.querySelector('.shell-header-brand img')).width), main: rect('.shell-main'), count: document.querySelectorAll('.greentask-brand').length, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth };
    })()`);
    const expanded = await measure();
    const divider = () => evaluate(`(() => {
      const header = document.querySelector('.shell-header');
      const style = getComputedStyle(header, '::after');
      const zoom = header.getBoundingClientRect().width / header.offsetWidth;
      return { content: style.content, x: parseFloat(style.left) * zoom,
        width: parseFloat(style.width) * zoom,
        searchX: document.querySelector('.shell-search').getBoundingClientRect().x };
    })()`);
    const expandedDivider = await divider();
    assert.equal(expandedDivider.content, '""');
    assert(Math.abs(expandedDivider.x + expandedDivider.width - expanded.sidebar.width) < 1);
    assert(expandedDivider.searchX > expanded.sidebar.width, 'Divider must not overlap search');
    console.log('Desktop layout:', JSON.stringify(expanded));
    assert.equal(expanded.header.x, 0); assert.equal(expanded.header.width, 1440);
    assert(Math.abs(expanded.logoSize - 56) < 0.1); assert.equal(expanded.count, 1);
    assert(Math.abs(expanded.sidebar.y - expanded.header.bottom) < 1);
    const screenshot = async name => {
      const result = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(output, name), Buffer.from(result.data, 'base64'));
    };
    await screenshot('greentask-header-expanded.png');
    await updatesPreview.check({ evaluate, screenshot, pause, send, origin, setAdmin: value => { previewAdmin = value; } });
    await evaluate(`document.querySelector('.shell-sidebar-collapse-btn').click()`); await pause(350);
    const collapsed = await measure();
    assert.equal((await divider()).content, 'none', 'Divider must disappear on collapse');
    assert.equal(collapsed.main.x, 0); assert.equal(collapsed.logo.x, expanded.logo.x);
    await screenshot('greentask-header-collapsed.png');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await pause(350);
    await evaluate(`document.querySelector('.shell-menu-btn').click()`); await pause(350);
    const mobile = await measure();
    assert.equal((await divider()).content, 'none', 'No desktop divider on mobile');
    assert(Math.abs(mobile.sidebar.y - mobile.header.bottom) < 1);
    assert.equal(mobile.sidebar.x, 0); assert.equal(mobile.count, 1);
    assert(mobile.pageWidth <= mobile.viewport);
    await screenshot('greentask-header-mobile.png');
    await send('Page.navigate', { url: `${origin}/updates` }); await pause(800);
    const modalFits = await evaluate(`(() => { const r = document.querySelector('.updates-dialog').getBoundingClientRect();
      return r.x >= 0 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; })()`);
    assert(modalFits, 'Updates page must fit the mobile viewport without horizontal scrolling');
    await screenshot('greentask-updates-mobile.png');
    console.log(JSON.stringify({ expanded, collapsed, mobile }, null, 2));
    await send('Browser.close');
  } finally {
    socket?.close(); chrome.kill(); server.close();
    // Keep the isolated OS temporary profile for automatic temporary-file cleanup.
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
