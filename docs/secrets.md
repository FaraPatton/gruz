# Runtime Config And GitHub Secrets

`js/config.js` is generated during the GitHub Pages deploy and contains only public browser settings.
Do not commit real account details, addresses, phone numbers, Drive IDs, or email bodies into the repository.

Add or edit values in GitHub:

`Settings -> Secrets and variables -> Actions -> Repository secrets`

After changing secrets, re-run the Pages workflow or push a new commit. A browser or installed PWA may also need a hard refresh after deploy.

## Required For Login And Google APIs

| Secret | Required | Used for |
| --- | --- | --- |
| `GCLIENT_ID` | yes | Google OAuth client ID. |

For the protected Vercel-hosted app, add these values in Vercel Environment Variables too:

| Vercel variable | Required | Used for |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | yes | Google OAuth client ID used by the backend redirect flow. Can match `GCLIENT_ID`. |
| `GOOGLE_CLIENT_SECRET` | yes | Google OAuth client secret. Never put it in GitHub Pages config. |
| `SESSION_SECRET` | yes | Long random value used to encrypt the `HttpOnly` auth cookie. |

## Optional API Keys

| Secret | Required | Used for |
| --- | --- | --- |
| `YANDEX_MAPS_API_KEY` | no | Automatic route distance calculation. If empty, manual kilometers still work. |

## Analytics Access And Route Defaults

Analytics access is checked by the Vercel backend. Store `ANALYTICS_ALLOWED_EMAILS` in Vercel Environment Variables, not in GitHub Secrets or `js/config.js`.

Private runtime settings are stored in Vercel:

| Vercel variable | Required | Used for |
| --- | --- | --- |
| `ARCHIVE_ROOT` | yes | Google Drive archive folder ID used only by Vercel backend. |
| `PRIVATE_RUNTIME_CONFIG` | yes | JSON with route defaults, executor markers/profile and stamp file ID. |

| Secret | Required | Used for |
| --- | --- | --- |
| `ROUTE_BASE_ADDRESS` | no | Default base address added to route distance calculations. |
| `EXECUTOR_MARKERS` | recommended | Private markers used to exclude executor details from customer analytics. Accepts comma, semicolon, or newline-separated values. |

## Private Runtime JSON

`PRIVATE_RUNTIME_CONFIG` has this structure:

```json
{
  "routeBaseAddress": "",
  "executorMarkers": [],
  "executorProfile": {
    "name": "",
    "shortName": "",
    "inn": "",
    "ogrn": "",
    "address": "",
    "phone": "",
    "bank": "",
    "bik": "",
    "corrAccount": "",
    "account": ""
  },
  "stampFileId": ""
}
```

If any required executor field is missing, PDF generation stops with a visible error instead of creating a blank executor table.

## Email Defaults

Почтовые значения хранятся в Vercel Environment Variables и не включаются в `js/config.js`.

| Vercel variable | Required | Used for |
| --- | --- | --- |
| `EMAIL_SUBJECT` | yes for "send document set" | Subject of the customer email. |
| `EMAIL_BODY` | yes for "send document set" | Body of the customer email. May be multiline. |
| `EMAIL_DRIVE_FOLDER_ID` | yes for "send document set" | Drive folder that is shared with the customer before sending. |
| `SIGN_EMAIL_SUBJECT` | no | Subject for sending a signed contract. Falls back to a generic subject if empty. |
| `SIGN_EMAIL_BODY` | no | Body for sending a signed contract. Falls back to a generic body if empty. |

## Format Notes

List secrets support any of these formats:

```text
one@example.com,two@example.com
```

```text
one@example.com;two@example.com
```

```text
one@example.com
two@example.com
```

Multiline email bodies can be pasted directly into Vercel Environment Variables. If a multiline value is inconvenient, a single-line body also works.

## Local Development

The repository only contains `js/config.template.js` with empty placeholders. For local testing, create a local `js/config.js` from the template and fill it on your machine only. Do not commit that file.

## Deploy Checklist

1. Add public keys to GitHub Actions secrets and private settings to Vercel Environment Variables.
2. Re-run the GitHub Pages workflow or push a new commit.
3. Open `/js/config.js` on the deployed site and verify only expected client field names are present.
4. Hard-refresh the browser or restart the installed PWA if old values are still visible.
5. Use the Vercel app URL as the primary protected app URL when testing server-side auth sessions.
