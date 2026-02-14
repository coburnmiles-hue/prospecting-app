import { neon } from "@neondatabase/serverless";
import { getUserIdFromRequest } from "@/lib/auth";

export async function GET(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`
      SELECT id, name, route_data, created_at
      FROM saved_routes
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `;
    return Response.json(rows);
  } catch (error) {
    console.error('Error fetching saved routes:', error);
    return Response.json({ error: 'Failed to fetch routes' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const userId = await getUserIdFromRequest(request);
    
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, routeData } = body;

    if (!name || !routeData) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL);

    const result = await sql`
      INSERT INTO saved_routes (user_id, name, route_data)
      VALUES (${userId}, ${name}, ${JSON.stringify(routeData)})
      RETURNING id, name, route_data, created_at
    `;

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error saving route:', error);
    return Response.json({ error: 'Failed to save route' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return Response.json({ error: "Missing route ID" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM saved_routes WHERE id = ${id}`;

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error deleting route:', error);
    return Response.json({ error: 'Failed to delete route' }, { status: 500 });
  }
}
