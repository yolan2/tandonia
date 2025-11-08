# Tandonia

This repository contains a small React TSX frontend (`tandonia_app (2).tsx`) and a Node/Express backend (`tandonia_backend.js`).

Quick status
- Backend: deployed to Render at `https://tandonia.onrender.com`
- API (custom domain): `https://api.tandonia.be` (CNAME -> `tandonia.onrender.com`)

Important security steps (do these now)
1) Rotate Supabase service role key and JWT secret
   - In the Supabase dashboard: Project → Settings → API → rotate the Service Role key (service_role).
   - Replace the key in Render dashboard (Service → Environment → Environment Variables) with the new key.
   - Rotate any JWT secret you used for local JWT verification.

2) Remove secrets from the repo/workspace
   - Make sure `.env` is not committed. This repository's `.gitignore` includes `.env`.
   - Delete any local `.env` files that contain secrets. (Already removed from the workspace by the tooling.)

3) Set environment variables in Render (server-side only)
   - SUPABASE_URL=https://<your-project>.supabase.co
   - SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>  (server-only)
   - JWT_SECRET=<your-jwt-secret>
   - DATABASE_URL=<optional Postgres connection string>

4) Frontend configuration
   - The frontend uses a configurable `API_BASE` (defaults to `https://api.tandonia.be`).
   - If you run a local dev server (Vite/CRA), create a `.env` in your frontend with:
     - `VITE_API_URL=https://api.tandonia.be` (Vite)
     - or `REACT_APP_API_URL=https://api.tandonia.be` (Create React App)
   - In code the app reads `REACT_APP_API_URL`, `VITE_API_URL`, or `window.__API_URL__`.

5) Verify
   - DNS: `Resolve-DnsName api.tandonia.be -Type CNAME` should point to `tandonia.onrender.com`.
   - Health: `curl -i https://api.tandonia.be/health` should return `{ "ok": true, ... }`.

Optional next steps I can do for you
- Wire the frontend into a proper build setup (Vite) and start a dev server.
- Remove `// @ts-nocheck` and fix TypeScript errors in the frontend.
- Add CI/CD for automated deploys and a small smoke-test that hits `/health` after deploy.

If you want me to proceed with any of the optional tasks, tell me which one and I will implement it next.
