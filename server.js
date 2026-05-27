/* =============================================================
   FFP Passport — Stripe Session Auto-Signin (v1)
   Path: assets/ffp-session-signin.js

   Detects ?session_id= in the page URL (set by Stripe Payment Link
   success URL after a paid checkout) and exchanges it for an auth
   token via the backend's /api/auth/session-signin endpoint.

   Behaviour:
   - No ?session_id in URL → script is a no-op (page renders normally)
   - User already signed in → strips session_id from URL, no API call
   - Token returned → stores token + member, cleans URL
   - profile already complete → redirects to dashboard
   - Failure → redirects to /login

   Brand rules:
   - Montserrat only (no other fonts)
   - Solid colours only (no rgba opacity hacks)
   - No emojis, no native scrollbars
   - Uses FFP navy palette: #081420 / #2ba8e0 / #6a90a8

   Dependency:
   - Must be loaded AFTER assets/ffp-api-integration.js
   - Both must exist on the page that runs this script
   ============================================================= */
(function () {
  'use strict';

  // Inject scrollbar-hiding CSS (FFP platform-wide rule)
  var styleEl = document.createElement('style');
  styleEl.textContent = '\
*::-webkit-scrollbar{display:none;width:0;height:0;}\
*{-ms-overflow-style:none;scrollbar-width:none;}\
#ffp-stripe-overlay{position:fixed;inset:0;z-index:99999;background:#081420;color:#fff;font-family:Montserrat,sans-serif;display:none;align-items:center;justify-content:center;}\
#ffp-stripe-overlay.show{display:flex;}\
#ffp-stripe-overlay .ffp-so-inner{text-align:center;}\
#ffp-stripe-overlay .ffp-so-brand{font-size:24px;font-weight:900;letter-spacing:3px;}\
#ffp-stripe-overlay .ffp-so-brand span{color:#2ba8e0;}\
#ffp-stripe-overlay .ffp-so-msg{font-size:12px;color:#6a90a8;margin-top:16px;letter-spacing:1px;text-transform:uppercase;}\
';
  document.head.appendChild(styleEl);

  // Inject overlay DOM
  var overlay = document.createElement('div');
  overlay.id = 'ffp-stripe-overlay';
  overlay.innerHTML = '\
<div class="ffp-so-inner">\
<div class="ffp-so-brand">FFP <span>PASSPORT</span></div>\
<div class="ffp-so-msg">Signing you in&hellip;</div>\
</div>\
';

  function start() {
    // Body must exist before appending overlay
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', start);
      return;
    }
    document.body.appendChild(overlay);

    var sessionId = new URLSearchParams(window.location.search).get('session_id');
    if (!sessionId) return;

    // Already signed in? Just clean URL, don't re-auth.
    if (window.FFPAuth && window.FFPAuth.isAuthenticated()) {
      var cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      return;
    }

    overlay.classList.add('show');

    function callApi(retries) {
      if (typeof FFPApi === 'undefined' || !FFPApi.sessionSignin) {
        if (retries > 30) {
          console.error('[FFP Session Signin] FFPApi.sessionSignin not available after 3s — is ffp-api-integration.js loaded?');
          window.location.href = '/login';
          return;
        }
        setTimeout(function () { callApi(retries + 1); }, 100);
        return;
      }

      FFPApi.sessionSignin(sessionId).then(function (res) {
        overlay.classList.remove('show');

        if (!res || res.error) {
          console.error('[FFP Session Signin] Failed:', res && res.error);
          window.location.href = '/login';
          return;
        }

        // Clean the URL (remove ?session_id=...)
        var cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);

        // If profile is already complete, jump to the right dashboard
        if (res.member && res.member.profile_complete) {
          window.location.href = res.redirect || '/ffp-member-dashboard.html';
          return;
        }

        // Otherwise: stay on this page (profile-complete form)
        console.log('[FFP Session Signin v1] Signed in as', res.member && res.member.email);
      }).catch(function (err) {
        overlay.classList.remove('show');
        console.error('[FFP Session Signin] Network error:', err);
        window.location.href = '/login';
      });
    }

    callApi(0);
  }

  start();
})();
