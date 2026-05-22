# FFP Passport Frontend — Update API URLs

Your frontend HTML is currently hardcoded to call **Vercel**. You need to update it to call your **Railway** backend.

---

## The Problem

In `login.html` (and other pages), the API calls are hardcoded:

```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/signup', {
```

This won't work with Railway. You need to change it to your **Railway URL**.

---

## Solution: Update the Frontend

### Step 1: Find the API URL in login.html

Search for these lines in `login.html`:

```js
// Line ~302
fetch('https://ffp-passport-backend.vercel.app/api/auth/' + endpoint, {
```

and

```js
// Line ~371
fetch('https://ffp-passport-backend.vercel.app/api/auth/signin', {
```

### Step 2: Get Your Railway URL

After deploying to Railway, you'll have a URL like:

```
https://ffp-passport-backend-production-abc123.railway.app
```

Go to **railway.app** → Your Project → **Deployments** → Copy the Public URL.

### Step 3: Replace the URLs (Easy Way)

In `login.html`, search for:

```
https://ffp-passport-backend.vercel.app
```

Replace ALL occurrences with your Railway URL:

```
https://ffp-passport-backend-production-abc123.railway.app
```

Save and re-upload to Netlify.

---

## Better: Use a Config Variable

Instead of hardcoding, add this at the **top** of `login.html` (inside the first `<script>` tag):

```html
<script>
  // ✅ Update this to your Railway URL
  const API_BASE_URL = 'https://YOUR_RAILWAY_URL_HERE';
</script>
```

Then replace all the fetch calls:

**Before:**
```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/signup', {
```

**After:**
```js
fetch(API_BASE_URL + '/api/auth/signup', {
```

This way, if you ever change your API URL, you only update one line.

---

## Files to Update

Check all HTML files for hardcoded API URLs:

- [ ] `login.html` — Sign up, sign in, password reset
- [ ] `ffp-member-dashboard.html` — Save calorie logs, check-ins
- [ ] `ffp-provider.html` — Log visits, scan QR codes
- [ ] `ffp-admin.html` — Fetch member/provider stats

Search each for `fetch('https://ffp-passport-backend.vercel.app` and replace.

---

## Quick Find-and-Replace

Use your editor's Find & Replace:

**Find:**
```
https://ffp-passport-backend.vercel.app
```

**Replace with:**
```
https://ffp-passport-backend-production-abc123.railway.app
```

Or use the config approach above.

---

## Test It

1. Upload updated HTML to Netlify (drag to netlify.com/drop)
2. Open your site
3. Try signing up with an email
4. Check console for errors (F12 → Console tab)
5. If successful, you'll see member dashboard ✅

---

## Still Not Working?

### Check the browser console (F12 → Console)

Look for CORS errors like:

```
Access to XMLHttpRequest at 'https://...' from origin 'https://yoursite.netlify.app' 
has been blocked by CORS policy
```

**Fix**: In your Railway `server.js`, update CORS:

```js
app.use(cors({
  origin: ['https://yoursite.netlify.app', 'http://localhost:3000']
}));
```

Then redeploy Railway.

### Check Network tab (F12 → Network)

Click the request that failed and check:
- **URL** — Is it your Railway URL?
- **Status** — 404 means endpoint doesn't exist, 500 means backend error
- **Response** — What error message?

---

## Summary Checklist

- [ ] Deploy backend to Railway (get public URL)
- [ ] Update all HTML files: replace Vercel URL with Railway URL
- [ ] Re-upload HTML to Netlify
- [ ] Test signup/signin flow
- [ ] Check browser console for errors
- [ ] Celebrate 🎉

Questions? Check `RAILWAY_SETUP.md` for full deployment guide.
