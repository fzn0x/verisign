# verisign

A small, self-hosted service for signing PDFs with a verification QR code and letting anyone check them. It is built for one person or organisation running it on their own domain, not as a multi-tenant service.

- **Sign:** choose a PDF, place the QR stamp where it belongs, issue it, and download the stamped file.
- **Verify:** scanning the QR opens a page on your domain that shows who issued the document, when, and whether it has been revoked.
- **Check integrity:** on that page, anyone can drop their copy of the PDF, or paste its SHA-512 fingerprint, to confirm it is byte-for-byte the file that was issued.

## How it works

1. The owner signs in and chooses a PDF. The file is opened **in the browser** and never uploaded.
2. On *Issue*, the server reserves a serial (for example `K7Q4-M2XD-9PRA`) and snapshots the issuer details.
3. The browser stamps a vector QR code encoding `https://<your-domain>/v/<serial>` onto the chosen page, with an optional caption (issuer, signatory, serial, domain).
4. The browser computes the SHA-512 of the stamped file and sends only that fingerprint, the title, file name and page count to the server.
5. Verifiers open the QR link. Their copy is hashed locally and compared server-side. The recorded fingerprint is only shown back to someone who already supplied a matching one.

What a successful check proves: the record is served from the issuer's domain, and the file is unchanged since it was issued. A QR code on its own proves nothing, since it can be copied onto any page; the fingerprint check is what binds the record to the file.

Stamping rewrites the PDF, so any existing digital signature inside the file will no longer validate. The studio warns when a file already carries one.

## Stack

| Part | Technology |
| --- | --- |
| API | Go 1.27, standard library `net/http`, compiled to WebAssembly with [workers-go](https://github.com/syumai/workers-go) |
| Hosting | Cloudflare Workers with Workers Static Assets |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Vite, React 19, TypeScript, React Router, TanStack Query, Zustand |
| PDF | pdf-lib (stamping), pdf.js (preview), uqr (QR encoding) |

## Self-hosting

You need Node.js 22+, pnpm 10, Go 1.27+ and a Cloudflare account with a domain on it.

```sh
git clone https://github.com/fzn0x/verisign.git
cd verisign
pnpm install

# Create the database and note the database_id it prints.
pnpm exec wrangler d1 create verisign

# Configure your copy: database_id, domain, issuer defaults.
cp wrangler.example.toml wrangler.toml

# Create the tables.
pnpm db:migrate:remote

# Set the owner password (at least 12 characters).
pnpm exec wrangler secret put OWNER_PASSWORD

pnpm run deploy
```

`wrangler.toml` is ignored by git because it names your database and domain. In it:

- `routes` attaches the Worker to your custom domain.
- `workers_dev = false` and `preview_urls = false` turn off the `*.workers.dev` and preview URLs, so the app is only reachable on your domain. The API also refuses requests addressed to any host other than `PUBLIC_ORIGIN`.
- `PUBLIC_ORIGIN` is the origin encoded into every QR code. Changing it later breaks the codes already printed.
- `ISSUER_*` are defaults shown until you save the issuer details under **Settings** in the studio.

Then open `https://<your-domain>/login`, sign in, and add the signatory under **Settings** before signing.

The Go Worker is about 2.2 MB gzipped, within the free plan's 3 MB limit. Each request starts a Go WebAssembly instance; if requests hit the free plan's CPU limit, move the Worker to the Workers Paid plan.

## Development

```sh
cp .dev.vars.example .dev.vars   # local owner password
pnpm db:migrate                  # local D1
pnpm dev                         # builds the web app, serves everything on :8787
pnpm dev:web                     # optional: Vite with hot reload on :5173, proxying /api to :8787
pnpm test                        # Go and frontend tests
```

`wrangler dev` presents the production hostname to the Worker, so QR codes created locally point at your real domain. Open the same `/v/<serial>` path on `localhost:8787` to test them.

## Project layout

```
cmd/worker/        Worker entry point (WebAssembly)
internal/api/      JSON API under /api/
internal/auth/     owner password check and session tokens
internal/config/   environment variables and secrets
internal/document/ document model, serials and digest validation
internal/store/    D1 / SQLite repository
migrations/        D1 schema
scripts/           cross-platform build
web/               Vite + React frontend
```

## API

| Method | Path | Access |
| --- | --- | --- |
| `GET` | `/api/issuer` | public |
| `GET` | `/api/documents/{id}` | public |
| `POST` | `/api/documents/{id}/verify` `{ sha512 }` | public |
| `POST` | `/api/lookup` `{ sha512 }` | public |
| `GET` | `/api/auth/session` | public |
| `POST` | `/api/auth/login` `{ password }`, `/api/auth/logout` | public |
| `GET`, `POST` | `/api/studio/documents` | owner |
| `GET`, `DELETE` | `/api/studio/documents/{id}` | owner |
| `POST` | `/api/studio/documents/{id}/finalize`, `/revoke` | owner |
| `GET`, `PUT` | `/api/studio/issuer` | owner |

State-changing requests must be same-origin JSON. Sign-in is limited to 5 failed attempts per client every 15 minutes.

## License

[GPL-3.0](LICENSE)
