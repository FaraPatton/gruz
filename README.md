<div align="center">

# GRUZ

**Автоматизация грузоперевозок, документооборота, архива и управленческой аналитики**

[Открыть приложение](https://gruz-kappa.vercel.app) · [Security roadmap](docs/security-roadmap.md) · [Архитектура backend](docs/vercel-backend.md)

</div>

Трансформация локального бизнеса в прозрачную управляемую систему. Проект заменяет ручные операции алгоритмами, снижает влияние человеческого фактора и объединяет ключевые процессы грузоперевозок в одном интерфейсе.

## Финальная сводка по безопасности

[![Финальная сводка по безопасности GRUZ](docs/security-final-report.png)](https://raw.githubusercontent.com/FaraPatton/gruz/main/docs/security-final-report.png)

Основной production-контур размещён на Vercel. Google OAuth работает через серверную зашифрованную сессию, чувствительная конфигурация хранится в Vercel Environment Variables, а операции с рейсами, архивом, PDF, печатью и email проходят через защищённые serverless API.
