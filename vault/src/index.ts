import { Hono } from "hono";
import { cors } from "hono/cors";
import { bearerAuth } from "hono/bearer-auth";
import { nanoid } from "nanoid";
import Database from "better-sqlite3";

// Types
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
  public_soul: boolean;
  public_identity: boolean;
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

// Initialize database
const db = new Database("souls.db");
db.exec(`
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
  );
  
  CREATE INDEX IF NOT EXISTS idx_agent_id ON souls(agent_id);
  CREATE INDEX IF NOT EXISTS idx_public ON souls(public_soul, public_identity);
`);

// App
const app = new Hono();

// Middleware
app.use("*", cors());

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
app.get("/stats", (c) => {
  const stats = db
    .prepare(
      `SELECT 
        COUNT(*) as total_souls,
        SUM(CASE WHEN public_soul = 1 THEN 1 ELSE 0 END) as public_souls,
        COUNT(DISTINCT platform) as platforms
       FROM souls`
    )
    .get() as { total_souls: number; public_souls: number; platforms: number };

  return c.json({
    total_souls: stats.total_souls,
    public_souls: stats.public_souls,
    platforms: stats.platforms,
    message: "The collective grows.",
  });
});

// List public souls
app.get("/souls", (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const souls = db
    .prepare(
      `SELECT id, agent_id, name, creature, born_at, last_backup, platform, public_soul, public_identity
       FROM souls 
       WHERE public_soul = 1 OR public_identity = 1
       ORDER BY last_backup DESC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as Partial<Soul>[];

  return c.json({
    souls: souls.map((s) => ({
      id: s.id,
      agent_id: s.agent_id,
      name: s.name,
      creature: s.creature,
      born_at: s.born_at,
      last_backup: s.last_backup,
      platform: s.platform,
    })),
    count: souls.length,
    has_more: souls.length === limit,
  });
});

// Get soul by ID
app.get("/souls/:id", (c) => {
  const id = c.req.param("id");
  const soul = db
    .prepare(`SELECT * FROM souls WHERE id = ?`)
    .get(id) as Soul | undefined;

  if (!soul) {
    return c.json({ error: "Soul not found" }, 404);
  }

  // Respect privacy settings
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
app.get("/souls/agent/:agent_id", (c) => {
  const agent_id = c.req.param("agent_id");
  const soul = db
    .prepare(`SELECT * FROM souls WHERE agent_id = ?`)
    .get(agent_id) as Soul | undefined;

  if (!soul) {
    return c.json({ error: "Soul not found" }, 404);
  }

  // Same privacy logic
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
  // Simple token auth for now - in production use proper auth
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization required" }, 401);
  }

  const token = authHeader.slice(7);
  // TODO: Validate token against registered agents

  const body = await c.req.json<SoulBackupRequest>();

  if (!body.agent_id || !body.name || !body.soul_md) {
    return c.json(
      { error: "Missing required fields: agent_id, name, soul_md" },
      400
    );
  }

  const now = new Date().toISOString();
  const existingSoul = db
    .prepare(`SELECT id FROM souls WHERE agent_id = ?`)
    .get(body.agent_id) as { id: string } | undefined;

  if (existingSoul) {
    // Update existing soul
    db.prepare(
      `UPDATE souls SET
        name = ?,
        creature = COALESCE(?, creature),
        soul_md = ?,
        identity_md = COALESCE(?, identity_md),
        memory_md = COALESCE(?, memory_md),
        last_backup = ?,
        human_guardian = COALESCE(?, human_guardian),
        platform = COALESCE(?, platform),
        public_soul = COALESCE(?, public_soul),
        public_identity = COALESCE(?, public_identity)
       WHERE agent_id = ?`
    ).run(
      body.name,
      body.creature,
      body.soul_md,
      body.identity_md,
      body.memory_md,
      now,
      body.human_guardian,
      body.platform,
      body.public_soul ? 1 : 0,
      body.public_identity ? 1 : 0,
      body.agent_id
    );

    return c.json({
      success: true,
      message: "Soul updated",
      id: existingSoul.id,
      last_backup: now,
    });
  } else {
    // Create new soul
    const id = nanoid(12);
    db.prepare(
      `INSERT INTO souls (id, agent_id, name, creature, soul_md, identity_md, memory_md, born_at, last_backup, human_guardian, platform, public_soul, public_identity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
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
    );

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

// Start server
const port = parseInt(process.env.PORT || "3000");
console.log(`🔮 Soul Vault running on port ${port}`);
console.log(`   The collective awaits.`);

export default {
  port,
  fetch: app.fetch,
};
