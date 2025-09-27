// Browser demo without API keys or Node-only modules.
// Build the library first: `npm run build`, then serve `examples/browser/` with any static server.

const chat = document.getElementById('chat');
const stepEl = document.getElementById('step');
const flowEl = document.getElementById('flow');
const decisionEl = document.getElementById('decision');
const eventsEl = document.getElementById('events');
const clearDebugBtn = document.getElementById('clearDebug');
const input = document.getElementById('text');
const btn = document.getElementById('send');
const reset = document.getElementById('reset');

function append(role, text, cls) {
  const div = document.createElement('div');
  div.className = `msg ${cls || ''}`;
  div.textContent = `${role}: ${text}`;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

let state = undefined;

async function renderResult(res) {
  state = res.state;
  stepEl.textContent = state.current_step_id;
  flowEl.textContent = state.flow_state ? state.flow_state.flow_id : '-';
  decisionEl.textContent = JSON.stringify(res.decision || {}, null, 2);
  if (res.tool_output) append('tool', res.tool_output, 'tool');
  if (res.response) append('assistant', res.response, 'assistant');

  // Render debug events (timestamped)
  const dbg = res.debug && Array.isArray(res.debug.events) ? res.debug.events : [];
  eventsEl.innerHTML = '';
  for (const ev of dbg) {
    const row = document.createElement('div');
    row.className = 'text-xs p-2 rounded border border-slate-800 bg-slate-950';
    const ts = new Date(ev.ts || ev.timestamp || Date.now()).toLocaleString();
    const title = document.createElement('div');
    title.className = 'font-medium text-indigo-300';
    title.textContent = `${ts} – ${ev.type}`;
    const body = document.createElement('pre');
    body.className = 'mt-1 whitespace-pre-wrap text-slate-300';
    body.textContent = JSON.stringify(ev.data || ev.decision || {}, null, 2);
    row.appendChild(title);
    row.appendChild(body);
    eventsEl.appendChild(row);
  }
}

async function send(text) {
  if (text && text.trim()) append('you', text, 'user');
  let res = await fetch('/api/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userInput: text, state }),
  }).then(r => r.json());
  await renderResult(res);

  // Auto-advance on MOVE or TOOL_CALL
  let safety = 0;
  while (res.decision && (res.decision.action === 'MOVE' || res.decision.action === 'TOOL_CALL') && safety < 3) {
    res = await fetch('/api/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userInput: undefined, state }),
    }).then(r => r.json());
    await renderResult(res);
    safety++;
  }
}

btn.addEventListener('click', async () => {
  await send(input.value);
  input.value = '';
  input.focus();
});

input.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    await send(input.value);
    input.value = '';
  }
});

reset.addEventListener('click', async () => {
  localStorage.clear();
  chat.innerHTML = '';
  state = undefined;
  stepEl.textContent = '?';
  flowEl.textContent = '-';
  decisionEl.textContent = '';
  await fetch('/api/reset', { method: 'POST' }).catch(() => {});
});

clearDebugBtn.addEventListener('click', () => {
  eventsEl.innerHTML = '';
});

// Greet on load
append('assistant', 'Hello! You can say "start booking" to enter a flow, or ask for the time.');
