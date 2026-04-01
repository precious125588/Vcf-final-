import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = "080205";

if (!process.env.DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contacts (
      id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      name        TEXT NOT NULL,
      country_code TEXT NOT NULL,
      phone       TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ,
      UNIQUE (country_code, phone)
    )
  `);
  console.log("Database ready.");
}

function requireAdmin(req, res, next) {
  const pw = req.headers["x-admin-password"] || req.query["pw"];
  if (pw !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));

// PUBLIC: total count only
app.get("/api/contacts", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT COUNT(*) AS total FROM contacts");
    res.json({ total: parseInt(rows[0].total, 10) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// PUBLIC: add a contact
app.post("/api/contacts", async (req, res) => {
  const { name, countryCode, phone } = req.body;
  if (!name || !countryCode || !phone) {
    return res.status(400).json({ error: "name, countryCode, and phone are required" });
  }
  const cleanPhone = String(phone).replace(/\s+/g, "");
  try {
    const { rows } = await pool.query(
      `INSERT INTO contacts (name, country_code, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, country_code AS "countryCode", phone, created_at AS "createdAt"`,
      [String(name), String(countryCode), cleanPhone]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This phone number already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: get all contacts
app.get("/api/admin/contacts", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, country_code AS "countryCode", phone,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM contacts ORDER BY created_at ASC`
    );
    res.json({ contacts: rows, total: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: edit a contact
app.patch("/api/admin/contacts/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, countryCode, phone } = req.body;
  try {
    const existing = await pool.query("SELECT * FROM contacts WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }
    const cur = existing.rows[0];
    const updatedName = name !== undefined ? String(name) : cur.name;
    const updatedCountry = countryCode ? String(countryCode) : cur.country_code;
    const updatedPhone = phone ? String(phone).replace(/\s+/g, "") : cur.phone;

    const { rows } = await pool.query(
      `UPDATE contacts
       SET name = $1, country_code = $2, phone = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING id, name, country_code AS "countryCode", phone,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [updatedName, updatedCountry, updatedPhone, id]
    );
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This phone number already exists" });
    }
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: delete a contact
app.delete("/api/admin/contacts/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM contacts WHERE id = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Contact not found" });
    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: delete ALL contacts
app.delete("/api/admin/contacts", requireAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM contacts");
    return res.sendStatus(204);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// ADMIN: download VCF
app.get("/api/admin/contacts/vcf", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT name, country_code, phone FROM contacts ORDER BY created_at ASC"
    );
    const lines = [];
    for (const c of rows) {
      lines.push("BEGIN:VCARD");
      lines.push("VERSION:3.0");
      lines.push(`FN:${c.name}`);
      lines.push(`TEL;TYPE=CELL:${c.country_code}${c.phone}`);
      lines.push("END:VCARD");
    }
    res.setHeader("Content-Type", "text/vcard");
    res.setHeader("Content-Disposition", "attachment; filename=contacts.vcf");
    return res.send(lines.join("\r\n"));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// SPA fallback
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`VCF Collector running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
