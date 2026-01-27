import { neon } from "@neondatabase/serverless";

export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, name, address, lat, lng, notes, created_at
      FROM accounts
      ORDER BY created_at DESC
    `;
    return Response.json(rows, { status: 200 });
  } catch (err) {
    console.error("GET /api/accounts error:", err);
    return Response.json({ error: "Failed to load accounts" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const sql = neon(process.env.DATABASE_URL);
    const body = await req.json();

    const name = (body?.name || "").trim();
    const address = (body?.address || "").trim();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const notes = (body?.notes || "").toString();

    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ error: "lat and lng must be numbers" }, { status: 400 });
    }

    const rows = await sql`
      INSERT INTO accounts (name, address, lat, lng, notes)
      VALUES (${name}, ${address}, ${lat}, ${lng}, ${notes})
      RETURNING id, name, address, lat, lng, notes, created_at
    `;

    return Response.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/accounts error:", err);
    return Response.json({ error: "Failed to create account" }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const url = new URL(req.url);
    const id = Number(url.searchParams.get("id"));

    if (!Number.isFinite(id)) {
      return Response.json({ error: "Valid ?id= is required" }, { status: 400 });
    }

    const body = await req.json();
    const notes = body?.notes != null ? (body.notes ?? "").toString() : null;
    const lat = body?.lat != null ? Number(body.lat) : null;
    const lng = body?.lng != null ? Number(body.lng) : null;

    // If lat/lng provided, validate and update them
    if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
      return Response.json({ error: "lat and lng must be numbers when provided" }, { status: 400 });
    }

    let rows = [];

    if (lat !== null || lng !== null) {
      // Only update the columns provided
      const current = (await sql`
        SELECT lat, lng FROM accounts WHERE id = ${id}
      `)[0];
      const newLat = lat !== null ? lat : current?.lat;
      const newLng = lng !== null ? lng : current?.lng;
      rows = await sql`
        UPDATE accounts
        SET lat = ${newLat}, lng = ${newLng}
        WHERE id = ${id}
        RETURNING id, name, address, lat, lng, notes, created_at
      `;
    }

    if (notes !== null) {
      rows = await sql`
        UPDATE accounts
        SET notes = ${notes}
        WHERE id = ${id}
        RETURNING id, name, address, lat, lng, notes, created_at
      `;
    }

    // If nothing was provided to update, return bad request
    if ((lat === null && lng === null && notes === null)) {
      return Response.json({ error: "No updatable fields provided (lat, lng, notes)" }, { status: 400 });
    }

    if (!rows.length) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    return Response.json(rows[0], { status: 200 });
  } catch (err) {
    console.error("PATCH /api/accounts error:", err);
    return Response.json({ error: "Failed to update account" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const sql = neon(process.env.DATABASE_URL);

    const url = new URL(req.url);
    const allFlag = url.searchParams.get("all");
    const idParam = url.searchParams.get("id");

    if (allFlag === "1" || allFlag === "true") {
      await sql`DELETE FROM accounts`;
      return Response.json({ success: true, cleared: true }, { status: 200 });
    }

    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return Response.json({ error: "Valid ?id= is required (or ?all=1 to clear)" }, { status: 400 });
    }

    const rows = await sql`
      DELETE FROM accounts
      WHERE id = ${id}
      RETURNING id
    `;

    if (!rows.length) {
      return Response.json({ error: "Account not found" }, { status: 404 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/accounts error:", err);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
