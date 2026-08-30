# Google + Apple sign-in (Janis)

Email/password stays. These buttons stay on `login.html` and the in-app sign-in card even before secrets exist. The API reads **only** Railway env vars — do not put client secrets in the repo.

Apple **will not complete** until you have a **paid Apple Developer Program** membership ($99/year). The button and `POST /api/v1/auth/oauth/apple/callback` are scaffolded; without the env vars the start URL returns a setup page.

## Redirect URIs to register

Use **both** hosts. The live code exchanges the code on the API, then sends the browser back to the PWA.

| Provider | Type | Value |
|---|---|---|
| Google | Authorized JavaScript origin | `https://runnr.fyi` |
| Google | Authorized JavaScript origin | `https://www.runnr.fyi` |
| Google | Authorized redirect URI | `https://api.runnr.fyi/api/v1/auth/oauth/google/callback` |
| Google | Authorized redirect URI | `https://runnr.fyi/oauth/google` (reserved; not used yet) |
| Apple | Website domain | `runnr.fyi` |
| Apple | Website domain | `api.runnr.fyi` |
| Apple | Return URL | `https://api.runnr.fyi/api/v1/auth/oauth/apple/callback` |
| Apple | Return URL | `https://runnr.fyi/oauth/apple` (reserved; not used yet) |

Local / Pages preview: add `http://localhost:8080` and `http://localhost:8090` if you test OAuth on a laptop.

## Google Cloud Console

1. Create (or reuse) a project.
2. **APIs & Services → OAuth consent screen** — External, app name `Runnr`, support email yours, scopes `email`, `profile`, `openid`.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Name it `Runnr web`. Add the origins and redirect URIs in the table above.
5. Copy the client ID and client secret into Railway (API service):

```
GOOGLE_OAUTH_CLIENT_ID=....apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=...
```

Optional already-used vars: `APP_PUBLIC_URL=https://runnr.fyi` (default). New: `API_PUBLIC_URL=https://api.runnr.fyi` if the API public host ever changes.

## Apple Developer

Blocked until the team is on the paid program.

1. [developer.apple.com](https://developer.apple.com) → enroll / pay.
2. **Certificates, Identifiers & Profiles → Identifiers → App IDs** — enable **Sign In with Apple** on the Runnr app id (or create `fyi.runnr`).
3. **Identifiers → Services IDs** — create `fyi.runnr.signin` (this becomes `APPLE_OAUTH_CLIENT_ID`). Enable Sign In with Apple → Configure:
   - Domains: `runnr.fyi`, `api.runnr.fyi`
   - Return URLs: the Apple rows in the table
4. **Keys** — create a key with **Sign In with Apple**, download the `.p8` once. Note **Key ID** and **Team ID** (Membership).
5. Railway (API service):

```
APPLE_OAUTH_CLIENT_ID=fyi.runnr.signin
APPLE_OAUTH_TEAM_ID=XXXXXXXXXX
APPLE_OAUTH_KEY_ID=XXXXXXXXXX
APPLE_OAUTH_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
```

Paste the PEM as one line with `\n` escapes, or a real multiline secret if Railway keeps newlines.

## What the API does

- `GET /api/v1/auth/oauth/providers` → `{ google, apple }` configured flags
- `GET /api/v1/auth/oauth/{google|apple}/start?next=/`
- Provider callback → find-or-create user → one-time `oauth` ticket → redirect to `https://runnr.fyi/?signedin=1&oauth=…`
- `POST /api/v1/auth/oauth/exchange` `{ code }` → same JWT as email login

If a Google/Apple email already has a Runnr password account, the identity is **linked** to that user. Password login keeps working. An OAuth-only user can later set a password with the existing register / forgot-password flow.

## After you paste secrets

Redeploy the Railway API. Hard-refresh `https://runnr.fyi/login.html`. Google should redirect; Apple stays on the setup page until the paid account + four env vars are present.
