# FFP Passport — Backend Setup Guide

## Stack
- **Frontend**: Static HTML on Netlify
- **Auth & Database**: Supabase (free tier)
- **API**: Vercel Serverless Functions
- **Email**: Resend (free tier — 3,000 emails/month)

---

## Step 1 — Supabase (database + auth)

1. Go to **supabase.com** → New project
2. Name it `ffp-passport`, choose region `Middle East (Bahrain)`
3. Once created, go to **SQL Editor** → New query
4. Paste the contents of `supabase/migrations/001_schema.sql` → Run
5. Go to **Settings → API** and copy:
   - `Project URL` → paste as `SUPABASE_URL` in .env
   - `service_role` key → paste as `SUPABASE_SERVICE_KEY` in .env

---

## Step 2 — Resend (email sending)

1. Go to **resend.com** → Create account (free)
2. Add your domain (or use their test domain first)
3. Go to **API Keys** → Create API key
4. Paste as `SMTP_PASS` in .env
5. Update `from:` email in `api/auth.js` to your verified domain

---

## Step 3 — Vercel (API hosting)

1. Install Vercel CLI: `npm i -g vercel`
2. In this folder: `npm install`
3. Copy `.env.example` to `.env` and fill in all values
4. Run `vercel` to deploy (follow prompts, link to your account)
5. Add environment variables in Vercel dashboard → Settings → Environment Variables
   (copy each line from your .env)
6. Your API will be live at `https://your-project.vercel.app/api/...`

---

## Step 4 — Connect frontend to backend

In each HTML file, find the auth calls and replace the demo mode with real API calls.

### Login page (index.html) — replace `requestCode` and `verifyCode`:

```js
// Sign up
async function requestCode(flow) {
  const email = document.getElementById(flow + '-email').value;
  const name  = document.getElementById('signup-name')?.value || '';
  const res = await fetch('https://YOUR_VERCEL_URL/api/auth/' + (flow === 'signup' ? 'signup' : 'signin'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, full_name: name })
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  // proceed to code entry screen
}

// Sign in — verify code
async function verifyCode(flow) {
  const email = document.getElementById('signin-email').value;
  const code  = [...document.querySelectorAll('#screen-signin-code .code-digit')]
                  .map(d => d.value).join('');
  const res = await fetch('https://YOUR_VERCEL_URL/api/auth/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code })
  });
  const data = await res.json();
  if (data.error) { alert(data.error); return; }
  localStorage.setItem('ffp_member', JSON.stringify(data.member));
  localStorage.setItem('ffp_token', data.token);
  window.location.href = data.redirect;
}
```

---

## Step 5 — Netlify (frontend hosting)

1. Go to **netlify.com/drop**
2. Drag the `ffp-netlify-drop` folder (or the zip) onto the page
3. Your site is live instantly at a `*.netlify.app` URL
4. To add custom domain: Site settings → Domain management → Add custom domain
   - Add `passport.findFitpeople.com` or `ffp.findFitpeople.com`
   - Update your DNS: add a CNAME pointing to your Netlify URL

---

## Architecture

```
User (mobile browser)
  │
  ├─→ Netlify CDN (HTML files — static, instant load)
  │     index.html (login)
  │     ffp-member-dashboard.html
  │     ffp-provider.html
  │     ffp-admin.html
  │
  └─→ Vercel API (auth + data)
        POST /api/auth/signup    → creates member, emails code
        POST /api/auth/signin    → verifies email + code, returns session
        POST /api/auth/reset     → generates new code, emails it
        POST /api/calorie/save   → saves daily calorie log
        POST /api/visits/log     → logs provider visit/QR scan
              │
              └─→ Supabase (Postgres database)
                    members table
                    providers table
                    deals table
                    visit_logs table
                    calorie_logs table
```

---

## Estimated monthly cost at launch (free tiers)

| Service  | Free tier              | Paid from      |
|----------|------------------------|----------------|
| Netlify  | 100GB bandwidth/mo     | $19/mo         |
| Supabase | 500MB DB, 2GB storage  | $25/mo         |
| Vercel   | 100GB bandwidth/mo     | $20/mo         |
| Resend   | 3,000 emails/mo        | $20/mo (50k)   |

**Free until ~500+ active users.** All free tiers are generous for launch.
