const assert = require('assert');
const release = { id: 7, version: 2, title: 'Saved views: your work, one click away',
  summary: 'Keep the filters and layout you use most in a named, personal view.',
  why_text: 'Switch between your daily queue, high-priority bugs and client work without rebuilding the same filters.',
  how_text: '1. Choose your task filters.\n2. Click Save current view beside Focus.\n3. Give the view a name and choose which settings to include.\n4. Select the saved view to restore your setup.\n\nViews stay in this browser after refresh and are personal to your account and organization.',
  performance_text: '', published_at: '2026-09-08T05:00:00Z', updated_at: '2026-09-08T06:00:00Z', is_read: 0 };

function response(path, method, admin) {
  if (path.endsWith('/updates/summary')) return { unread: 1, reports: 1, can_publish: admin };
  if (path.endsWith('/updates/reports/assignees')) return [{ id: 20, name: 'Navneet Kumar', role: 'admin' }, { id: 22, name: 'Demo Employee', role: 'member' }];
  if (path.endsWith('/updates/reports')) return method === 'POST' ? { id: 45 } : { data: [], total: 0 };
  if (path.endsWith('/updates')) return { data: [release], total: 1, can_publish: admin };
  return {};
}
async function check({ evaluate, screenshot, setAdmin, pause, send, origin }) {
  const click = text => evaluate(`(() => {
    const button = [...document.querySelectorAll('.updates-dialog button')].find(node => node.textContent.includes(${JSON.stringify(text)}));
    button?.click(); return Boolean(button);
  })()`);
  const waitFor = async expression => {
    for (let index = 0; index < 100; index++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw Error(`Updates preview timed out: ${expression}`);
  };
  assert(await evaluate(`(() => { const link = document.querySelector('.updates-trigger'); return link.tagName === 'A' && link.target === '_blank' && link.rel.includes('noopener') && link.pathname === '/updates'; })()`));
  await send('Page.navigate', { url: `${origin}/updates` });
  await waitFor(`Boolean(document.querySelector('.updates-card'))`);
  assert(await click('Read guide'));
  assert(await evaluate(`document.querySelector('.updates-dialog').textContent.includes('Publish update')`));
  await screenshot('greentask-updates-admin.png');
  assert(await evaluate(`Boolean(document.querySelector('.updates-full-page')) && !document.querySelector('[role="dialog"]') && Boolean(document.querySelector('.updates-day-heading'))`));
  setAdmin(false);
  await send('Page.navigate', { url: `${origin}/updates` });
  await waitFor(`Boolean(document.querySelector('.updates-card'))`);
  assert.equal(await evaluate(`document.querySelector('.updates-dialog').textContent.includes('Publish update')`), false);
  assert(await click('Report a problem'));
  await waitFor(`Boolean(document.querySelector('.updates-people button'))`);
  assert(await evaluate(`document.querySelector('.updates-form .updates-primary').disabled`));
  assert(await click('Navneet Kumar'));
  await evaluate(`(() => {
    const field = document.querySelector('.updates-form textarea');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, 'My saved filter did not restore. Please check the steps.');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot('greentask-updates-report.png');
  assert(await click('Create private bug task'));
  await waitFor(`Boolean(document.querySelector('.updates-notice')?.textContent.includes('REPORT-45'))`);
  await send('Page.navigate', { url: `${origin}/dashboard` });
  await waitFor(`Boolean(document.querySelector('.shell-sidebar-collapse-btn'))`);
  console.log('Updates preview: new-tab link, full page, date grouping, permissions and report submission passed (mock API).');
}
module.exports = { response, check };
