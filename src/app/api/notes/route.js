import { neon } from "@neondatabase/serverless";
import { getUserIdFromRequest } from "@/lib/auth";

async function readNotesRow(sql, accountId, userId) {
  const rows = await sql`
    SELECT id, notes
    FROM accounts
    WHERE id = ${accountId} AND user_id = ${userId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function GET(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const url = new URL(req.url);
    const accountId = Number(url.searchParams.get("accountId"));
    if (!Number.isFinite(accountId)) {
      return Response.json({ error: "Valid ?accountId= is required" }, { status: 400 });
    }

    const row = await readNotesRow(sql, accountId, userId);
    if (!row) return Response.json({ notes: [] }, { status: 200 });

    const raw = row.notes || "";
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.notes)) return Response.json({ notes: parsed.notes }, { status: 200 });
    } catch {}

    // legacy: notes may be simple string (e.g. KEY:...), return empty
    return Response.json({ notes: [] }, { status: 200 });
  } catch (err) {
    console.error("GET /api/notes error:", err);
    return Response.json({ error: "Failed to load notes" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const body = await req.json();
    const accountId = Number(body?.accountId);
    const text = (body?.text || "").toString().trim();
    const activity_type = body?.activity_type || "walk-in";

    if (!Number.isFinite(accountId) || !text) {
      return Response.json({ error: "accountId and text are required" }, { status: 400 });
    }

    const row = await readNotesRow(sql, accountId, userId);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });

    const now = new Date();
    const nowIso = now.toISOString();
    // compute local date (YYYY-MM-DD) by adjusting for timezone offset
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0,10);
    const newNote = {
      id: Date.now() + Math.random(),
      text,
      activity_type,
      created_at: nowIso,
      created_local_date: localDate,
      account_id: accountId,
    };

    let notesObj = { notes: [] };
    const raw = row.notes || "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.notes)) {
        notesObj = parsed;
      } else if (parsed && parsed.notes) {
        notesObj = { notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
      }
    } catch {
      // legacy string (e.g. KEY:...), preserve it as key
      if (raw && raw.startsWith("KEY:")) {
        notesObj = { key: raw, notes: [] };
      }
    }

    notesObj.notes.unshift(newNote);

    const updated = await sql`
      UPDATE accounts
      SET notes = ${JSON.stringify(notesObj)}
      WHERE id = ${accountId} AND user_id = ${userId}
      RETURNING id, notes
    `;

    return Response.json({ notes: notesObj.notes }, { status: 200 });
  } catch (err) {
    console.error("POST /api/notes error:", err);
    return Response.json({ error: "Failed to save note" }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const userId = await getUserIdFromRequest(req);
    
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const url = new URL(req.url);
    const accountId = Number(url.searchParams.get("accountId"));
    const noteId = Number(url.searchParams.get("noteId"));

    if (!Number.isFinite(accountId) || !Number.isFinite(noteId)) {
      return Response.json({ error: "accountId and noteId are required" }, { status: 400 });
    }

    const row = await readNotesRow(sql, accountId, userId);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });

    let notesObj = { notes: [] };
    const raw = row.notes || "";
    try {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.notes)) {
        notesObj = parsed;
      } else if (parsed && parsed.notes) {
        notesObj = { notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
      }
    } catch {
      if (raw && raw.startsWith("KEY:")) {
        notesObj = { key: raw, notes: [] };
      }
    }

    notesObj.notes = (notesObj.notes || []).filter((n) => Number(n.id) !== Number(noteId));

    await sql`
      UPDATE accounts
      SET notes = ${JSON.stringify(notesObj)}
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    return Response.json({ notes: notesObj.notes }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/notes error:", err);
    return Response.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
