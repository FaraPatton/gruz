# Vercel Backend

Первый backend-контур проекта работает как Vercel Serverless Functions на бесплатном Hobby-плане.

## Endpoints

- `GET /api/health` - публичная проверка доступности API.
- `GET /api/auth/me` - серверная проверка Google access token и разрешенного email.

## Private environment variables

Значения задаются только в Vercel и не попадают в frontend bundle:

- `APP_ORIGINS` - разрешенные frontend origins через запятую, например `https://farapatton.github.io`.
- `ANALYTICS_ALLOWED_EMAILS` - разрешенные Google email через запятую.

Для preview deployment можно добавить его точный origin в `APP_ORIGINS`. Не используйте `*` для защищенных endpoint-ов.

## Authentication request

```http
GET /api/auth/me
Authorization: Bearer GOOGLE_ACCESS_TOKEN
```

Backend запрашивает Google `userinfo`, проверяет подтвержденный email и сравнивает его с приватным whitelist.

Frontend использует стабильный production URL `https://gruz-kappa.vercel.app`. Значение можно переопределить публичной GitHub Actions variable `API_BASE_URL`.
