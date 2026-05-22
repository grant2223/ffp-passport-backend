# FFP Passport — Complete Deployment Checklist

Use this checklist to go from "backend broken" to "fully live" on Railway.

---

## 🟢 Prerequisites (MUST COMPLETE FIRST)

- [ ] **Supabase** account + project set up
  - Project URL copied → will be `SUPABASE_URL`
  - Service role key copied → will be `SUPABASE_SERVICE_KEY`
  - Database schema imported (from `supabase/migrations/001_schema.sql`)
  - See: `README.md` in backend folder

- [ ] **Resend** account + API key
  - API key copied → will be `SMTP_PASS`
  - Domain verified (or use test domain)
  - See: `README.md` in backend folder

- [ ] **GitHub** account
  - Will use to deploy backend to Railway

---

## 🟡 Deploy Backend to Railway

1. **Prepare backend folder**
   - [ ] Copy `ffp-passport-backend` folder to your computer
   - [ ] Open terminal in that folder
   - [ ] Run: `git init` (initialize git)

2. **Push to GitHub**
   - [ ] Create a new repo on GitHub: `ffp-passport-backend`
   - [ ] Run these commands in your `ffp-passport-backend` folder:
     ```bash
     git add .
     git commit -m "Initial commit: FFP Passport backend for Railway"
     git remote add origin https://github.com/YOUR_USERNAME/ffp-passport-backend.git
     git branch -M main
     git push -u origin main
     ```

3. **Connect to Railway**
   - [ ] Go to **railway.app** → Sign in with GitHub
   - [ ] Click **New Project** → **Deploy from GitHub**
   - [ ] Select your `ffp-passport-backend` repo
   - [ ] Click **Deploy**
   - [ ] Wait for build to complete (watch the logs)

4. **Set Environment Variables in Railway**
   - [ ] Go to your Railway project dashboard
   - [ ] Click **Variables** tab
   - [ ] Add these variables:
     ```
     SUPABASE_URL=https://your-project.supabase.co
     SUPABASE_SERVICE_KEY=your-service-key-here
     SMTP_HOST=smtp.resend.com
     SMTP_USER=resend
     SMTP_PASS=your-resend-api-key-here
     ```
   - [ ] Click **Redeploy** after adding variables

5. **Get Your Railway URL**
   - [ ] Go to **Deployments** tab
   - [ ] Click the latest deployment
   - [ ] Copy the **Public URL** (e.g., `https://ffp-passport-backend-production-xxx.railway.app`)
   - [ ] Save this URL — you need it for the next step!

---

## 🟡 Update Frontend HTML

1. **Open login.html** (from `ffp-netlify-drop` folder)

2. **Add API_BASE_URL at the top of the first <script> tag:**
   ```js
   const API_BASE_URL = 'https://YOUR_RAILWAY_URL_HERE';
   // Replace YOUR_RAILWAY_URL_HERE with your actual Railway URL
   ```

3. **Find and replace all hardcoded URLs:**
   - [ ] Search for: `https://ffp-passport-backend.vercel.app`
   - [ ] Replace with: Your Railway URL
   - [ ] Or replace with: `API_BASE_URL` variable (recommended)

4. **Check these specific lines:**
   - [ ] Line ~302: `requestCode` function (signup/signin)
   - [ ] Line ~371: `verifyCode` function (signin)
   - [ ] Any line with `/api/auth/reset`

5. **Do the same for other HTML files:**
   - [ ] `ffp-member-dashboard.html`
   - [ ] `ffp-provider.html`
   - [ ] `ffp-admin.html`
   - (Search each for `ffp-passport-backend.vercel.app` and replace)

---

## 🟡 Deploy Frontend to Netlify

1. **Open netlify.com/drop** (in your browser)

2. **Drag your updated `ffp-netlify-drop` folder onto the page**
   - [ ] Or drag the zip file
   - [ ] Wait for upload to complete

3. **Your site is now live!**
   - [ ] Netlify gives you a URL like: `https://ffp-netlify-drop.netlify.app`
   - [ ] Click it to test

---

## 🟢 Testing

### Test the auth flow:

1. [ ] Open your Netlify site
2. [ ] Click **"Sign up"**
3. [ ] Enter a real email address (you need to check it!)
4. [ ] Click **"Send code"**
5. [ ] Check your email for the 6-digit code
6. [ ] Enter the code and click **"Sign in"**
7. [ ] You should see the **Member Dashboard** ✅

### If something breaks:

Open the browser console: **F12 → Console**

Look for errors like:
- `fetch failed` → Railway URL might be wrong
- `CORS error` → See `RAILWAY_SETUP.md` troubleshooting
- `401 Unauthorized` → Supabase credentials might be wrong

---

## 🟢 Post-Launch

### Create your admin account

Currently anyone can sign up. To create an **admin account**, you need to insert directly into Supabase:

1. Go to **supabase.com** → Your project → **SQL Editor**
2. Run this query:
   ```sql
   INSERT INTO members (email, full_name, access_code, role, passport_no, status) 
   VALUES ('your@email.com', 'Your Name', 'admin_code_hash_here', 'admin', 'FFP-ADMIN-001', 'active');
   ```

Or use the Supabase **Table Editor** to add a row manually.

### Monitor your API

In **railway.app**, click **Logs** to see:
- [ ] Successful signups (log entries showing `sendCodeEmail`)
- [ ] Any errors (red log lines)

### (Optional) Add a custom domain

For Netlify:
1. Go to your site settings
2. Domain management → Add custom domain
3. Update DNS to point to Netlify

For Railway: Check their docs at **railway.app/docs/deploy/your-project**

---

## 📋 Quick Reference

| Service | What it does | Free tier | Status |
|---------|-------------|-----------|--------|
| **Railway** | Runs your API server | ✅ 500hrs/mo | Backend |
| **Netlify** | Hosts your HTML files | ✅ 100GB/mo | Frontend |
| **Supabase** | Database (Postgres) | ✅ 500MB | Data storage |
| **Resend** | Sends emails | ✅ 3,000/mo | Auth codes |

All free at launch. Total cost: **$0/month** until ~500 active users.

---

## 🚀 You're Done!

If you got here and everything works:

1. ✅ Backend running on Railway
2. ✅ Frontend on Netlify calling Railway
3. ✅ Auth flow working (signup → email code → signin)
4. ✅ Database storing members

**FFP Passport is LIVE.** 

Next: Test with real members, collect feedback, iterate. 🎉

---

## Still stuck?

1. Read `RAILWAY_SETUP.md` (detailed Railway guide)
2. Read `UPDATE_FRONTEND.md` (detailed frontend update guide)
3. Read `LOGIN_HTML_UPDATE.md` (exact code snippets)
4. Check **TROUBLESHOOTING** section of each guide

Questions? Check the logs:
- **Railway**: Project → Logs
- **Browser console**: F12 → Console
- **Netlify**: Site → Deploys → Click latest → Logs

Good luck! 🚀
