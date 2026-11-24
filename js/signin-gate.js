// Signed out? Go straight to sign-in without showing the sheet first.
// (js/live.js does the real check; this only avoids a flash of the page.)
// A plain (non-module) script so it runs before the page draws.
try {
    const signedIn = Object.keys(localStorage).some(k => k.startsWith("sb-") && k.endsWith("-auth-token"));
    if (!signedIn) location.replace("roster.html?next=" + encodeURIComponent("index.html" + location.search));
} catch (e) { /* storage blocked: js/live.js still checks */ }
