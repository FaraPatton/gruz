# Vercel Backend

Первый backend-контур проекта работает как Vercel Serverless Functions на бесплатном Hobby-плане.

## Endpoints

- `GET /api/health` - публичная проверка доступности API.
- `GET /api/auth/me` - серверная проверка Google access token и разрешенного email.
- `GET /api/analytics/trips` - защищенное чтение `trips.json` из Google Drive.
- `PUT /api/analytics/trips` - валидированное сохранение `trips.json` в Google Drive.
- `POST /api/email/documents` - выдача доступа к папке и отправка письма по приватному шаблону.
- `POST /api/email/signed` - отправка подписанного PDF-вложения.
- `POST /api/archive/pdf` - создание папки года и защищенная загрузка счета или акта в Drive.
- `GET /api/archive/files` - список счетов и актов внутри серверного `ARCHIVE_ROOT`.
- `GET /api/archive/file?id=...` - PDF только после проверки его принадлежности защищенному архиву.
- `GET /api/config/private` - приватные реквизиты и настройки только после проверки whitelist.

## Private environment variables

Значения задаются только в Vercel и не попадают в frontend bundle:

- `APP_ORIGINS` - разрешенные frontend origins через запятую, например `https://farapatton.github.io`.
- `PRIVATE_RUNTIME_CONFIG` - JSON с `routeBaseAddress`, `executorMarkers`, `executorProfile` и `stampFileId`.
- `ANALYTICS_ALLOWED_EMAILS` - разрешенные Google email через запятую.
- `ARCHIVE_ROOT` - ID корневой папки архива Google Drive.
- `EMAIL_SUBJECT` - тема письма с комплектом документов.
- `EMAIL_BODY` - текст письма с комплектом документов.
- `EMAIL_DRIVE_FOLDER_ID` - ID папки, к которой выдается доступ получателю.
- `SIGN_EMAIL_SUBJECT` - тема письма с подписанным договором (необязательно).
- `SIGN_EMAIL_BODY` - текст письма с подписанным договором (необязательно).

Для preview deployment можно добавить его точный origin в `APP_ORIGINS`. Не используйте `*` для защищенных endpoint-ов.

## Authentication request

```http
GET /api/auth/me
Authorization: Bearer GOOGLE_ACCESS_TOKEN
```

Backend запрашивает Google `userinfo`, проверяет подтвержденный email и сравнивает его с приватным whitelist.

Frontend использует стабильный production URL `https://gruz-kappa.vercel.app`. Значение можно переопределить публичной GitHub Actions variable `API_BASE_URL`.
