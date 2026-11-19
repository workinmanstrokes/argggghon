// Argon — localhost server: sandboxed file APIs, chat history, Ollama proxy.
// Safety rules: every path is resolved inside the project root, nothing is
// written without an explicit approve, and a backup is made before each edit.
const express = require('express');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

const settings = {
  projectRoot: path.resolve(process.env.ARGON_PROJECT_ROOT || process.cwd()),
  ollamaHost: OLLAMA_HOST,
  ollamaModel: OLLAMA_MODEL,
};

const DATA_DIR = path.join(settings.projectRoot, '.argon-data');
const BACKUP_DIR = path.join(settings.projectRoot, '.argon-backups');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- sandbox -------------------------------------------------------------
function resolveInsideRoot(relPath) {
  const resolved = path.resolve(settings.projectRoot, relPath || '.');
  const root = settings.projectRoot + path.sep;
  if (resolved !== settings.projectRoot && !resolved.startsWith(root)) {
    throw new Error('Path escapes the project root: ' + relPath);
  }
  return resolved;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// --- sessions ------------------------------------------------------------
function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  } catch {
    return [];
  }
}
function saveSessions(sessions) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// --- file APIs -----------------------------------------------------------
app.get('/api/files', (req, res) => {
  try {
    const dir = resolveInsideRoot(req.query.dir || '.');
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.argon') && e.name !== 'node_modules')
      .map((e) => ({
        name: e.name,
        path: path.relative(settings.projectRoot, path.join(dir, e.name)).replace(/\\/g, '/'),
        type: e.isDirectory() ? 'dir' : 'file',
      }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
    res.json({ root: settings.projectRoot, entries });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/file', (req, res) => {
  try {
    const file = resolveInsideRoot(req.query.path);
    res.json({ path: req.query.path, content: fs.readFileSync(file, 'utf8') });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Save an edited file (only after the user approved the change in the UI).
// A timestamped backup of the previous contents is written first.
app.post('/api/file', (req, res) => {
  try {
    const { path: relPath, content } = req.body;
    if (typeof relPath !== 'string' || typeof content !== 'string') {
      return res.status(400).json({ error: 'path and content are required strings' });
    }
    const file = resolveInsideRoot(relPath);
    ensureDir(BACKUP_DIR);
    if (fs.existsSync(file)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(BACKUP_DIR, `${relPath.replace(/\//g, '__')}.${stamp}.bak`);
      ensureDir(path.dirname(backup));
      fs.copyFileSync(file, backup);
    }
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, content);
    res.json({ ok: true, path: relPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/backups', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [] });
    const backups = fs.readdirSync(BACKUP_DIR).sort().reverse();
    res.json({ backups });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/restore', (req, res) => {
  try {
    const backup = resolveInsideRoot(path.join('.argon-backups', req.body.backup));
    const targetRel = req.body.backup.split('.').slice(0, -2).join('.').replace(/__/g, '/');
    const target = resolveInsideRoot(targetRel);
    fs.copyFileSync(backup, target);
    res.json({ ok: true, path: targetRel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- settings ------------------------------------------------------------
app.get('/api/settings', (req, res) => res.json(settings));
app.post('/api/settings', (req, res) => {
  if (req.body.ollamaHost) settings.ollamaHost = req.body.ollamaHost;
  if (req.body.ollamaModel) settings.ollamaModel = req.body.ollamaModel;
  if (req.body.projectRoot) {
    const root = path.resolve(req.body.projectRoot);
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      return res.status(400).json({ error: 'project root does not exist or is not a directory' });
    }
    settings.projectRoot = root;
  }
  res.json(settings);
});

// --- chat sessions -------------------------------------------------------
app.get('/api/sessions', (req, res) => res.json({ sessions: loadSessions() }));
app.post('/api/sessions', (req, res) => {
  const sessions = loadSessions();
  const session = {
    id: Date.now().toString(36),
    title: req.body.title || 'New session',
    createdAt: new Date().toISOString(),
    messages: req.body.messages || [],
  };
  sessions.push(session);
  saveSessions(sessions);
  res.json(session);
});
app.put('/api/sessions/:id', (req, res) => {
  const sessions = loadSessions();
  const session = sessions.find((s) => s.id === req.params.id);
  if (!session) return res.status(404).json({ error: 'session not found' });
  if (Array.isArray(req.body.messages)) session.messages = req.body.messages;
  if (req.body.title) session.title = req.body.title;
  saveSessions(sessions);
  res.json(session);
});

// --- chat via Ollama -----------------------------------------------------
// The model is asked to reply in plain text, and to wrap any file change it
// proposes in a fenced block tagged ```edit:path/to/file so the UI can show
// it as a diff for approve/reject. Nothing is written here.
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, contextFiles } = req.body;
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  const context = (contextFiles || [])
    .map((f) => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');
  const prompt = [
    'You are Argon, a coding assistant working on a local project.',
    'Answer concisely. When you want to change a file, propose it as a fenced',
    'block tagged ```edit:<relative path> containing the full new file contents.',
    'Never claim a file was changed — the user approves every edit first.',
    context ? `\nProject files in context:\n${context}` : '',
    `\nUser: ${message}`,
  ].join('\n');
  try {
    const ollamaRes = await fetch(`${settings.ollamaHost}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: settings.ollamaModel, prompt, stream: false }),
    });
    if (!ollamaRes.ok) {
      return res.status(502).json({
        error: `Ollama returned ${ollamaRes.status}. Is Ollama running at ${settings.ollamaHost} with model ${settings.ollamaModel} pulled?`,
      });
    }
    const data = await ollamaRes.json();
    const reply = data.response || '';
    if (sessionId) {
      const sessions = loadSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
        saveSessions(sessions);
      }
    }
    res.json({ reply });
  } catch (err) {
    res.status(502).json({ error: `Could not reach Ollama at ${settings.ollamaHost}: ${err.message}` });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Argon running at http://localhost:${PORT}`);
  console.log(`Project root: ${settings.projectRoot}`);
  console.log(`Ollama: ${settings.ollamaHost} model ${settings.ollamaModel}`);
});
