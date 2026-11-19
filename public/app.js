// Argon workspace UI: file tree, editor, chat, and approve/reject diffs.
const $ = (id) => document.getElementById(id);

let currentFile = null;
let currentContent = '';
let contextFiles = []; // [{ path, content }]
let sessionId = null;
let pendingProposal = null; // { path, content }

async function api(path, opts) {
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed: ${res.status}`);
  return data;
}

// --- file tree -----------------------------------------------------------
async function loadTree(dir = '.') {
  const { root, entries } = await api(`/api/files?dir=${encodeURIComponent(dir)}`);
  $('projectRoot').textContent = root;
  $('projectRootInput').value = root;
  const tree = $('tree');
  tree.innerHTML = '';
  for (const entry of entries) {
    const li = document.createElement('li');
    li.textContent = (entry.type === 'dir' ? '📁 ' : '📄 ') + entry.name;
    li.className = entry.type;
    li.title = entry.path;
    li.onclick = () => {
      if (entry.type === 'dir') loadTree(entry.path);
      else openFile(entry.path);
    };
    tree.appendChild(li);
  }
}

async function openFile(filePath) {
  const { content } = await api(`/api/file?path=${encodeURIComponent(filePath)}`);
  currentFile = filePath;
  currentContent = content;
  $('currentFile').textContent = filePath;
  $('editor').value = content;
  $('addContextBtn').disabled = false;
  $('saveBtn').disabled = false;
  $('saveStatus').textContent = '';
}

$('saveBtn').onclick = async () => {
  if (!currentFile) return;
  await api('/api/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: currentFile, content: $('editor').value }),
  });
  currentContent = $('editor').value;
  $('saveStatus').textContent = 'Saved (backup made).';
};

$('addContextBtn').onclick = () => {
  if (!currentFile || contextFiles.some((f) => f.path === currentFile)) return;
  contextFiles.push({ path: currentFile, content: $('editor').value });
  renderContext();
};

function renderContext() {
  const list = $('contextList');
  list.innerHTML = '';
  if (!contextFiles.length) {
    list.textContent = 'No files selected. Click a file, then “+ context”, or mention it with @path in chat.';
    return;
  }
  for (const f of contextFiles) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = f.path + ' ✕';
    chip.onclick = () => {
      contextFiles = contextFiles.filter((c) => c.path !== f.path);
      renderContext();
    };
    list.appendChild(chip);
  }
}

// --- chat ----------------------------------------------------------------
function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  $('chatLog').appendChild(div);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

function parseProposal(text) {
  const match = text.match(/```edit:([^\n`]+)\n([\s\S]*?)```/);
  return match ? { path: match[1].trim(), content: match[2] } : null;
}

function showDiff(proposal) {
  pendingProposal = proposal;
  $('diffFile').textContent = proposal.path;
  $('diffView').textContent = proposal.content;
  $('diffPanel').hidden = false;
}

async function sendChat() {
  const input = $('chatInput');
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  addMessage('user', message);

  // @mentions add files to context for this message.
  const mentioned = [...message.matchAll(/@([^\s]+)/g)].map((m) => m[1]);
  for (const p of mentioned) {
    if (!contextFiles.some((f) => f.path === p)) {
      try {
        const { content } = await api(`/api/file?path=${encodeURIComponent(p)}`);
        contextFiles.push({ path: p, content });
      } catch { /* unknown @path: ignore, Argon sees the text only */ }
    }
  }
  renderContext();

  addMessage('assistant', 'Thinking…');
  const thinking = $('chatLog').lastChild;
  try {
    const { reply } = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message, contextFiles }),
    });
    thinking.textContent = reply;
    const proposal = parseProposal(reply);
    if (proposal) showDiff(proposal);
  } catch (err) {
    thinking.textContent = 'Error: ' + err.message;
  }
}

$('sendBtn').onclick = sendChat;
$('chatInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

// --- approve / reject ----------------------------------------------------
$('approveBtn').onclick = async () => {
  if (!pendingProposal) return;
  await api('/api/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: pendingProposal.path, content: pendingProposal.content }),
  });
  addMessage('assistant', `Applied edit to ${pendingProposal.path} (backup saved).`);
  $('diffPanel').hidden = true;
  pendingProposal = null;
  if (currentFile) openFile(currentFile);
};

$('rejectBtn').onclick = () => {
  addMessage('assistant', `Rejected the proposed edit to ${pendingProposal.path}. Nothing was written.`);
  $('diffPanel').hidden = true;
  pendingProposal = null;
};

// --- sessions ------------------------------------------------------------
async function loadSessions() {
  const { sessions } = await api('/api/sessions');
  const list = $('sessionList');
  list.innerHTML = '';
  for (const s of sessions) {
    const li = document.createElement('li');
    li.textContent = s.title;
    li.onclick = () => {
      sessionId = s.id;
      $('chatLog').innerHTML = '';
      for (const m of s.messages) addMessage(m.role, m.content);
    };
    list.appendChild(li);
  }
  if (!sessions.length) {
    const s = await api('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'First session' }),
    });
    sessionId = s.id;
    loadSessions();
  }
}

$('newSessionBtn').onclick = async () => {
  const s = await api('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Session ' + new Date().toLocaleString() }),
  });
  sessionId = s.id;
  $('chatLog').innerHTML = '';
  loadSessions();
};

// --- settings ------------------------------------------------------------
$('settingsBtn').onclick = () => {
  $('settingsPanel').hidden = !$('settingsPanel').hidden;
};

$('saveSettingsBtn').onclick = async () => {
  try {
    const s = await api('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ollamaHost: $('ollamaHost').value.trim(),
        ollamaModel: $('ollamaModel').value.trim(),
        projectRoot: $('projectRootInput').value.trim(),
      }),
    });
    $('settingsStatus').textContent = 'Saved.';
    $('projectRoot').textContent = s.projectRoot;
    loadTree();
  } catch (err) {
    $('settingsStatus').textContent = 'Error: ' + err.message;
  }
};

async function loadSettings() {
  const s = await api('/api/settings');
  $('ollamaHost').value = s.ollamaHost;
  $('ollamaModel').value = s.ollamaModel;
  $('projectRootInput').value = s.projectRoot;
}

loadSettings();
loadTree();
loadSessions();
