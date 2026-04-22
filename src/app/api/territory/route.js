import { neon } from "@neondatabase/serverless";
import { getUserIdFromRequest } from "@/lib/auth";

const TABC_URL = "https://data.texas.gov/resource/7hf9-qc9f.json";
const LICENSE_TYPES = ["BE", "BG", "MB", "N", "NB", "NE", "BW"];

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS user_territory (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      zip_codes JSONB NOT NULL DEFAULT '[]',
      last_searched_at TIMESTAMP,
      results JSONB NOT NULL DEFAULT '[]',
      acknowledged_ids JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

async function searchZips(zipCodes) {
  if (!zipCodes || zipCodes.length === 0) return [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const dateFilter = thirtyDaysAgo.toISOString().split("T")[0];

  const licenseFilter = LICENSE_TYPES.map((t) => `license_type='${t}'`).join(" OR ");
  const zipFilter = zipCodes.map((z) => `zip='${z}'`).join(" OR ");
  const where = `(${zipFilter}) AND (${licenseFilter}) AND original_issue_date > '${dateFilter}'`;
  const query = `?$where=${encodeURIComponent(where)}&$order=original_issue_date DESC&$limit=500`;

  try {
    const res = await fetch(`${TABC_URL}${query}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map((item) => ({
      id: item.license_id || `${item.trade_name || "unknown"}-${item.zip || ""}`,
      name: item.trade_name || "Unknown",
      address: item.address || "",
      city: item.city || "",
      zip: item.zip || "",
      license_type: item.license_type || "",
      issue_date: item.original_issue_date || "",
      source: "TABC License",
    }));
  } catch {
    return [];
  }
}

// GET — return territory config, results, acknowledged ids
export async function GET(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL);
    await ensureTable(sql);

    const rows = await sql`
      SELECT zip_codes, last_searched_at, results, acknowledged_ids
      FROM user_territory
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const row = rows[0] || {
      zip_codes: [],
      last_searched_at: null,
      results: [],
      acknowledged_ids: [],
    };

    const results = Array.isArray(row.results) ? row.results : [];
    const acknowledgedIds = Array.isArray(row.acknowledged_ids) ? row.acknowledged_ids : [];
    const unacknowledgedCount = results.filter((r) => !acknowledgedIds.includes(r.id)).length;

    return Response.json({
      zip_codes: Array.isArray(row.zip_codes) ? row.zip_codes : [],
      last_searched_at: row.last_searched_at || null,
      results,
      acknowledged_ids: acknowledgedIds,
      unacknowledged_count: unacknowledgedCount,
    });
  } catch (err) {
    console.error("GET /api/territory error:", err);
    return Response.json({ error: "Failed to load territory" }, { status: 500 });
  }
}

// POST — update zip codes
export async function POST(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL);
    await ensureTable(sql);

    const body = await req.json();
    const zipCodes = Array.isArray(body.zip_codes)
      ? body.zip_codes.map((z) => z.toString().trim()).filter(Boolean)
      : [];

    await sql`
      INSERT INTO user_territory (user_id, zip_codes, updated_at)
      VALUES (${userId}, ${JSON.stringify(zipCodes)}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        zip_codes = ${JSON.stringify(zipCodes)},
        updated_at = NOW()
    `;

    return Response.json({ success: true, zip_codes: zipCodes });
  } catch (err) {
    console.error("POST /api/territory error:", err);
    return Response.json({ error: "Failed to update territory" }, { status: 500 });
  }
}

// PUT — trigger a fresh search
export async function PUT(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL);
    await ensureTable(sql);

    const rows = await sql`
      SELECT zip_codes, acknowledged_ids FROM user_territory WHERE user_id = ${userId} LIMIT 1
    `;

    const zipCodes = Array.isArray(rows[0]?.zip_codes) ? rows[0].zip_codes : [];
    if (zipCodes.length === 0) {
      return Response.json({ error: "No zip codes configured" }, { status: 400 });
    }

    const acknowledgedIds = Array.isArray(rows[0]?.acknowledged_ids) ? rows[0].acknowledged_ids : [];
    const results = await searchZips(zipCodes);

    await sql`
      UPDATE user_territory
      SET results = ${JSON.stringify(results)},
          last_searched_at = NOW(),
          updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    const unacknowledgedCount = results.filter((r) => !acknowledgedIds.includes(r.id)).length;

    return Response.json({
      results,
      last_searched_at: new Date().toISOString(),
      acknowledged_ids: acknowledgedIds,
      unacknowledged_count: unacknowledgedCount,
    });
  } catch (err) {
    console.error("PUT /api/territory error:", err);
    return Response.json({ error: "Failed to run territory search" }, { status: 500 });
  }
}

// PATCH — acknowledge an account
export async function PATCH(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL);
    const body = await req.json();
    const accountId = body?.id;
    if (!accountId) return Response.json({ error: "id is required" }, { status: 400 });

    const rows = await sql`
      SELECT acknowledged_ids, results FROM user_territory WHERE user_id = ${userId} LIMIT 1
    `;
    if (!rows[0]) return Response.json({ error: "Territory not found" }, { status: 404 });

    const acknowledgedIds = Array.isArray(rows[0].acknowledged_ids) ? [...rows[0].acknowledged_ids] : [];
    const results = Array.isArray(rows[0].results) ? rows[0].results : [];

    if (!acknowledgedIds.includes(accountId)) {
      acknowledgedIds.push(accountId);
    }

    await sql`
      UPDATE user_territory
      SET acknowledged_ids = ${JSON.stringify(acknowledgedIds)},
          updated_at = NOW()
      WHERE user_id = ${userId}
    `;

    const unacknowledgedCount = results.filter((r) => !acknowledgedIds.includes(r.id)).length;
    return Response.json({ success: true, acknowledged_ids: acknowledgedIds, unacknowledged_count: unacknowledgedCount });
  } catch (err) {
    console.error("PATCH /api/territory error:", err);
    return Response.json({ error: "Failed to acknowledge account" }, { status: 500 });
  }
}
