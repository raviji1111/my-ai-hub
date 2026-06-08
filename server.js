const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ====== CONFIG (Render Environment Variables se aayenge) ======
const DATABASE_URL = process.env.DATABASE_URL || "yahan-apna-postgres-url-daalein";
const JWT_SECRET = process.env.JWT_SECRET || "koi-bhi-secret-text-123";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Render ke liye zaroori
});

// ====== TABLES AUTO-CREATE ======
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      api_keys JSONB DEFAULT '{}'
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      owner TEXT NOT NULL,
      title TEXT,
      messages JSONB DEFAULT '[]',
      model TEXT,
      updated_at BIGINT
    );
  `);
  console.log("✅ SQL tables ready");
}
pool.connect()
  .then(() => { console.log("✅ PostgreSQL connect ho gaya"); return initDb(); })
  .catch((err) => console.error("❌ DB error:", err.message));

// ====== AUTH MIDDLEWARE ======
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Login zaroori hai" });
  }
}

// ====== REGISTER ======
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ error: "Username/password daalein" });
  try {
    const exists = await pool.query("SELECT 1 FROM users WHERE username=$1", [username]);
    if (exists.rows.length) return res.json({ error: "Ye username already hai" });
    const hash = await bcrypt.hash(password, 10);
    await pool.query("INSERT INTO users (username, password, api_keys) VALUES ($1,$2,$3)", [username, hash, {}]);
    res.json({ ok: true });
  } catch (e) { res.json({ error: e.message }); }
});

// ====== LOGIN ======
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const r = await pool.query("SELECT * FROM users WHERE username=$1", [username]);
  const user = r.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password)))
    return res.json({ error: "Galat username/password" });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "30d" });
  res.json({ token, username });
});

// ====== API KEYS ======
app.get("/api/keys", auth, async (req, res) => {
  const r = await pool.query("SELECT api_keys FROM users WHERE username=$1", [req.user.username]);
  res.json({ apiKeys: r.rows[0]?.api_keys || {} });
});
app.post("/api/keys", auth, async (req, res) => {
  await pool.query("UPDATE users SET api_keys=$1 WHERE username=$2", [req.body.apiKeys || {}, req.user.username]);
  res.json({ ok: true });
});

// ====== CHATS: get all ======
app.get("/api/chats", auth, async (req, res) => {
  const r = await pool.query(
    "SELECT id, title, messages, model, updated_at FROM chats WHERE owner=$1 ORDER BY updated_at DESC",
    [req.user.username]
  );
  const chats = r.rows.map(c => ({ id: c.id, title: c.title, messages: c.messages, model: c.model, updatedAt: Number(c.updated_at) }));
  res.json({ chats });
});

// ====== CHATS: save (create/update) ======
app.post("/api/chats", auth, async (req, res) => {
  const { id, title, messages, model } = req.body;
  await pool.query(`
    INSERT INTO chats (id, owner, title, messages, model, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (id) DO UPDATE
    SET title=$3, messages=$4, model=$5, updated_at=$6
  `, [id, req.user.username, title, JSON.stringify(messages), model, Date.now()]);
  res.json({ ok: true });
});

// ====== CHATS: delete ======
app.post("/api/chats/delete", auth, async (req, res) => {
  await pool.query("DELETE FROM chats WHERE id=$1 AND owner=$2", [req.body.id, req.user.username]);
  res.json({ ok: true });
});

// ====== AI CHAT PROXY ======
app.post("/api/chat", auth, async (req, res) => {
  const { provider, model, apiKey, messages } = req.body;
  if (!apiKey) return res.json({ error: "API key missing" });
  try {
    let reply;
    if (["openai", "deepseek", "mistral", "groq", "xai"].includes(provider)) {
      const urls = {
        openai: "https://api.openai.com/v1/chat/completions",
        deepseek: "https://api.deepseek.com/v1/chat/completions",
        mistral: "https://api.mistral.ai/v1/chat/completions",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        xai: "https://api.x.ai/v1/chat/completions",
      };
      const rr = await fetch(urls[provider], {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
        body: JSON.stringify({ model, messages }),
      });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.choices[0].message.content;
    } else if (provider === "anthropic") {
      const rr = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: 2048, messages }),
      });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.content[0].text;
    } else if (provider === "google") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const contents = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const rr = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents }) });
      const d = await rr.json();
      if (d.error) throw new Error(d.error.message);
      reply = d.candidates[0].content.parts[0].text;
    } else throw new Error("Unknown provider");
    res.json({ reply });
  } catch (err) {
    res.json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server chal raha hai port " + PORT));