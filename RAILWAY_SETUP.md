# FFP Passport — Railway Deployment Guide

**Status**: ✅ Backend is now Express-based and Railway-compatible  
**What changed**: Converted from Vercel serverless to Express server

---

## Quick Start (5 minutes)

### 1. **Ensure you have Supabase & Resend set up first**

Before deploying to Railway, you need:
- ✅ **Supabase** database (free tier at supabase.com)
- ✅ **Resend** email service (free tier at resend.com)
- ✅ Your environment variables ready

See `README.md` in the backend folder for Supabase/Resend setup.

---

## Deploy to Railway

### Step 1: Push backend to GitHub

```bash
# In ffp-passport-backend folder
cd ffp-passport-backend

# Initialize git if not already done
git init
git add .
git commit -m "FFP Passport backend for Railway"

# Push to your GitHub repo
git remote add origin https://github.com/YOUR_USERNAME/ffp-passport-backend.git
git branch -M main
git push -u origin main
```

### Step 2: Connect to Railway

1. Go to **railway.app** (sign in with GitHub)
2. Click **New Project** → **Deploy from GitHub**
3. Select your `ffp-passport-backend` repo
4. **Confirm** the deployment

Railway will auto-detect `package.json` and start building.

### Step 3: Set Environment Variables

Once building, go to your **Project** → **Variables** tab and add:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY
SMTP_HOST=smtp.resend.com
SMTP_USER=resend
SMTP_PASS=YOUR_RESEND_API_KEY
```

Copy these values from:
- **Supabase**: Settings → API
- **Resend**: API Keys

Press **Redeploy** after adding variables.

### Step 4: Get Your Railway URL

Once deployed, go to **Project** → **Deployments** → Click the latest deployment.

Copy your **Public URL**. It will look like:
```
https://ffp-passport-backend-production-xxxx.railway.app
```

**Save this URL** — you need it for the frontend.

---

## Update the Frontend

Once your Railway API is live, update the Netlify HTML pages.

### In login.html (or any HTML that calls the auth API)

Find these lines:

```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/signup', {
```

And replace `https://ffp-passport-backend.vercel.app` with your **Railway URL**:

```js
fetch('https://ffp-passport-backend-production-xxxx.railway.app/api/auth/signup', {
```

### Do the same for all API calls:
- `/api/auth/signup`
- `/api/auth/signin`
- `/api/auth/reset`
- `/api/calorie/save`
- `/api/visits/log`

Or, use an **environment variable** (recommended):

At the top of your HTML, add:

```html
<script>
  const API_URL = 'https://ffp-passport-backend-production-xxxx.railway.app';
</script>
```

Then replace all hardcoded URLs with:

```js
fetch(API_URL + '/api/auth/signup', {
```

### Re-upload to Netlify

1. Go to **netlify.com/drop**
2. Drag the updated `ffp-netlify-drop` folder onto the page
3. Your frontend will now call your Railway backend ✅

---

## Testing

### Test your API directly:

```bash
# Sign up
curl -X POST https://YOUR_RAILWAY_URL/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","full_name":"Test User"}'

# Sign in (use the 6-digit code from the email)
curl -X POST https://YOUR_RAILWAY_URL/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'
```

### Test from your frontend:

1. Open your Netlify site
2. Try signing up with an email
3. Check the email for the access code
4. Sign in with the code

If you see the member dashboard, **you're live!** 🎉

---

## Troubleshooting

### "Cannot POST /api/auth/signup" error

- Check your **Railway URL** — make sure you copied it correctly
- Make sure the URL does NOT have a trailing `/`
- Check environment variables in Railway dashboard

### Email not sending

- Go to **Resend** → **Settings** → Verify your domain
- Check that `SMTP_PASS` is your **API key**, not a password
- Look at Railway logs: **Project** → **Logs** → Search for "sendMail"

### CORS errors in browser console

In `server.js`, update the CORS origin (currently allows all):

```js
app.use(cors({
  origin: process.env.FRONTEND_URL || '*'
}));
```

### "Deployment failed" or "No start script"

Railway looks for:
1. `npm start` in package.json ✅ (we have this)
2. `Procfile` (optional)
3. Port listening on `process.env.PORT` ✅ (we have this)

If still failing, check **Build Logs** in Railway dashboard.

---

## Architecture (after Railway setup)

```
User (mobile browser)
  │
  ├─→ Netlify CDN (static HTML, instant)
  │     index.html (login)
  │     ffp-member-dashboard.html
  │     ffp-provider.html
  │     ffp-admin.html
  │
  └─→ Railway API (persistent Node.js server)
        POST /api/auth/signup, signin, reset
        POST /api/calorie/save
        POST /api/visits/log
              │
              └─→ Supabase (Postgres database)
```

---

## Cost (Railway)

- **Railway**: Free tier includes 500 hours/month of compute
  - FFP runs on ~10MB RAM, costs ~$0/month at launch
  - Paid tier starts at $5/month (unlimited)
- **Supabase**: Free tier (500MB DB)
- **Resend**: Free tier (3,000 emails/month)
- **Netlify**: Free tier (100GB bandwidth)

**Total**: Free until scale → ~$5/month after.

---

## What's different from Vercel?

| Feature | Vercel | Railway |
|---------|--------|---------|
| **Scaling** | Auto (pay per use) | Fixed compute size |
| **Cold starts** | 100ms+ (serverless) | Instant (always on) |
| **Cost** | $20+/month | Free-$5/month |
| **Setup** | Drag-and-drop | GitHub integration |
| **Best for** | Sporadic traffic | Always-on API |

FFP Passport is **always-on** (users check in all day), so **Railway is a better fit**.

---

## Next Steps

1. ✅ Deploy backend to Railway
2. ✅ Update frontend API URLs  
3. ✅ Test signup/signin flow
4. ✅ Monitor logs in Railway dashboard
5. Create admin account (manually insert into Supabase)
6. Launch 🚀

Need help? Check Railway docs at **railway.app/docs** or this guide's troubleshooting section.
