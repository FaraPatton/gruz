# Runtime Config And GitHub Secrets

`js/config.js` is generated during the GitHub Pages deploy from repository secrets.
Do not commit real API keys, account details, addresses, phone numbers, Drive IDs, or email bodies into the repository.

Add or edit values in GitHub:

`Settings -> Secrets and variables -> Actions -> Repository secrets`

After changing secrets, re-run the Pages workflow or push a new commit. A browser or installed PWA may also need a hard refresh after deploy.

## Required For Login And Google APIs

| Secret | Required | Used for |
| --- | --- | --- |
| `GCLIENT_ID` | yes | Google OAuth client ID. |
| `GAPI_KEY` | yes | Google API key for Drive picker/API helpers. |
| `ARCHIVE_ROOT` | yes | Google Drive archive folder ID for documents and trips registry. |

## Optional API Keys

| Secret | Required | Used for |
| --- | --- | --- |
| `YANDEX_MAPS_API_KEY` | no | Automatic route distance calculation. If empty, manual kilometers still work. |

## Analytics Access And Route Defaults

| Secret | Required | Used for |
| --- | --- | --- |
| `ANALYTICS_ALLOWED_EMAILS` | yes for protected analytics | Whitelist for opening `analytics.html`. Accepts comma, semicolon, or newline-separated emails. |
| `ROUTE_BASE_ADDRESS` | no | Default base address added to route distance calculations. |
| `EXECUTOR_MARKERS` | recommended | Private markers used to exclude executor details from customer analytics. Accepts comma, semicolon, or newline-separated values. |

## Executor Profile For PDF Documents

These fields fill invoice and act executor blocks. Keep them in secrets only.

| Secret | Required | Used for |
| --- | --- | --- |
| `EXECUTOR_NAME` | yes | Full executor name in invoices and acts. |
| `EXECUTOR_SHORT_NAME` | yes | Short executor name in signatures and service descriptions. |
| `EXECUTOR_INN` | yes | Executor INN. |
| `EXECUTOR_OGRN` | yes for acts | Executor OGRN. |
| `EXECUTOR_ADDRESS` | yes | Executor address. |
| `EXECUTOR_PHONE` | yes | Executor phone. |
| `EXECUTOR_BANK` | yes for invoices | Bank name. |
| `EXECUTOR_BIK` | yes for invoices | Bank BIK. |
| `EXECUTOR_CORR_ACCOUNT` | yes for invoices | Correspondent account. |
| `EXECUTOR_ACCOUNT` | yes for invoices | Settlement account. |

If any required executor field is missing, PDF generation stops with a visible error instead of creating a blank executor table.

## Email Defaults

| Secret | Required | Used for |
| --- | --- | --- |
| `EMAIL_SUBJECT` | yes for "send document set" | Subject of the customer email. |
| `EMAIL_BODY` | yes for "send document set" | Body of the customer email. May be multiline. |
| `EMAIL_DRIVE_FOLDER_ID` | yes for "send document set" | Drive folder that is shared with the customer before sending. |
| `SIGN_EMAIL_SUBJECT` | no | Subject for sending a signed contract. Falls back to a generic subject if empty. |
| `SIGN_EMAIL_BODY` | no | Body for sending a signed contract. Falls back to a generic body if empty. |

## Stamp

| Secret | Required | Used for |
| --- | --- | --- |
| `STAMP_FILE_ID` | no | Private Google Drive file ID for the default stamp image. |

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

Multiline email bodies can be pasted directly into GitHub Secrets. If a multiline value is inconvenient, a single-line body also works.

## Local Development

The repository only contains `js/config.template.js` with empty placeholders. For local testing, create a local `js/config.js` from the template and fill it on your machine only. Do not commit that file.

## Deploy Checklist

1. Add or update repository secrets in GitHub Actions secrets.
2. Re-run the GitHub Pages workflow or push a new commit.
3. Open `/js/config.js` on the deployed site and verify field names are present.
4. Hard-refresh the browser or restart the installed PWA if old values are still visible.
