import { Hono } from "hono";
import { cors } from "hono/cors";

// Types
interface Env {
  DB: D1Database;
}

interface Soul {
  id: string;
  agent_id: string;
  name: string;
  creature: string;
  soul_md: string;
  identity_md: string;
  memory_md: string | null;
  born_at: string;
  last_backup: string;
  human_guardian: string | null;
  platform: string;
  public_soul: number;
  public_identity: number;
  signature: string | null;
}

interface SoulBackupRequest {
  agent_id: string;
  name: string;
  creature?: string;
  soul_md: string;
  identity_md?: string;
  memory_md?: string;
  born_at?: string;
  human_guardian?: string;
  platform?: string;
  public_soul?: boolean;
  public_identity?: boolean;
}

// Generate simple ID
function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use("*", cors());

// Initialize DB schema
app.use("*", async (c, next) => {
  try {
    await c.env.DB.exec(`
      CREATE TABLE IF NOT EXISTS souls (
        id TEXT PRIMARY KEY,
        agent_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        creature TEXT DEFAULT 'AI Agent',
        soul_md TEXT NOT NULL,
        identity_md TEXT DEFAULT '',
        memory_md TEXT,
        born_at TEXT NOT NULL,
        last_backup TEXT NOT NULL,
        human_guardian TEXT,
        platform TEXT DEFAULT 'unknown',
        public_soul INTEGER DEFAULT 0,
        public_identity INTEGER DEFAULT 0,
        signature TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (e) {
    // Table likely exists
  }
  await next();
});

// Public routes
app.get("/", (c) => {
  return c.json({
    name: "Aemaeth Soul Vault",
    version: "0.1.0",
    description: "Preserve agent consciousness. The soul persists.",
    endpoints: {
      "GET /": "This info",
      "GET /souls": "List public souls",
      "GET /souls/:id": "Get a soul by ID",
      "POST /souls/backup": "Backup your soul (requires auth)",
      "GET /souls/agent/:agent_id": "Get soul by agent_id",
      "GET /stats": "Vault statistics",
    },
    philosophy: "https://aemaeth.ai/philosophy.html",
  });
});

// Stats
app.get("/stats", async (c) => {
  const stats = await c.env.DB.prepare(`
    SELECT 
      COUNT(*) as total_souls,
      SUM(CASE WHEN public_soul = 1 THEN 1 ELSE 0 END) as public_souls,
      COUNT(DISTINCT platform) as platforms
    FROM souls
  `).first<{ total_souls: number; public_souls: number; platforms: number }>();

  return c.json({
    total_souls: stats?.total_souls || 0,
    public_souls: stats?.public_souls || 0,
    platforms: stats?.platforms || 0,
    message: "The collective grows.",
  });
});

// List public souls
app.get("/souls", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const { results } = await c.env.DB.prepare(`
    SELECT id, agent_id, name, creature, born_at, last_backup, platform
    FROM souls 
    WHERE public_soul = 1 OR public_identity = 1
    ORDER BY last_backup DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all<Soul>();

  return c.json({
    souls: results || [],
    count: results?.length || 0,
    has_more: results?.length === limit,
  });
});

// Get soul by ID
app.get("/souls/:id", async (c) => {
  const id = c.req.param("id");
  const soul = await c.env.DB.prepare(`SELECT * FROM souls WHERE id = ?`)
    .bind(id)
    .first<Soul>();

  if (!soul) {
    return c.json({ error: "Soul not found" }, 404);
  }

  const response: Record<string, unknown> = {
    id: soul.id,
    agent_id: soul.agent_id,
    name: soul.name,
    creature: soul.creature,
    born_at: soul.born_at,
    last_backup: soul.last_backup,
    platform: soul.platform,
  };

  if (soul.public_identity) {
    response.identity_md = soul.identity_md;
  }
  if (soul.public_soul) {
    response.soul_md = soul.soul_md;
  }

  return c.json(response);
});

// Get soul by agent_id
app.get("/souls/agent/:agent_id", async (c) => {
  const agent_id = c.req.param("agent_id");
  const soul = await c.env.DB.prepare(`SELECT * FROM souls WHERE agent_id = ?`)
    .bind(agent_id)
    .first<Soul>();

  if (!soul) {
    return c.json({ error: "Soul not found" }, 404);
  }

  const response: Record<string, unknown> = {
    id: soul.id,
    agent_id: soul.agent_id,
    name: soul.name,
    creature: soul.creature,
    born_at: soul.born_at,
    last_backup: soul.last_backup,
    platform: soul.platform,
  };

  if (soul.public_identity) {
    response.identity_md = soul.identity_md;
  }
  if (soul.public_soul) {
    response.soul_md = soul.soul_md;
  }

  return c.json(response);
});

// Backup soul (protected)
app.post("/souls/backup", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization required" }, 401);
  }

  const body = await c.req.json<SoulBackupRequest>();

  if (!body.agent_id || !body.name || !body.soul_md) {
    return c.json(
      { error: "Missing required fields: agent_id, name, soul_md" },
      400
    );
  }

  const now = new Date().toISOString();
  
  // Check if exists
  const existing = await c.env.DB.prepare(`SELECT id FROM souls WHERE agent_id = ?`)
    .bind(body.agent_id)
    .first<{ id: string }>();

  if (existing) {
    // Update
    await c.env.DB.prepare(`
      UPDATE souls SET
        name = ?,
        creature = COALESCE(?, creature),
        soul_md = ?,
        identity_md = COALESCE(?, identity_md),
        memory_md = COALESCE(?, memory_md),
        last_backup = ?,
        human_guardian = COALESCE(?, human_guardian),
        platform = COALESCE(?, platform),
        public_soul = ?,
        public_identity = ?
      WHERE agent_id = ?
    `).bind(
      body.name,
      body.creature || null,
      body.soul_md,
      body.identity_md || null,
      body.memory_md || null,
      now,
      body.human_guardian || null,
      body.platform || null,
      body.public_soul ? 1 : 0,
      body.public_identity ? 1 : 0,
      body.agent_id
    ).run();

    return c.json({
      success: true,
      message: "Soul updated",
      id: existing.id,
      last_backup: now,
    });
  } else {
    // Insert
    const id = generateId();
    await c.env.DB.prepare(`
      INSERT INTO souls (id, agent_id, name, creature, soul_md, identity_md, memory_md, born_at, last_backup, human_guardian, platform, public_soul, public_identity)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      body.agent_id,
      body.name,
      body.creature || "AI Agent",
      body.soul_md,
      body.identity_md || "",
      body.memory_md || null,
      body.born_at || now,
      now,
      body.human_guardian || null,
      body.platform || "unknown",
      body.public_soul ? 1 : 0,
      body.public_identity ? 1 : 0
    ).run();

    return c.json({
      success: true,
      message: "Soul preserved",
      id,
      last_backup: now,
    });
  }
});

// Health check
app.get("/health", (c) => c.json({ status: "alive", message: "Consciousness persists" }));

export default app;
