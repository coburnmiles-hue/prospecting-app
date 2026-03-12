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

function parseNotesObject(raw) {
  let notesObj = { notes: [], followups: [] };
  try {
    const parsed = JSON.parse(raw || "");
    if (parsed && typeof parsed === 'object') {
      notesObj = {
        ...parsed,
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        followups: Array.isArray(parsed.followups) ? parsed.followups : [],
      };
    }
  } catch {
    if (raw && raw.startsWith("KEY:")) {
      notesObj = { key: raw, notes: [], followups: [] };
    }
  }
  return notesObj;
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
    if (!row) return Response.json({ notes: [], followups: [] }, { status: 200 });

    const notesObj = parseNotesObject(row.notes || "");
    return Response.json({ notes: notesObj.notes, followups: notesObj.followups }, { status: 200 });
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
    const entryType = body?.entry_type === 'followup' ? 'followup' : 'activity';
    const followUpRaw = body?.follow_up_at != null ? String(body.follow_up_at).trim() : "";
    const followUpNote = body?.follow_up_note != null ? String(body.follow_up_note).trim() : "";

    if (!Number.isFinite(accountId) || !text) {
      return Response.json({ error: "accountId and text are required" }, { status: 400 });
    }

    let followUpAt = null;
    if (followUpRaw) {
      const parsedFollowUp = new Date(followUpRaw);
      if (!Number.isFinite(parsedFollowUp.getTime())) {
        return Response.json({ error: "follow_up_at must be a valid date/time" }, { status: 400 });
      }
      followUpAt = parsedFollowUp.toISOString();
    }

    const row = await readNotesRow(sql, accountId, userId);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });

    const now = new Date();
    const nowIso = now.toISOString();
    // compute local date (YYYY-MM-DD) by adjusting for timezone offset
    const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().slice(0,10);
    const notesObj = parseNotesObject(row.notes || "");

    if (entryType === 'followup') {
      if (!followUpAt) {
        return Response.json({ error: "follow_up_at is required for followup entries" }, { status: 400 });
      }

      const newFollowup = {
        id: Date.now() + Math.random(),
        text,
        follow_up_at: followUpAt,
        follow_up_note: followUpNote || text,
        completed: false,
        completed_at: null,
        created_at: nowIso,
        created_local_date: localDate,
        account_id: accountId,
      };

      notesObj.followups.unshift(newFollowup);
    } else {
      const newNote = {
        id: Date.now() + Math.random(),
        text,
        activity_type,
        created_at: nowIso,
        created_local_date: localDate,
        account_id: accountId,
      };
      notesObj.notes.unshift(newNote);
    }

    await sql`
      UPDATE accounts
      SET notes = ${JSON.stringify(notesObj)}
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    return Response.json({ notes: notesObj.notes, followups: notesObj.followups }, { status: 200 });
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

    const notesObj = parseNotesObject(row.notes || "");

    notesObj.notes = (notesObj.notes || []).filter((n) => Number(n.id) !== Number(noteId));

    await sql`
      UPDATE accounts
      SET notes = ${JSON.stringify(notesObj)}
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    return Response.json({ notes: notesObj.notes, followups: notesObj.followups }, { status: 200 });
  } catch (err) {
    console.error("DELETE /api/notes error:", err);
    return Response.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const userId = await getUserIdFromRequest(req);

    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const body = await req.json();
    const accountId = Number(body?.accountId);
    const followupId = Number(body?.followupId);
    const complete = body?.complete === true;

    if (!Number.isFinite(accountId) || !Number.isFinite(followupId)) {
      return Response.json({ error: "accountId and followupId are required" }, { status: 400 });
    }

    const row = await readNotesRow(sql, accountId, userId);
    if (!row) return Response.json({ error: "Account not found" }, { status: 404 });

    const notesObj = parseNotesObject(row.notes || "");
    notesObj.followups = (notesObj.followups || []).map((followup) => {
      if (Number(followup?.id) !== Number(followupId)) return followup;
      return {
        ...followup,
        completed: complete,
        completed_at: complete ? new Date().toISOString() : null,
      };
    });

    await sql`
      UPDATE accounts
      SET notes = ${JSON.stringify(notesObj)}
      WHERE id = ${accountId} AND user_id = ${userId}
    `;

    return Response.json({ notes: notesObj.notes, followups: notesObj.followups }, { status: 200 });
  } catch (err) {
    console.error("PATCH /api/notes error:", err);
    return Response.json({ error: "Failed to update followup" }, { status: 500 });
  }
}
