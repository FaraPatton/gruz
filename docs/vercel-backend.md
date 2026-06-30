# Vercel Backend

Первый backend-контур проекта работает как Vercel Serverless Functions на Hobby-плане.

## Endpoints

- `GET /api/health` - публичная проверка доступности API.
- `GET /api/auth/start` - начало Google OAuth redirect flow.
- `GET /api/auth/callback` - обмен Google authorization code на серверную `HttpOnly` session cookie.
- `GET|POST /api/auth/logout` - удаление серверной session cookie.
- `GET /api/auth/me` - проверка серверной session cookie или legacy `Bearer` token и разрешенного email.
- `GET /api/analytics/trips` - защищенное чтение `trips.json` из Google Drive.
- `PUT /api/analytics/trips` - валидированное сохранение `trips.json` в Google Drive.
- `POST /api/email/documents` - выдача доступа к папке и отправка письма по приватному шаблону.
- `POST /api/email/signed` - отправка подписанного PDF-вложения.
- `POST /api/archive/pdf` - создание папки года и защищенная загрузка счета или акта в Drive.
- `GET /api/archive/files` - список счетов и актов внутри серверного `ARCHIVE_ROOT`.
- `GET /api/archive/file?id=...` - PDF только после проверки его принадлежности защищенному архиву.
- `GET /api/archive/stamp` - приватное изображение печати после whitelist и проверки типа файла.
- `GET /api/config/private` - приватные реквизиты и настройки только после проверки whitelist.

## Private environment variables

Значения задаются только в Vercel и не попадают в frontend bundle:

- `APP_ORIGINS` - разрешенные frontend origins через запятую, например `https://farapatton.github.io`.
- `GOOGLE_CLIENT_ID` - Google OAuth client ID для backend redirect flow.
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret для обмена authorization code.
- `SESSION_SECRET` - длинная случайная строка для шифрования `HttpOnly` session cookie.
- `PRIVATE_RUNTIME_CONFIG` - JSON с `routeBaseAddress`, `executorMarkers`, `executorProfile` и `stampFileId`.
- `ANALYTICS_ALLOWED_EMAILS` - разрешенные Google email через запятую.
- `ARCHIVE_ROOT` - ID корневой папки архива Google Drive.
- `EMAIL_SUBJECT` - тема письма с комплектом документов.
- `EMAIL_BODY` - текст письма с комплектом документов.
- `EMAIL_DRIVE_FOLDER_ID` - ID папки, к которой выдается доступ получателю.
- `SIGN_EMAIL_SUBJECT` - тема письма с подписанным договором (необязательно).
- `SIGN_EMAIL_BODY` - текст письма с подписанным договором (необязательно).

Same-origin Vercel requests проходят без добавления каждого preview-домена в `APP_ORIGINS`. GitHub Pages больше не используется как полноценный frontend и перенаправляет на Vercel. Не используйте `*` для защищенных endpoint-ов.

## Authentication

Основной Vercel-домен использует серверную сессию:

```http
GET /api/auth/start?returnTo=/
```

После Google OAuth backend ставит зашифрованную `HttpOnly; Secure; SameSite=Lax` cookie. Google access token не сохраняется в `sessionStorage` и не доступен JavaScript-коду.

Legacy GitHub Pages flow временно поддерживается через `Bearer`, чтобы старый адрес не упал в день перехода:

```http
GET /api/auth/me
Authorization: Bearer GOOGLE_ACCESS_TOKEN
```

Backend запрашивает Google `userinfo`, проверяет подтвержденный email и сравнивает его с приватным whitelist.

На Vercel frontend вызывает API по same-origin path `/api/...`. GitHub Pages использует стабильный production URL `https://gruz-kappa.vercel.app`; значение можно переопределить публичной GitHub Actions variable `API_BASE_URL`.
