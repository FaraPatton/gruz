import os, hmac, hashlib, json, logging
from urllib.parse import unquote, parse_qsl
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Karpov Docs Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://farapatton.github.io",
        "https://web.telegram.org",
        "null",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

BOT_TOKEN      = os.getenv("TELEGRAM_BOT_TOKEN", "")
ALLOWED_ID     = int(os.getenv("ALLOWED_TELEGRAM_ID", "857119483"))
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
ARCHIVE_FOLDER = os.getenv("ARCHIVE_FOLDER", "")


def make_hash(data_check: str) -> str:
    secret = hmac.new(BOT_TOKEN.encode(), b"WebAppData", hashlib.sha256).digest()
    return hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()


def parse_and_verify(raw: str):
    """Parse initData and verify hash. Returns user dict or raises."""
    pairs = dict(parse_qsl(raw, keep_blank_values=True))
    if not pairs:
        pairs = dict(p.split("=", 1) for p in raw.split("&") if "=" in p)

    received = pairs.pop("hash", "")
    data_check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    expected = make_hash(data_check)

    logger.info(f"data_check keys: {sorted(pairs.keys())}")
    logger.info(f"expected={expected[:20]} received={received[:20]}")

    if not hmac.compare_digest(expected, received):
        return None, expected, received

    user = json.loads(unquote(pairs.get("user", "{}")))
    return user, expected, received


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Karpov Docs"}


# ── DEBUG endpoint — remove after fixing ──
@app.post("/api/debug")
async def debug(request: Request):
    body = await request.json()
    raw = body.get("initData", "")
    logger.info(f"DEBUG raw (200 chars): {raw[:200]}")

    results = []
    for label, data in [("original", raw), ("unquoted", unquote(raw))]:
        user, exp, rec = parse_and_verify(data)
        results.append({
            "variant": label,
            "match": user is not None,
            "expected": exp[:20],
            "received": rec[:20],
            "keys": sorted(dict(parse_qsl(data, keep_blank_values=True)).keys()),
        })
    return {"results": results, "raw_preview": raw[:100]}


@app.post("/api/verify")
async def verify(request: Request):
    body = await request.json()
    raw = body.get("initData", "")
    if not raw:
        raise HTTPException(status_code=400, detail="No initData")

    user = None
    for data in [raw, unquote(raw)]:
        user, _, _ = parse_and_verify(data)
        if user:
            break

    if not user:
        logger.error("Hash mismatch on all attempts")
        raise HTTPException(status_code=403, detail="Auth failed: Invalid hash")

    uid = user.get("id")
    logger.info(f"User ID: {uid}, Allowed: {ALLOWED_ID}")
    if uid != ALLOWED_ID:
        logger.warning(f"Unauthorized: {uid}")
        raise HTTPException(status_code=403, detail="Access denied")

    return {"ok": True, "user": user.get("first_name", ""),
            "apiKey": GOOGLE_API_KEY, "archiveFolder": ARCHIVE_FOLDER}


@app.post("/api/upload-to-drive")
async def upload_to_drive(request: Request):
    body = await request.json()
    access_token = body.get("accessToken", "")
    pdf_base64   = body.get("pdfBase64", "")
    filename     = body.get("filename", "document.pdf")
    folder_id    = body.get("folderId", ARCHIVE_FOLDER)
    if not access_token or not pdf_base64:
        raise HTTPException(status_code=400, detail="Missing data")
    import base64
    pdf_bytes  = base64.b64decode(pdf_base64)
    boundary   = "boundary_gruz"
    meta       = json.dumps({"name": filename, "parents": [folder_id]})
    body_parts = (
        f"--{boundary}\r\nContent-Type: application/json\r\n\r\n{meta}\r\n"
        f"--{boundary}\r\nContent-Type: application/pdf\r\n\r\n"
    ).encode() + pdf_bytes + f"\r\n--{boundary}--".encode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
            headers={"Authorization": f"Bearer {access_token}",
                     "Content-Type": f"multipart/related; boundary={boundary}"},
            content=body_parts, timeout=30)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


@app.post("/api/send-email")
async def send_email(request: Request):
    body = await request.json()
    access_token = body.get("accessToken", "")
    to = body.get("to", "")
    if not access_token or not to:
        raise HTTPException(status_code=400, detail="Missing data")
    import base64 as b64mod
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.application import MIMEApplication
    msg = MIMEMultipart()
    msg["To"] = to
    msg["Subject"] = body.get("subject", "Documents")
    msg.attach(MIMEText(body.get("text", ""), "plain", "utf-8"))
    pdf_b64 = body.get("pdfBase64", "")
    fname   = body.get("filename", "")
    if pdf_b64 and fname:
        part = MIMEApplication(b64mod.b64decode(pdf_b64), _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename=fname)
        msg.attach(part)
    raw = b64mod.urlsafe_b64encode(msg.as_bytes()).decode().rstrip("=")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"raw": raw}, timeout=30)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
