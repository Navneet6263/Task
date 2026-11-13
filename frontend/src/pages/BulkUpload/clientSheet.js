// Understands a client list the way a careful person would: finds the names column, skips the
// heading and blank lines, works out which agent each tab belongs to, and points out names that
// are already in the list or look like the same client typed twice. Pure functions only.

const key = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const NAME_HEADS = ['clientname', 'client', 'clients', 'nameofclient', 'customername', 'customer', 'companyname', 'company', 'businessname', 'name'];
const isAgentHead = (cell) => /^(agent|agentname|agentfirm|firm|accountant|accountants)/.test(key(cell));
const EXAMPLE = /^example\b/i;
const HELP_TABS = /^(how to fill|lists?|read ?me|instructions?)$/i;

// Edit distance, stopping early once it passes `max`.
export function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(prev[j] + 1, next[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (next[j] < best) best = next[j];
    }
    if (best > max) return max + 1;
    prev = next;
  }
  return prev[b.length];
}

// "Carters Cafe Ltd" and "Carters Cafe Limited" are the same client.
export const nameKey = (name) => key(String(name ?? '').toLowerCase().replace(/&/g, ' and ').replace(/\b(limited|ltd|llp|plc|uk)\b/g, ' '));
const nameWords = (name) => String(name ?? '').toLowerCase().replace(/&/g, ' and ').replace(/\b(limited|ltd|llp|plc|uk)\b/g, ' ').split(/[^a-z0-9]+/).filter(Boolean);
// A likely typo: the same words in the same order, with one long word off by a letter
// ("Kent Metal" / "Kent Metals"). Short words must match exactly, so "Cs Logistics" and "Y Logistics" stay apart.
const alike = (a, b) => a.length > 0 && a.length === b.length
  && a.every((word, i) => word === b[i] || (Math.min(word.length, b[i].length) >= 5 && distance(word, b[i], 1) <= 1));

// One tab → [{ name, agent }] plus the heading it was read from.
export function readClientTab(rows) {
  let column = -1;
  let agentColumn = -1;
  let start = 0;
  for (let h = 0; h < Math.min(10, rows.length); h += 1) {
    const found = (rows[h] || []).findIndex((cell) => NAME_HEADS.includes(key(cell)));
    if (found >= 0) { column = found; agentColumn = rows[h].findIndex((cell, i) => i !== found && isAgentHead(cell)); start = h + 1; break; }
  }
  if (column < 0) {
    // No heading: the names are in the column with the most text.
    const counts = [];
    rows.forEach((row) => row.forEach((cell, i) => { if (/[a-z]/i.test(cell)) counts[i] = (counts[i] || 0) + 1; }));
    column = counts.reduce((best, n, i) => ((n || 0) > (counts[best] || 0) ? i : best), 0);
  }
  const seen = new Set();
  const items = [];
  let repeated = 0;
  rows.slice(start).forEach((row) => {
    const name = clean(row?.[column]).slice(0, 255);
    if (!name || !/[a-z0-9]/i.test(name) || row.some((cell) => EXAMPLE.test(cell))) return;
    if (seen.has(name.toLowerCase())) { repeated += 1; return; }
    seen.add(name.toLowerCase());
    items.push({ name, agent: agentColumn >= 0 ? clean(row[agentColumn]) : '' });
  });
  return { items, repeated, heading: start ? clean(rows[start - 1][column]) : '', hasAgentColumn: agentColumn >= 0 };
}

const STOP = new Set(['ltd', 'limited', 'llp', 'plc', 'co', 'company', 'and', 'the', 'of', 'client', 'clients', 'list', 'sheet', 'copy', 'final', 'new']);
const words = (text) => String(text ?? '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
const near = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && distance(a, b, 1) <= 1);

// Which agent a tab or file name means: "ABR Tamwill" → "ABR Tamwil Ltd". Null when unsure.
export function matchAgent(text, agents) {
  const said = words(text);
  if (!said.length) return null;
  let best = null;
  let tie = false;
  agents.forEach((agent) => {
    const own = words(agent.name);
    if (!own.length) return;
    const ownHit = own.filter((w) => said.some((s) => near(w, s))).length;
    const saidHit = said.filter((s) => own.some((w) => near(w, s))).length;
    const whole = ownHit === own.length || (saidHit === said.length && said.join('').length >= 5);
    if (!whole) return;
    const score = ownHit / own.length + saidHit / said.length;
    if (!best || score > best.score) { best = { agent, score }; tie = false; } else if (score === best.score) tie = true;
  });
  return best && !tie ? best.agent : null;
}

// workbook: { name, tabs }. agents: [{ id, name }]. clients: [{ name, agent_id }] already in the list.
// Returns groups, one per agent the sheet talks about: { id, label, choice, matched, items }.
// choice: an agent id, 'new' (create an agent called `label`), 'none', or '' = the person must choose.
export function planClients(workbook, { agents = [], clients = [] } = {}) {
  const groups = [];
  const tabs = workbook.tabs.filter((tab) => !HELP_TABS.test(tab.name));
  const single = tabs.length === 1;
  tabs.forEach((tab) => {
    const read = readClientTab(tab.rows);
    if (!read.items.length) return;
    const split = new Map();
    read.items.forEach((item) => {
      const label = read.hasAgentColumn ? item.agent : tab.name;
      if (!split.has(label)) split.set(label, []);
      split.get(label).push(item.name);
    });
    split.forEach((names, label) => {
      const agent = label ? matchAgent(label, agents) || (single && !read.hasAgentColumn ? matchAgent(workbook.name, agents) : null) : null;
      const generic = !label || /^sheet\d*$/i.test(label);
      groups.push({
        id: `${tab.name}::${label}`, label: generic ? workbook.name : label, repeated: read.repeated,
        // A column that says "no agent" for a row means exactly that; an unknown name is asked about.
        choice: agent ? String(agent.id) : read.hasAgentColumn && !label ? 'none' : '',
        matched: Boolean(agent), names,
      });
    });
  });

  const agentName = (id) => agents.find((a) => String(a.id) === String(id))?.name || '';
  const existing = clients.map((c) => ({ name: c.name, lower: c.name.toLowerCase(), key: nameKey(c.name), words: nameWords(c.name), agent: agentName(c.agent_id) }));
  const kept = []; // names already accepted from this sheet
  groups.forEach((group) => {
    group.items = group.names.map((name) => {
      const lower = name.toLowerCase();
      const mine = nameKey(name);
      const same = existing.find((c) => c.lower === lower) || kept.find((k) => k.lower === lower);
      if (same) return { name, state: 'existing', include: false, note: same.agent ? `Already in your list, under ${same.agent}` : 'Already in your list' };
      const twin = existing.find((c) => c.key === mine) || kept.find((k) => k.key === mine);
      const parts = nameWords(name);
      const cousin = twin || existing.find((c) => alike(c.words, parts)) || kept.find((k) => alike(k.words, parts));
      kept.push({ name, lower, key: mine, words: parts, agent: '' });
      // The same name with Ltd/Limited is left out unless the person ticks it; a near miss is only pointed out.
      if (twin) return { name, state: 'alike', include: false, note: `Looks the same as “${twin.name}”` };
      if (cousin) return { name, state: 'alike', include: true, note: `Looks like “${cousin.name}”` };
      return { name, state: 'new', include: true, note: '' };
    });
    delete group.names;
  });
  return groups;
}

export const countOf = (group) => ({
  add: group.items.filter((i) => i.include).length,
  existing: group.items.filter((i) => i.state === 'existing').length,
  alike: group.items.filter((i) => i.state === 'alike').length,
});
