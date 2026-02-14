# Multi-User Setup Guide

This app now supports multiple user accounts with separate saved data for each user.

## Installation Steps

### 1. Install bcryptjs dependency

```bash
npm install bcryptjs
```

### 2. Create database tables

Connect to your Neon database and run the SQL from `schema.sql`:

```bash
# Using psql
psql $DATABASE_URL < schema.sql

# Or copy/paste the contents from schema.sql into your Neon SQL editor
```

Or manually create the tables:

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  address VARCHAR(255),
  lat FLOAT,
  lng FLOAT,
  notes JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, id)
);

CREATE INDEX idx_accounts_user_id ON accounts(user_id);
CREATE INDEX idx_users_username ON users(username);
```

### 3. Update other API routes

If you have other API routes that save/retrieve data (saved routes, notes, etc.), update them to filter by user ID:

```javascript
import { getUserIdFromRequest } from "@/lib/auth";

export async function GET(request) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Filter by user_id in your queries
  const rows = await sql`
    SELECT * FROM saved_routes
    WHERE user_id = ${userId}
  `;
  
  return Response.json(rows, { status: 200 });
}
```

### 4. Redeploy to Vercel

```bash
git add .
git commit -m "Add multi-user authentication with separate data per user"
git push
```

Your deployment will automatically pick up the changes.

## Features

✅ **Per-user accounts**
- Each user has their own username/password
- Passwords are hashed with bcrypt (never stored in plain text)

✅ **Data isolation**
- Saved accounts are only visible to the user who saved them
- Notes, routes, and other data are private to each user
- Users cannot see other users' data

✅ **User authentication**
- Session-based login with 7-day cookies
- Users can sign up new accounts
- Existing users can sign in

## Routes

### Authentication
- `POST /api/auth/login` - Sign in with username/password
- `POST /api/auth/signup` - Create new account
- `POST /api/auth/logout` - Sign out

### User Data (filtered by user_id)
- `GET /api/accounts` - Get user's saved accounts
- `POST /api/accounts` - Save new account
- `PATCH /api/accounts` - Update account
- `DELETE /api/accounts?id=...` - Delete account
- Similar filtering for routes, notes, etc.

## Security Notes

1. **Passwords**: Hashed with bcrypt (cost factor 10)
2. **Sessions**: HttpOnly cookies, can't be accessed by JavaScript
3. **Data**: Filtered by user_id on all queries
4. **CORS**: Add CORS headers if needed for external requests

## Troubleshooting

### "Unauthorized" error
- Make sure user is logged in
- Check that auth-token cookie is set
- Verify user_id in cookie matches database user

### "Unique constraint violation" on accounts
- This error is expected when schema was updated
- Drop old accounts table and recreate with user_id:
  ```sql
  DROP TABLE accounts;
  -- Then run schema.sql
  ```

### Forgot password?
- Currently not implemented (can be added)
- Users can sign up with a new account
- Or admin can reset password directly in database
