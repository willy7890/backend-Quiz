# FastQuiz deployment: Render + PostgreSQL + Vercel + Google/email auth

This project is deployment-configured but is not live until you deploy it with your own provider accounts and environment variables.

## 1. Create Google OAuth credentials
1. Open Google Cloud Console: https://console.cloud.google.com/
2. Create/select a project, configure the OAuth consent screen, and create an OAuth Client ID of type **Web application**.
3. Add your Vercel site domain to **Authorized JavaScript origins**, e.g. `https://your-fastquiz.vercel.app`. Add `http://localhost:5173` for local testing. The popup flow does not require a redirect URI.
4. This app uses Google Identity Services to return an ID token, so it needs the Web Client ID but does not use the OAuth client secret. Use the same Web Client ID as `GOOGLE_CLIENT_ID` on Render and `VITE_GOOGLE_CLIENT_ID` on Vercel. Never put a Google client secret in frontend variables. Google ID-token verification checks the configured audience and token issuer.

## 2. Deploy backend and PostgreSQL on Render
1. Push the repository to GitHub.
2. In Render, create a Blueprint from the repository. `render.yaml` defines a FastAPI web service and a PostgreSQL database; the service runs Alembic migrations before starting Uvicorn.
3. Set `GOOGLE_CLIENT_ID` to your Google Web Client ID.
4. Set `FRONTEND_ORIGINS` to your exact Vercel production origin (e.g. `https://backend-quiz-wilbard.vercel.app`). The API also allows this project's Vercel preview aliases (`https://backend-quiz-<alias>-wilbard.vercel.app`). You can include `http://localhost:5173` during development.
5. Render generates `JWT_SECRET` via the blueprint. Keep it private. Use a separate secret for each environment.
6. Deploy and test `https://YOUR-API-URL/docs` and `/api/health`.

## 3. Deploy frontend on Vercel
1. Import the GitHub repository into Vercel.
2. Set Root Directory to `frontend` and framework preset to Vite.
3. Add `VITE_API_URL` with the Render API URL (no trailing slash).
4. Add `VITE_GOOGLE_CLIENT_ID` with the same Google Web Client ID.
5. Deploy. Make sure Render's `FRONTEND_ORIGINS` matches your Vercel production origin exactly; preview aliases for this project are also allowed.

## 4. Authentication behavior
- Email/password registration and login use Argon2 password hashing and signed JWT sessions.
- Google sign-in sends a Google credential to FastAPI; the backend verifies it with Google's public verification library.
- API permissions are enforced using the database role (`SUPER_ADMIN`, `ADMIN`, `MEMBER`), not client-supplied role data.
- Voting requires login and is limited to one vote per authenticated user per practice question.
- Managed quiz scores, task assignments, comments, notifications, and activity are persisted server-side.
- PostgreSQL is used when `DATABASE_URL` is set; local development defaults to SQLite.

## 5. Schema upgrades and first Super Admin
Migrations run automatically on Render startup (`alembic upgrade head`). For an existing deployment, take a database backup before upgrading. The initial migration is additive and retains existing users, questions, options, and votes; existing accounts receive the `MEMBER` role.

To initialize an owner:
1. Register the intended owner account using the app.
2. From the backend service shell, run `python -m app.bootstrap_super_admin owner@example.com` once.
3. Restart or sign out/in so the UI refreshes the role.

The command refuses to run after an active Super Admin exists. Only Super Admins can assign/revoke administrator roles; an active Super Admin cannot be removed if that would leave no Super Admin.

## Security and production checklist
- Email/password flow does not yet include email verification, password reset, rate limiting, or abuse detection; add these before a public contest with valuable prizes.
- Task invitations, email notifications, and automated deadline reminders are not configured; existing task assignment uses already registered accounts and in-app notifications.
- Use a verified Google OAuth client ID and exact trusted frontend origin.
- Do not use display names as identities; votes are keyed to authenticated user IDs.
- Check Render's current database pricing, retention, and service sleep/limits before choosing a plan.
