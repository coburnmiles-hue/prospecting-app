# Security Setup Guide

This app now includes password protection and AI scraper blocking.

## Setup Steps

### 1. Set Your Password (Local Development)
Edit `.env.local` and change the password:
```
APP_PASSWORD=your-secure-password-here
```

### 2. Deploy to Vercel

#### Add Environment Variable:
1. Go to [vercel.com](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add:
   - **Name**: `APP_PASSWORD`
   - **Value**: Your secure password
   - **Environments**: Production, Preview, Development
5. Click **Save**
6. Redeploy your app (or push a new commit to trigger deployment)

### 3. Test the Protection

After deploying:
1. Visit your Vercel URL
2. You should see a login page
3. Enter your password from `APP_PASSWORD`
4. You'll be logged in for 7 days

## What's Protected?

### ✅ Password Protection
- All pages require login (except `/login` itself)
- Session lasts 7 days
- Logout available via API: `POST /api/auth/logout`

### ✅ AI Scraper Blocking
- `robots.txt` blocks GPT, Claude, Perplexity, and other AI bots
- Meta tags prevent indexing by search engines
- Prevents your data from being used for AI training

## Additional Security Options

### Option A: Vercel Password Protection (Easiest - Requires Pro Plan)
1. Go to your project settings in Vercel
2. **Deployment Protection** → Enable "Password Protection"
3. Set a password
4. This works at the Vercel edge level (faster than middleware)

### Option B: Make Repository Private
1. Go to GitHub repo → Settings → Danger Zone
2. **Change visibility** → Make private
3. Note: This only hides the code, not the deployed site

### Option C: IP Allowlist (Enterprise)
For enterprise plans, you can restrict by IP address in Vercel settings.

## How to Add Logout Button

Add this to your ProspectingApp.jsx header:

```jsx
<button
  onClick={async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }}
  className="text-sm text-slate-400 hover:text-white"
>
  Logout
</button>
```

## Testing Locally

1. Restart your dev server: `npm run dev`
2. Visit `http://localhost:3000`
3. You should see the login page
4. Use the password from your `.env.local` file
