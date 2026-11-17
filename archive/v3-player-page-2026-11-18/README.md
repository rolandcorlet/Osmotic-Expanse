# Backup: AI Director v3 player page, 18 Nov 2026

The player (and host and table) screen files exactly as they were before the living water
was added. The same moment in git is commit `91bea83`.

To go back to this version, copy `public/app.js`, `public/app.css`, `public/index.html` and
`public/gen.js` over `v3/director/public/`, and `server.js` over `v3/director/server.js`, then
restart the Director. Or, from the repo: `git checkout 91bea83 -- v3/director/public v3/director/server.js`
