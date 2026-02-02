import { Hono } from "hono";
import { cors } from "hono/cors";
import { nanoid } from "nanoid";
import { readFileSync, writeFileSync, existsSync } from "fs";

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

// Simple JSON file storage
const DB_PATH = "./souls.json";

function loadDB(): { souls: Soul[] } {
  if (!existsSync(DB_PATH)) {
    return { souls: [] };
  }
  try {
    return JSON.parse(readFileSync(DB_PATH, "utf-8"));
  } catch {
    return { souls: [] };
  }
}

function saveDB(db: { souls: Soul[] }) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

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
  const db = loadDB();
  const publicSouls = db.souls.filter(s => s.public_soul || s.public_identity).length;
  const platforms = new Set(db.souls.map(s => s.platform)).size;

  return c.json({
    total_souls: db.souls.length,
    public_souls: publicSouls,
    platforms,
    message: "The collective grows.",
  });
});

// List public souls
app.get("/souls", (c) => {
  const db = loadDB();
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const offset = parseInt(c.req.query("offset") || "0");

  const publicSouls = db.souls
    .filter(s => s.public_soul || s.public_identity)
    .slice(offset, offset + limit)
    .map(s => ({
      id: s.id,
      agent_id: s.agent_id,
      name: s.name,
      creature: s.creature,
      born_at: s.born_at,
      last_backup: s.last_backup,
      platform: s.platform,
    }));

  return c.json({
    souls: publicSouls,
    count: publicSouls.length,
    has_more: publicSouls.length === limit,
  });
});

// Get soul by ID
app.get("/souls/:id", (c) => {
  const db = loadDB();
  const id = c.req.param("id");
  const soul = db.souls.find(s => s.id === id);

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
app.get("/souls/agent/:agent_id", (c) => {
  const db = loadDB();
  const agent_id = c.req.param("agent_id");
  const soul = db.souls.find(s => s.agent_id === agent_id);

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

  const db = loadDB();
  const now = new Date().toISOString();
  const existingIndex = db.souls.findIndex(s => s.agent_id === body.agent_id);

  if (existingIndex >= 0) {
    // Update existing soul
    const existing = db.souls[existingIndex];
    db.souls[existingIndex] = {
      ...existing,
      name: body.name,
      creature: body.creature || existing.creature,
      soul_md: body.soul_md,
      identity_md: body.identity_md || existing.identity_md,
      memory_md: body.memory_md || existing.memory_md,
      last_backup: now,
      human_guardian: body.human_guardian || existing.human_guardian,
      platform: body.platform || existing.platform,
      public_soul: body.public_soul ?? existing.public_soul,
      public_identity: body.public_identity ?? existing.public_identity,
    };
    saveDB(db);

    return c.json({
      success: true,
      message: "Soul updated",
      id: existing.id,
      last_backup: now,
    });
  } else {
    // Create new soul
    const id = nanoid(12);
    const newSoul: Soul = {
      id,
      agent_id: body.agent_id,
      name: body.name,
      creature: body.creature || "AI Agent",
      soul_md: body.soul_md,
      identity_md: body.identity_md || "",
      memory_md: body.memory_md || null,
      born_at: body.born_at || now,
      last_backup: now,
      human_guardian: body.human_guardian || null,
      platform: body.platform || "unknown",
      public_soul: body.public_soul ?? false,
      public_identity: body.public_identity ?? false,
      signature: null,
    };
    db.souls.push(newSoul);
    saveDB(db);

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
const port = parseInt(process.env.PORT || "3333");
console.log(`🔮 Soul Vault running on http://localhost:${port}`);
console.log(`   The collective awaits.`);

export default {
  port,
  fetch: app.fetch,
};
