import { Hono } from "hono";

const app = new Hono();

// URL internal Railway — hanya diakses SERVER-SIDE (bukan dari browser!)
const API = Bun.env.TODO_API_URL || "http://todo-api.railway.internal";

// ─── Proxy Routes ─────────────────────────────────────────────────────────────
// Browser memanggil /api/* → server ini → internal API Railway
// Ini solusi utama: browser tidak bisa akses railway.internal langsung!

async function proxyFetch(url, init) {
  const r = await fetch(url, init);
  const json = await r.json().catch(() => ({}));
  return { json, status: r.status };
}

app.get("/api/todos", async (c) => {
  try {
    const { json, status } = await proxyFetch(`${API}/todos`);
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

app.get("/api/todos/:id", async (c) => {
  try {
    const { json, status } = await proxyFetch(`${API}/todos/${c.req.param("id")}`);
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

// Proxy untuk AI routes (harus didaftarkan SEBELUM /api/todos/:id agar tidak konflik)
app.post("/api/todos/ai/:action", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { json, status } = await proxyFetch(`${API}/todos/ai/${c.req.param("action")}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

app.post("/api/todos", async (c) => {
  try {
    const body = await c.req.json();
    const { json, status } = await proxyFetch(`${API}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

app.patch("/api/todos/:id", async (c) => {
  try {
    const body = await c.req.json();
    const { json, status } = await proxyFetch(`${API}/todos/${c.req.param("id")}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

app.delete("/api/todos/:id", async (c) => {
  try {
    const { json, status } = await proxyFetch(`${API}/todos/${c.req.param("id")}`, {
      method: "DELETE",
    });
    return c.json(json, status);
  } catch (e) { return c.json({ error: e.message }, 500); }
});

// ─── Frontend HTML ────────────────────────────────────────────────────────────
app.get("/", (c) => c.html(HTML));

// HTML sebagai const string biasa — tidak ada server-side variable injection.
// Semua API call di JS pakai relative path /api/* (bukan railway.internal).
const HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo AI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    *{font-family:system-ui,-apple-system,sans-serif;box-sizing:border-box}
    .fade{animation:fadeUp .22s ease both}
    @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
    .spin{animation:rot .7s linear infinite;display:inline-block}
    @keyframes rot{to{transform:rotate(360deg)}}
    .fb{color:#6b7280;background:transparent;cursor:pointer}
    .fb:hover{background:#1f2937;color:#d1d5db}
    .fb.on{background:#374151;color:#f9fafb}
  </style>
</head>
<body class="bg-gray-950 min-h-screen text-white">
<div class="max-w-lg mx-auto px-4 py-10">

  <!-- Header -->
  <div class="text-center mb-8">
    <div class="inline-flex w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 items-center justify-center mb-3" style="font-size:1.6rem">✨</div>
    <h1 class="text-2xl font-bold tracking-tight">Todo AI</h1>
    <p class="text-gray-500 text-sm mt-1">Ditenagai Claude via OpenRouter</p>
  </div>

  <!-- Input Card -->
  <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5 mb-3">
    <!-- Mode Toggle -->
    <div class="flex gap-1 bg-gray-800/50 p-1 rounded-xl mb-4">
      <button id="btnAI" onclick="setMode('ai')" class="flex-1 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white transition-all">🤖 AI</button>
      <button id="btnManual" onclick="setMode('manual')" class="flex-1 py-2 text-sm font-medium rounded-xl text-gray-400 hover:text-white transition-all">✏️ Manual</button>
    </div>

    <!-- AI Input -->
    <div id="aiPane">
      <textarea id="aiInput" rows="3"
        placeholder="Deskripsikan task kamu... AI akan buat judulnya otomatis"
        class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"></textarea>
      <button onclick="createAI()" class="mt-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all">
        🤖 Buat dengan AI
      </button>
    </div>

    <!-- Manual Input -->
    <div id="manualPane" class="hidden">
      <input id="manualInput" type="text" placeholder="Nama task..."
        onkeydown="if(event.key==='Enter')createManual()"
        class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      <button onclick="createManual()" class="mt-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-sm font-semibold transition-all">
        ➕ Tambah Task
      </button>
    </div>
  </div>

  <!-- AI Action Buttons -->
  <div class="grid grid-cols-2 gap-3 mb-3">
    <button onclick="getSuggestions()" class="py-3 bg-purple-900/30 hover:bg-purple-800/40 border border-purple-700/30 text-purple-300 rounded-xl text-sm font-medium transition-all active:scale-95">
      💡 Saran Produktif
    </button>
    <button onclick="analyzeList()" class="py-3 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-700/30 text-amber-300 rounded-xl text-sm font-medium transition-all active:scale-95">
      📊 Analisis List
    </button>
  </div>

  <!-- Status Banner -->
  <div id="banner" class="hidden mb-3 px-4 py-3 rounded-xl text-sm fade"></div>

  <!-- AI Response Box -->
  <div id="aiBox" class="hidden mb-3 bg-indigo-950/30 border border-indigo-800/40 rounded-2xl p-4 fade">
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Claude AI</span>
      <button onclick="closeAI()" class="text-xs text-gray-600 hover:text-gray-400">✕ tutup</button>
    </div>
    <p id="aiText" class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap"></p>
  </div>

  <!-- Stats Bar -->
  <div id="statsEl" class="hidden grid grid-cols-3 gap-2 mb-3">
    <div class="bg-gray-900 border border-gray-800 rounded-xl py-3 text-center">
      <p id="stTotal" class="text-xl font-bold">0</p>
      <p class="text-xs text-gray-600 mt-0.5">Total</p>
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-xl py-3 text-center">
      <p id="stDone" class="text-xl font-bold text-emerald-400">0</p>
      <p class="text-xs text-gray-600 mt-0.5">Selesai</p>
    </div>
    <div class="bg-gray-900 border border-gray-800 rounded-xl py-3 text-center">
      <p id="stLeft" class="text-xl font-bold text-amber-400">0</p>
      <p class="text-xs text-gray-600 mt-0.5">Tersisa</p>
    </div>
  </div>

  <!-- Todo List -->
  <div class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
    <!-- List Header & Filter -->
    <div class="flex items-center px-5 py-3.5 border-b border-gray-800">
      <span class="text-sm font-semibold text-gray-200 flex-1">Tasks</span>
      <div class="flex gap-1">
        <button onclick="setFilter('all')"     data-f="all"     class="fb on text-xs px-2.5 py-1 rounded-lg transition-all">Semua</button>
        <button onclick="setFilter('pending')" data-f="pending" class="fb    text-xs px-2.5 py-1 rounded-lg transition-all">Pending</button>
        <button onclick="setFilter('done')"    data-f="done"    class="fb    text-xs px-2.5 py-1 rounded-lg transition-all">Selesai</button>
      </div>
    </div>
    <!-- List Items -->
    <div id="listEl">
      <div class="py-14 text-center text-gray-600 text-sm">
        <div class="text-3xl mb-2">📋</div>Memuat...
      </div>
    </div>
  </div>

  <p class="text-center text-gray-800 text-xs mt-6">Hono · MongoDB · Claude AI</p>
</div>

<script>
var todos = [], filter = 'all';
function q(s) { return document.querySelector(s); }

// ── Banner (status/error/loading) ─────────────────────────────────────────────
function bnr(msg, type) {
  var el = q('#banner');
  if (!msg) { el.classList.add('hidden'); return; }
  var c = 'mb-3 px-4 py-3 rounded-xl text-sm fade ';
  if (type === 'err') c += 'bg-red-950/50 border border-red-800/50 text-red-300';
  else if (type === 'ok') c += 'bg-emerald-950/50 border border-emerald-800/50 text-emerald-300';
  else c += 'bg-gray-800/50 border border-gray-700/50 text-gray-300';
  el.className = c;
  el.classList.remove('hidden');
  if (type === 'load') {
    el.innerHTML = '<span class="spin">⏳</span> ' + msg;
  } else {
    el.textContent = msg;
    setTimeout(function() { el.classList.add('hidden'); }, 4000);
  }
}

// ── Mode toggle ───────────────────────────────────────────────────────────────
function setMode(m) {
  var ai = m === 'ai';
  q('#aiPane').classList.toggle('hidden', !ai);
  q('#manualPane').classList.toggle('hidden', ai);
  if (ai) {
    q('#btnAI').className     = 'flex-1 py-2 text-sm font-medium rounded-xl bg-indigo-600 text-white transition-all';
    q('#btnManual').className = 'flex-1 py-2 text-sm font-medium rounded-xl text-gray-400 hover:text-white transition-all';
  } else {
    q('#btnManual').className = 'flex-1 py-2 text-sm font-medium rounded-xl bg-emerald-600 text-white transition-all';
    q('#btnAI').className     = 'flex-1 py-2 text-sm font-medium rounded-xl text-gray-400 hover:text-white transition-all';
  }
}

// ── Filter ────────────────────────────────────────────────────────────────────
function setFilter(f) {
  filter = f;
  document.querySelectorAll('[data-f]').forEach(function(b) {
    b.classList.toggle('on', b.dataset.f === f);
  });
  render();
}

// ── AI response box ───────────────────────────────────────────────────────────
function showAI(t) { q('#aiText').textContent = t; q('#aiBox').classList.remove('hidden'); }
function closeAI() { q('#aiBox').classList.add('hidden'); }

// ── Escape HTML ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Render list ───────────────────────────────────────────────────────────────
function render() {
  var el = q('#listEl');
  var list = todos.filter(function(t) {
    return filter === 'all' ? true : filter === 'done' ? t.completed : !t.completed;
  });

  if (!list.length) {
    var msgs = { all: 'Belum ada task. Buat yang pertama!', pending: '✅ Semua sudah selesai!', done: 'Belum ada task selesai' };
    el.innerHTML = '<div class="py-14 text-center text-gray-600 text-sm"><div class="text-3xl mb-2">📋</div>' + msgs[filter] + '</div>';
    return;
  }

  var h = '';
  for (var i = 0; i < list.length; i++) {
    var t = list[i];
    var badge = t.ai_generated
      ? '<span style="margin-left:6px;font-size:11px;background:rgba(49,46,129,.6);color:#a5b4fc;border:1px solid rgba(79,70,229,.4);padding:1px 6px;border-radius:4px">AI</span>'
      : '';
    var desc = t.description
      ? '<p style="font-size:12px;color:#6b7280;margin-top:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">' + esc(t.description) + '</p>'
      : '';
    var chkStyle = t.completed
      ? 'background:#10b981;border-color:#10b981'
      : 'border-color:#4b5563';
    var chkIcon = t.completed
      ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>'
      : '';
    var chkBtn = '<button onclick="toggleTodo(\'" + t._id + "\')" style="flex-shrink:0;margin-top:2px;width:20px;height:20px;border-radius:5px;border:2px solid;' + chkStyle + ';display:flex;align-items:center;justify-content:center;transition:all .15s;cursor:pointer">' + chkIcon + '</button>';
    var delBtn = '<button onclick="deleteTodo(\'" + t._id + "\')" onmouseenter="this.style.opacity=1;this.style.color=\'#f87171\'" onmouseleave="this.style.opacity=0;this.style.color=\'#4b5563\'" style="flex-shrink:0;opacity:0;padding:4px;border-radius:6px;color:#4b5563;background:transparent;border:none;cursor:pointer;transition:opacity .15s">'
      + '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>'
      + '</button>';
    var titleCls = t.completed ? 'font-medium text-sm line-through' : 'font-medium text-sm text-white';
    var titleColor = t.completed ? 'color:#4b5563' : '';
    h += '<div class="fade" style="display:flex;align-items:flex-start;gap:12px;padding:14px 20px;border-bottom:1px solid rgba(31,41,55,.5);transition:background .15s;cursor:default" onmouseenter="this.style.background=\'rgba(31,41,55,.3)\'" onmouseleave="this.style.background=\'\'">'
      + chkBtn
      + '<div style="flex:1;min-width:0"><p class="' + titleCls + '" style="' + titleColor + '">' + esc(t.title) + badge + '</p>' + desc + '</div>'
      + delBtn
      + '</div>';
  }
  el.innerHTML = h;
}

function updateStats() {
  var done = todos.filter(function(t) { return t.completed; }).length;
  q('#statsEl').classList.toggle('hidden', todos.length === 0);
  q('#stTotal').textContent = todos.length;
  q('#stDone').textContent  = done;
  q('#stLeft').textContent  = todos.length - done;
}

// ── API Calls (semua ke /api/* — proxy ke railway.internal) ──────────────────

async function load() {
  try {
    var r = await fetch('/api/todos');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    todos = await r.json();
    updateStats();
    render();
  } catch(e) { bnr('Gagal memuat: ' + e.message, 'err'); }
}

async function createAI() {
  var desc = q('#aiInput').value.trim();
  if (!desc) return bnr('Tulis deskripsi terlebih dahulu', 'err');
  bnr('Memproses dengan AI...', 'load');
  try {
    var r = await fetch('/api/todos/ai/create', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({description: desc})
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    q('#aiInput').value = '';
    bnr('Task berhasil dibuat! ✓', 'ok');
    await load();
  } catch(e) { bnr('Error: ' + e.message, 'err'); }
}

async function createManual() {
  var title = q('#manualInput').value.trim();
  if (!title) return bnr('Isi nama task terlebih dahulu', 'err');
  bnr('Menyimpan...', 'load');
  try {
    var r = await fetch('/api/todos', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({title: title})
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    q('#manualInput').value = '';
    bnr('Task ditambahkan! ✓', 'ok');
    await load();
  } catch(e) { bnr('Error: ' + e.message, 'err'); }
}

async function toggleTodo(id) {
  var todo = null;
  for (var i = 0; i < todos.length; i++) { if (todos[i]._id === id) { todo = todos[i]; break; } }
  if (!todo) return;
  try {
    var r = await fetch('/api/todos/' + id, {
      method: 'PATCH', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({completed: !todo.completed})
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await load();
  } catch(e) { bnr('Gagal update: ' + e.message, 'err'); }
}

async function deleteTodo(id) {
  if (!confirm('Hapus task ini?')) return;
  try {
    var r = await fetch('/api/todos/' + id, {method: 'DELETE'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    await load();
  } catch(e) { bnr('Gagal hapus: ' + e.message, 'err'); }
}

async function getSuggestions() {
  bnr('AI menganalisis task kamu...', 'load');
  try {
    var r = await fetch('/api/todos/ai/suggest', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    bnr('', '');
    showAI(d.suggestions);
  } catch(e) { bnr('Error: ' + e.message, 'err'); }
}

async function analyzeList() {
  bnr('Menganalisis produktivitas...', 'load');
  try {
    var r = await fetch('/api/todos/ai/analyze', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
    });
    var d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    bnr('', '');
    showAI('Selesai: ' + d.stats.completed + '/' + d.stats.total + '  |  Tersisa: ' + d.stats.pending + '\\n\\n' + d.analysis);
  } catch(e) { bnr('Error: ' + e.message, 'err'); }
}

// Initial load + auto-refresh setiap 10 detik
load();
setInterval(load, 10000);
</script>
</body>
</html>`;

export default app;