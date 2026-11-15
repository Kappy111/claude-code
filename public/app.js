(() => {
  const app = document.getElementById('app');
  const state = {
    user: null, conversations: [], active: null, messages: new Map(),
    online: new Set(), typing: new Map(), ws: null, wsRetry: 1000,
  };

  // ---------- utils ----------
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false && c !== true) el.append(c.nodeType ? c : document.createTextNode(c));
    return el;
  };
  const api = async (url, opts = {}) => {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  };
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtDay = (ts) => {
    const d = new Date(ts), t = new Date();
    if (d.toDateString() === t.toDateString()) return 'Today';
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const fmtListTime = (ts) => {
    const d = new Date(ts);
    return d.toDateString() === new Date().toDateString() ? fmtTime(ts) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };
  const initials = (s) => s.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const others = (c) => c.members.filter((m) => m.id !== state.user.id);
  const convName = (c) => c.is_group ? c.name : (others(c)[0]?.display_name || 'Unknown');
  const convOnline = (c) => !c.is_group && others(c).some((m) => state.online.has(m.id));

  // ---------- auth screen ----------
  function renderAuth(mode = 'login', error = '') {
    app.className = '';
    const err = h('div', { class: 'error' }, error);
    const form = h('form', { class: 'auth', onsubmit: async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        const data = await api(`/api/${mode}`, { method: 'POST', body: Object.fromEntries(fd) });
        state.user = data.user;
        await boot();
      } catch (ex) { err.textContent = ex.message; }
    } },
      h('h1', {}, mode === 'login' ? 'Sign in' : 'Create account'),
      h('p', { class: 'sub' }, 'No phone number needed. Just pick a username.'),
      h('div', { class: 'field' }, h('label', {}, 'Username'), h('input', { name: 'username', required: true, autocomplete: 'username', autocapitalize: 'none' })),
      mode === 'register' && h('div', { class: 'field' }, h('label', {}, 'Display name (optional)'), h('input', { name: 'displayName' })),
      h('div', { class: 'field' }, h('label', {}, 'Password'), h('input', { name: 'password', type: 'password', required: true, minlength: 8, autocomplete: mode === 'login' ? 'current-password' : 'new-password' })),
      err,
      h('button', { class: 'btn primary', type: 'submit' }, mode === 'login' ? 'Sign in' : 'Create account'),
      h('button', { class: 'btn link', type: 'button', onclick: () => renderAuth(mode === 'login' ? 'register' : 'login') },
        mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'),
    );
    app.replaceChildren(form);
  }

  // ---------- main UI ----------
  let els = {};
  function renderShell() {
    els = {};
    els.convlist = h('div', { class: 'convlist' });
    els.sidebar = h('aside', { class: 'sidebar' },
      h('div', { class: 'topbar' },
        h('div', { class: 'avatar' }, initials(state.user.display_name)),
        h('div', { class: 'title' }, state.user.display_name, h('div', { class: 'sub' }, '@' + state.user.username)),
        h('button', { class: 'iconbtn', title: 'New chat', onclick: openNewChat }, '✎'),
        h('button', { class: 'iconbtn', title: 'Sign out', onclick: async () => { await api('/api/logout', { method: 'POST' }); location.reload(); } }, '⎋'),
      ),
      els.convlist,
    );
    els.header = h('div', { class: 'topbar' });
    els.messages = h('div', { class: 'messages', onscroll: onScroll });
    els.status = h('div', { class: 'status' });
    els.input = h('textarea', { rows: 1, placeholder: 'Message', onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }, oninput: onTypingInput });
    els.main = h('section', { class: 'main' }, els.header, els.messages, els.status,
      h('div', { class: 'composer' }, els.input, h('button', { class: 'btn primary', onclick: sendMessage }, 'Send')));
    app.replaceChildren(els.sidebar, els.main);
    renderConvList();
    renderActive();
  }

  function renderConvList() {
    if (!els.convlist) return;
    if (!state.conversations.length) {
      els.convlist.replaceChildren(h('div', { class: 'empty' }, 'No chats yet. Tap ✎ to start one.'));
      return;
    }
    els.convlist.replaceChildren(...state.conversations.map((c) => {
      const lm = c.last_message;
      const preview = lm ? (lm.sender_id === state.user.id ? 'You: ' : '') + lm.body : (c.is_group ? 'Group created' : 'Say hi');
      return h('button', { class: `conv ${state.active === c.id ? 'active' : ''} ${convOnline(c) ? 'online' : ''}`, onclick: () => openConversation(c.id) },
        h('div', { class: `avatar ${c.is_group ? 'group' : ''}` }, initials(convName(c)), h('span', { class: 'dot' })),
        h('div', { class: 'meta' },
          h('div', { class: 'name' }, h('span', {}, convName(c)), lm && h('time', {}, fmtListTime(lm.created_at))),
          h('div', { class: 'preview' }, preview)),
        c.unread > 0 && h('span', { class: 'badge' }, c.unread));
    }));
  }

  function renderActive() {
    const c = state.conversations.find((x) => x.id === state.active);
    app.className = c ? 'chat-open' : '';
    if (!c) {
      els.header.replaceChildren(h('div', { class: 'title' }, 'Messenger'));
      els.messages.replaceChildren(h('div', { class: 'empty' }, 'Pick a chat or start a new one.'));
      els.main.querySelector('.composer').style.visibility = 'hidden';
      return;
    }
    els.main.querySelector('.composer').style.visibility = '';
    const sub = c.is_group ? `${c.members.length} members` : (convOnline(c) ? 'online' : '@' + others(c)[0]?.username);
    els.header.replaceChildren(
      h('button', { class: 'iconbtn back', onclick: () => { state.active = null; renderConvList(); renderActive(); } }, '‹'),
      h('div', { class: `avatar ${c.is_group ? 'group' : ''} ${convOnline(c) ? 'online' : ''}` }, initials(convName(c)), h('span', { class: 'dot' })),
      h('div', { class: 'title' }, convName(c), h('div', { class: 'sub' }, sub)),
    );
    renderMessages(c);
    renderStatus();
  }

  function renderMessages(c) {
    const msgs = state.messages.get(c.id) || [];
    const byId = Object.fromEntries(c.members.map((m) => [m.id, m]));
    const nodes = [];
    let lastDay = '';
    for (const m of msgs) {
      const day = fmtDay(m.created_at);
      if (day !== lastDay) { nodes.push(h('div', { class: 'daysep' }, day)); lastDay = day; }
      const mine = m.sender_id === state.user.id;
      nodes.push(h('div', { class: `msg ${mine ? 'mine' : ''}`, 'data-id': m.id },
        c.is_group && !mine && h('div', { class: 'who' }, byId[m.sender_id]?.display_name || '?'),
        m.body, h('time', {}, fmtTime(m.created_at))));
    }
    const atBottom = els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 80;
    els.messages.replaceChildren(...nodes);
    if (atBottom || !msgs.length || nodes.length < 60) els.messages.scrollTop = els.messages.scrollHeight;
  }

  function renderStatus() {
    const c = state.conversations.find((x) => x.id === state.active);
    if (!c) return;
    const typers = [...(state.typing.get(c.id)?.keys() || [])]
      .map((id) => c.members.find((m) => m.id === id)?.display_name).filter(Boolean);
    if (typers.length) { els.status.textContent = `${typers.join(', ')} ${typers.length > 1 ? 'are' : 'is'} typing…`; return; }
    const msgs = state.messages.get(c.id) || [];
    const last = msgs[msgs.length - 1];
    if (last && last.sender_id === state.user.id) {
      const readers = others(c).filter((m) => m.last_read_id >= last.id);
      els.status.textContent = readers.length ? (c.is_group ? `Seen by ${readers.map((r) => r.display_name).join(', ')}` : 'Seen') : 'Delivered';
    } else els.status.textContent = '';
  }

  // ---------- actions ----------
  async function openConversation(id) {
    state.active = id;
    if (!state.messages.has(id)) {
      const { messages } = await api(`/api/conversations/${id}/messages`);
      state.messages.set(id, messages);
    }
    renderConvList(); renderActive();
    markRead();
    els.input.focus();
  }

  async function onScroll() {
    if (els.messages.scrollTop > 40 || !state.active) return;
    const msgs = state.messages.get(state.active) || [];
    if (!msgs.length || msgs.loadedAll) return;
    const { messages } = await api(`/api/conversations/${state.active}/messages?before=${msgs[0].id}`);
    if (!messages.length) { msgs.loadedAll = true; return; }
    const prevHeight = els.messages.scrollHeight;
    msgs.unshift(...messages);
    renderMessages(state.conversations.find((x) => x.id === state.active));
    els.messages.scrollTop = els.messages.scrollHeight - prevHeight;
  }

  function markRead() {
    const c = state.conversations.find((x) => x.id === state.active);
    const msgs = state.messages.get(state.active) || [];
    const last = msgs[msgs.length - 1];
    if (!c || !last || c.unread === 0) return;
    c.unread = 0; renderConvList();
    api(`/api/conversations/${c.id}/read`, { method: 'POST', body: { lastId: last.id } }).catch(() => {});
  }

  async function sendMessage() {
    const body = els.input.value.trim();
    if (!body || !state.active) return;
    els.input.value = ''; els.input.style.height = '';
    try { await api(`/api/conversations/${state.active}/messages`, { method: 'POST', body: { body } }); }
    catch (ex) { els.status.textContent = 'Failed to send: ' + ex.message; els.input.value = body; }
  }

  let typingTimer = 0;
  function onTypingInput() {
    els.input.style.height = 'auto';
    els.input.style.height = Math.min(els.input.scrollHeight, 140) + 'px';
    const t = Date.now();
    if (t - typingTimer > 2000 && state.ws?.readyState === 1) {
      typingTimer = t;
      state.ws.send(JSON.stringify({ type: 'typing', conversation_id: state.active }));
    }
  }

  function upsertConversation(conv) {
    const i = state.conversations.findIndex((c) => c.id === conv.id);
    if (i >= 0) state.conversations[i] = conv; else state.conversations.unshift(conv);
    renderConvList();
  }

  function openNewChat() {
    let mode = 'dm';
    const selected = new Map();
    const search = h('input', { placeholder: 'Search by username', autocapitalize: 'none', oninput: doSearch });
    const results = h('div', { class: 'results' });
    const chips = h('div', { class: 'chips' });
    const groupName = h('input', { placeholder: 'Group name', style: 'display:none' });
    const err = h('div', { class: 'error' });
    const tabDm = h('button', { class: 'btn active', type: 'button', onclick: () => setMode('dm') }, 'Direct');
    const tabGroup = h('button', { class: 'btn', type: 'button', onclick: () => setMode('group') }, 'Group');
    const createBtn = h('button', { class: 'btn primary', type: 'button', style: 'display:none', onclick: createGroup }, 'Create group');
    const dlg = h('dialog', {},
      h('h2', {}, 'New chat'),
      h('div', { class: 'tabs' }, tabDm, tabGroup),
      groupName, chips, search, results, err,
      h('div', { class: 'row' }, h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Cancel'), createBtn));
    document.body.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal(); search.focus();

    function setMode(m) {
      mode = m;
      tabDm.classList.toggle('active', m === 'dm'); tabGroup.classList.toggle('active', m === 'group');
      groupName.style.display = createBtn.style.display = m === 'group' ? '' : 'none';
      renderChips(); doSearch();
    }
    function renderChips() {
      chips.replaceChildren(...(mode === 'group' ? [...selected.values()].map((u) => h('span', { class: 'chip' }, '@' + u.username)) : []));
    }
    async function doSearch() {
      const { users } = await api(`/api/users?q=${encodeURIComponent(search.value)}`);
      results.replaceChildren(...users.map((u) => h('button', { class: 'btn', type: 'button', onclick: () => pick(u) },
        `${u.display_name} `, h('span', { style: 'color:var(--muted)' }, '@' + u.username))));
      if (!users.length) results.replaceChildren(h('div', { class: 'empty' }, search.value ? 'Nobody found' : 'No other users yet'));
    }
    async function pick(u) {
      if (mode === 'group') { selected.set(u.id, u); renderChips(); return; }
      try {
        const { conversation } = await api('/api/conversations', { method: 'POST', body: { username: u.username } });
        upsertConversation(conversation); dlg.close(); openConversation(conversation.id);
      } catch (ex) { err.textContent = ex.message; }
    }
    async function createGroup() {
      try {
        const { conversation } = await api('/api/conversations', { method: 'POST',
          body: { name: groupName.value, usernames: [...selected.values()].map((u) => u.username) } });
        upsertConversation(conversation); dlg.close(); openConversation(conversation.id);
      } catch (ex) { err.textContent = ex.message; }
    }
  }

  // ---------- websocket ----------
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    state.ws = ws;
    ws.onopen = () => { state.wsRetry = 1000; };
    ws.onmessage = (e) => handle(JSON.parse(e.data));
    ws.onclose = (e) => {
      if (e.code === 4001) return location.reload();
      setTimeout(connect, state.wsRetry); state.wsRetry = Math.min(state.wsRetry * 2, 15000);
      refresh();
    };
    const ping = setInterval(() => ws.readyState === 1 ? ws.send('{"type":"ping"}') : clearInterval(ping), 25000);
  }

  async function refresh() {
    try {
      const { conversations } = await api('/api/conversations');
      state.conversations = conversations;
      if (state.active) {
        const { messages } = await api(`/api/conversations/${state.active}/messages`);
        state.messages.set(state.active, messages);
      }
      renderConvList(); renderActive();
    } catch {}
  }

  function handle(ev) {
    switch (ev.type) {
      case 'hello': state.online = new Set(ev.online); renderConvList(); renderActive(); break;
      case 'presence': ev.online ? state.online.add(ev.user_id) : state.online.delete(ev.user_id); renderConvList(); renderActive(); break;
      case 'conversation': upsertConversation(ev.conversation); break;
      case 'message': {
        const m = ev.message;
        const c = state.conversations.find((x) => x.id === m.conversation_id);
        if (!c) return refresh();
        c.last_message = { body: m.body, created_at: m.created_at, sender_id: m.sender_id };
        if (m.sender_id !== state.user.id && state.active !== c.id) c.unread = (c.unread || 0) + 1;
        state.conversations.sort((a, b) => (b.last_message?.created_at || 0) - (a.last_message?.created_at || 0));
        if (state.messages.has(c.id)) state.messages.get(c.id).push(m);
        state.typing.get(c.id)?.delete(m.sender_id);
        if (m.sender_id === state.user.id) c.members.find((x) => x.id === m.sender_id).last_read_id = m.id;
        renderConvList();
        if (state.active === c.id) { renderMessages(c); renderStatus(); if (document.hasFocus()) markRead(); }
        else if (m.sender_id !== state.user.id) notify(c, m);
        break;
      }
      case 'read': {
        const c = state.conversations.find((x) => x.id === ev.conversation_id);
        const mem = c?.members.find((x) => x.id === ev.user_id);
        if (mem) { mem.last_read_id = Math.max(mem.last_read_id, ev.last_read_id); if (state.active === c.id) renderStatus(); }
        break;
      }
      case 'typing': {
        if (!state.typing.has(ev.conversation_id)) state.typing.set(ev.conversation_id, new Map());
        const map = state.typing.get(ev.conversation_id);
        clearTimeout(map.get(ev.user_id));
        map.set(ev.user_id, setTimeout(() => { map.delete(ev.user_id); renderStatus(); }, 3500));
        renderStatus();
        break;
      }
    }
  }

  function notify(c, m) {
    if (document.hasFocus() || !('Notification' in window) || Notification.permission !== 'granted') return;
    const who = c.members.find((x) => x.id === m.sender_id)?.display_name || 'Someone';
    const n = new Notification(c.is_group ? `${who} in ${c.name}` : who, { body: m.body.slice(0, 120), tag: 'conv-' + c.id });
    n.onclick = () => { window.focus(); openConversation(c.id); };
  }
  window.addEventListener('focus', markRead);

  // ---------- boot ----------
  async function boot() {
    const { conversations } = await api('/api/conversations');
    state.conversations = conversations;
    renderShell();
    connect();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  }

  api('/api/me').then((d) => { state.user = d.user; return boot(); }).catch(() => renderAuth());
})();
