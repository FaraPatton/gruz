# Security Roadmap

Цель: постепенно убрать чувствительные данные и опасные операции из браузера, сохранив бесплатный хостинг и работу через терминал на macOS.

## Текущее состояние

- Приложение работает как статический фронт на GitHub Pages.
- `js/config.js` генерируется на деплое из GitHub Actions secrets и не коммитится в репозиторий.
- Но сгенерированный `js/config.js` публично отдается браузеру, поэтому значения внутри него нельзя считать настоящими backend-секретами.
- Google OAuth token хранится в runtime-памяти, а для аналитики временно кладется в `sessionStorage`.
- Whitelist аналитики проверяется Vercel backend через private env `ANALYTICS_ALLOWED_EMAILS`.
- Drive, Gmail, PDF parsing и `trips.json` сейчас выполняются из браузера через Google APIs.

## Риск-профиль

### Высокий приоритет

- `ARCHIVE_ROOT`, `EMAIL_DRIVE_FOLDER_ID`, `STAMP_FILE_ID`, реквизиты исполнителя и email templates пока доступны в клиентском `config.js`.
- Клиент сам решает, разрешен ли доступ к аналитике.
- Любой пользователь с валидным Google token и доступом к фронтовой логике видит структуру Drive/API-вызовов.
- OAuth scope сейчас широкий: `drive` и `gmail.send`.

### Средний приоритет

- `trips.json` хранится в Drive и читается клиентом напрямую.
- Обработка PDF идет в браузере, поэтому данные заказчиков и рейсов проходят через клиентскую среду.
- Gmail отправляется из браузера от имени пользователя.

### Низкий приоритет

- API keys вроде Google Picker/Yandex Maps могут быть публичными, если они ограничены по доменам и квотам.
- PWA/service worker кеширует runtime-файлы, поэтому после смены конфигов нужен жесткий refresh.

## Хронология работ

### Этап 0. Зафиксировать baseline

Задача: не менять архитектуру, а добавить минимальные проверки и убедиться, что репозиторий чистый.

```bash
cd /Users/jaguar/Documents/gruz/repo
git status --short
git log --oneline -5
```

Что должно быть:

- `js/config.js` в `.gitignore`.
- В репозитории нет реальных ключей, реквизитов, телефонов, Drive IDs и email bodies.
- UI-правки закоммичены отдельно от security-работ.

### Этап 1. CI security baseline

Задача: добавить бесплатные проверки в GitHub Actions до архитектурного переноса.

Проверки:

- JS syntax check для всех `js/*.js` и `scripts/*.mjs`.
- Проверка, что `js/config.js` не попал в git.
- Проверка подозрительных секретов в diff.
- `git diff --check`.

Команды локально:

```bash
cd /Users/jaguar/Documents/gruz/repo
find js scripts -type f \( -name "*.js" -o -name "*.mjs" \) -print
```

### Этап 2. Разделить public config и private config

Задача: перестать называть клиентский runtime config секретным.

Оставить во фронте:

- `GCLIENT_ID`
- публичные UI flags
- публичные API keys только при доменных ограничениях

Убрать из клиентского `config.js` на backend:

- `ANALYTICS_ALLOWED_EMAILS`
- `ARCHIVE_ROOT`
- `EMAIL_DRIVE_FOLDER_ID`
- `EMAIL_SUBJECT`
- `EMAIL_BODY`
- `SIGN_EMAIL_SUBJECT`
- `SIGN_EMAIL_BODY`
- `STAMP_FILE_ID`
- `EXECUTOR_PROFILE`
- `EXECUTOR_MARKERS`

### Этап 3. Бесплатный backend на Vercel

Статус: базовый backend развернут на `https://gruz-kappa.vercel.app`.

Задача: добавить serverless API, сохранив GitHub Pages или постепенно переехав на Vercel hosting.

Минимальная структура:

```text
api/
  health.js
  auth/
    me.js
  analytics/
    trips.js
    rebuild.js
  email/
    send.js
```

Первые endpoint-ы:

- `GET /api/health` - проверка deploy.
- `GET /api/auth/me` - проверка Google token и whitelist на сервере.
- `GET /api/analytics/trips` - выдача аналитики только разрешенному пользователю.

### Этап 4. Backend auth gate для аналитики

Статус: выполнено. Frontend проверяет Google token через `GET /api/auth/me`, whitelist хранится только в Vercel.

Задача: убрать клиентский whitelist как источник истины.

Новый поток:

1. Фронт получает Google access token.
2. Фронт отправляет token на backend.
3. Backend проверяет Google `userinfo`.
4. Backend сверяет email с private env `ANALYTICS_ALLOWED_EMAILS`.
5. Backend возвращает только разрешенный результат.

Важно: frontend может показывать красивую заглушку, но решение о доступе принимает backend.

### Этап 5. Drive API через backend

Статус: чтение `trips.json` перенесено на `GET /api/analytics/trips`. Запись и пересборка реестра пока остаются в браузере.

Задача: убрать прямую работу с архивом Drive из браузера.

Переносим:

- чтение `trips.json`;
- поиск registry file;
- пересборку registry;
- чтение PDF из Drive;
- сохранение обновленного `trips.json`.

Фронт получает уже нормализованные данные, а не Drive file IDs.

### Этап 6. Email через backend

Задача: убрать Gmail send и email templates из браузера.

Переносим:

- `EMAIL_SUBJECT`;
- `EMAIL_BODY`;
- `EMAIL_DRIVE_FOLDER_ID`;
- выдачу доступа к папке;
- отправку Gmail.

Фронт отправляет только адрес получателя и действие.

### Этап 7. Scopes и least privilege

Задача: сузить Google OAuth scopes.

Проверить, можно ли заменить:

- `https://www.googleapis.com/auth/drive`
- `https://www.googleapis.com/auth/gmail.send`

на более узкие scopes или разделить авторизацию по действиям.

### Этап 8. Данные и аудит

Задача: добавить прозрачность действий.

Логировать на backend:

- кто открыл аналитику;
- кто пересобрал `trips.json`;
- кто отправил email;
- кто обновил рейс или километраж.

Без хранения лишних персональных данных в логах.

## Ближайший практический шаг

Начать с Этапа 1:

1. Добавить CI workflow `security-baseline.yml`.
2. Добавить scripts для локальной проверки.
3. Проверить, что текущий Pages deploy продолжает работать.

После этого переходить к Vercel API.
