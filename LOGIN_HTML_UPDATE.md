# FFP Passport — login.html Code Update

This file shows EXACTLY what to change in your `login.html` to connect to Railway.

---

## Option 1: Quick Global Search & Replace

In your editor (VS Code, etc.):

**Find:**
```
https://ffp-passport-backend.vercel.app
```

**Replace with:**
```
https://YOUR_RAILWAY_URL
```

Example:
```
https://ffp-passport-backend-production-7x8y.railway.app
```

Then save and re-upload to Netlify. Done!

---

## Option 2: Use API_BASE_URL Config (Recommended)

### 1. Find the top of login.html

Look for the opening of the first `<script>` block (around line 10-20).

### 2. Add this near the top of the script:

```javascript
// ── FFP Passport Configuration ─────────────────────────────────
// Update this to your Railway URL after deployment
const API_BASE_URL = 'https://ffp-passport-backend-production-abc123.railway.app';
// Leave blank '' for localhost testing
```

### 3. Then find ALL these fetch calls and UPDATE them:

#### ✏️ Change #1: requestCode function (signup/signin)

**FIND (around line 302):**
```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/' + endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, full_name: name })
})
```

**REPLACE WITH:**
```js
fetch(API_BASE_URL + '/api/auth/' + endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, full_name: name })
})
```

---

#### ✏️ Change #2: verifyCode function (signin)

**FIND (around line 371):**
```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, code })
})
```

**REPLACE WITH:**
```js
fetch(API_BASE_URL + '/api/auth/signin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, code })
})
```

---

### 4. Search for any other calls to `/api/auth/reset`

**FIND:**
```js
fetch('https://ffp-passport-backend.vercel.app/api/auth/reset',
```

**REPLACE WITH:**
```js
fetch(API_BASE_URL + '/api/auth/reset',
```

---

## After Updating

1. Save `login.html`
2. Go to **netlify.com/drop**
3. Drag your updated `ffp-netlify-drop` folder (or the zip)
4. Click **Deploy**

Your site is now live and connected to Railway! 🎉

---

## Testing

Open your Netlify site and:

1. Click "Sign up"
2. Enter an email (use a real email you can check)
3. You should get an access code email
4. Enter the code and sign in
5. You should see the member dashboard

If you don't see the code email, check:
- [ ] SMTP env vars set correctly in Railway
- [ ] Email domain verified in Resend
- [ ] Browser console (F12) for errors

---

## Troubleshooting Script

If requests fail, add this to the top of `login.html`:

```js
// Debug: log all API calls
const originalFetch = fetch;
window.fetch = function(...args) {
  console.log('🔵 API Call:', args[0]);
  return originalFetch.apply(this, args).then(r => {
    console.log('✅ Response status:', r.status);
    return r;
  }).catch(err => {
    console.error('❌ Fetch error:', err);
    throw err;
  });
};
```

This logs every API call to the browser console so you can see what's being called.

---

## Don't forget!

- [ ] Update `API_BASE_URL` constant to your Railway URL
- [ ] Save the file
- [ ] Re-upload to Netlify
- [ ] Test signup/signin

That's it! Your FFP Passport is now live with Railway. 🚀
