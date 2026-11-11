# Deploy runbook — where each piece lives

Three separate services. A `git push` updates **GitHub**, and GitHub's push updates
**Vercel**. **Supabase is not in this chain at all** — see §4.

```
this folder  --git push-->  GitHub (source of truth)  --on push-->  Vercel (the two websites)
                                                        X  does NOT touch  Supabase (its own account, its own pipeline)
```

## 1. GitHub — one push per change

```
git add -A
git commit -m "what changed"
git push
```

The repo is on branch `main`. `saves/`, `.env*`, `.vercel/` and `node_modules/` are
ignored, so `director/saves/director.json` (which holds a live Gemini API key) never
leaves this computer. If that key is ever pushed by mistake, revoke it at
aistudio.google.com — deleted-in-a-later-commit is still in history forever.

## 2. Vercel — two projects from this one repo

Both projects import the same GitHub repo; they differ only in **Root Directory**.
`.vercelignore` keeps the books, saves and `director/` off both websites.

| Project | Root Directory | Serves |
| --- | --- | --- |
| Director's site | repo root | `DMAssistant_Osmotic_Expanse.html` (via the `vercel.json` rewrite of `/`) |
| Players' site | `players` | `players/index.html` |

Setup once: vercel.com → **Add New… → Project → Import** the GitHub repo → in
*Build & Development Settings* set *Root Directory* → Deploy. Repeat for the second
project with Root Directory `players`. After that every `git push` redeploys both —
no `vercel` command needed.

## 3. If the website needs to reach Supabase

That is a code change plus environment variables, not a deploy setting:

1. Supabase dashboard → Project Settings → API: copy **Project URL** and **anon public** key.
2. Vercel → your project → **Settings → Environment Variables**: add
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Production + Preview), redeploy.
3. In the page, create the client with those two values and read/write from there.
   The anon key is safe in browser code **only** with Row Level Security policies
   turned on in Supabase — otherwise anyone can read the tables.

## 4. What actually updates Supabase

Supabase never reads your Vercel deploy. It updates by:

- **Dashboard SQL editor** — quickest for one-off table/data changes.
- **Supabase CLI** — `supabase db push` applies local migrations;
  `supabase functions deploy` ships Edge Functions.
- **Supabase's own GitHub integration** — Project Settings → Git Repository: connect
  the repo, and every push to a branch runs the migrations in `supabase/migrations/`
  and deploys `supabase/functions/`. This is the "push to GitHub and Supabase updates"
  setup, and it needs a `supabase/` folder that this repo does not have yet.

Data already sitting in your Supabase database is not in this folder, so no amount of
pushing changes it.

## 5. Not on Vercel

`director/` is a local Node server (`node server.js`, port 8787) that keeps AI keys on
disk, so it is excluded from both websites. It would need rewriting as serverless
functions with the keys moved into env vars to run on Vercel.
