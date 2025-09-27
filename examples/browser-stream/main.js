let state = null;
const chat = document.getElementById('chat');
const input = document.getElementById('text');
const sendBtn = document.getElementById('send');
const resetBtn = document.getElementById('reset');

function addUser(text) {
  const row = document.createElement('div');
  row.className = 'text-sm';
  row.innerHTML = `<span class="text-blue-300">You:</span> ${escapeHtml(text)}`;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}

function addAssistantBubble() {
  const row = document.createElement('div');
  row.className = 'text-sm';
  const label = document.createElement('span');
  label.className = 'text-green-300';
  label.textContent = 'Assistant: ';
  const text = document.createElement('span');
  text.className = 'whitespace-pre-wrap';
  row.appendChild(label);
  row.appendChild(text);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return text;
}

function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function addCard(kind, text) {
  const base = document.createElement('div');
  base.className = 'text-xs rounded border p-2 max-w-prose ' +
    (kind==='why' ? 'border-yellow-700 bg-yellow-900/20 text-yellow-200' :
     kind==='tool' ? 'border-fuchsia-700 bg-fuchsia-900/20 text-fuchsia-200' :
     kind==='action' ? 'border-cyan-700 bg-cyan-900/20 text-cyan-200' :
     'border-slate-700 bg-slate-900/30');
  base.textContent = text;
  chat.appendChild(base);
  chat.scrollTop = chat.scrollHeight;
}

function pushEvent(ts, type, data){
  const li = document.createElement('li');
  const d = data ? ` ${JSON.stringify(data)}` : '';
  li.textContent = `${ts} – ${type}${d}`;
  eventsEl.appendChild(li);
  eventsEl.scrollTop = eventsEl.scrollHeight;
}

async function streamTurn(text){
  const bubble = addAssistantBubble();
  // Clear nothing; we append all debug info inline as cards in chat
  const resp = await fetch('/api/stream', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ userInput: text, state })
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while(true){
    const {value, done} = await reader.read();
    if(done) break;
    buf += decoder.decode(value, {stream:true});
    let idx;
    while((idx = buf.indexOf('\n')) >= 0){
      const line = buf.slice(0, idx).trim(); buf = buf.slice(idx+1);
      if(!line) continue;
      try{
        const msg = JSON.parse(line);
        if(msg.type==='partial'){
          if(msg.why){ addCard('why', msg.why); }
          if(msg.action){ addCard('action', `(action) ${msg.action}`); }
          if(msg.tool_call){ addCard('tool', `(tool) ${msg.tool_call.tool_name} ${JSON.stringify(msg.tool_call.tool_args||{})}`); }
          if(typeof msg.response_chunk==='string'){ bubble.textContent += msg.response_chunk; }
        }else if(msg.type==='final'){
          state = msg.state;
          if(!bubble.textContent && typeof msg.response==='string') bubble.textContent = msg.response;
          // Display step/flow as compact cards
          addCard('action', `→ step: ${state.current_step_id}${state.flow_state? ` (flow: ${state.flow_state.flow_id})` : ''}`);
          if (Array.isArray(msg.events)){
            for (const e of msg.events){ /* optional: mini event cards*/ }
          }
        }
      }catch{}
      chat.scrollTop = chat.scrollHeight;
    }
  }
}

sendBtn.onclick = async () => {
  const text = input.value.trim(); if(!text) return;
  addUser(text); input.value='';
  await streamTurn(text);
};

resetBtn.onclick = async () => {
  state = null; chat.innerHTML = ''; clearWhy(); setAction('-'); setTool('',{}); stepEl.textContent='-'; flowEl.textContent='-';
  await fetch('/api/reset', { method:'POST' });
};

// Enter to send
input.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    await sendBtn.onclick(new Event('click'));
  }
});
