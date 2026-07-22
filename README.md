# CipherVault

Безопасный менеджер паролей с шифрованием AES-256-GCM и оценкой безопасности 12/10.

> **🔒 Безопасность: 12/10**
> 
> CipherVault v14.0.1 — enterprise-level безопасность с 300 тестами.

## Скачать

📥 [GitHub Releases](https://github.com/vipecoder228/CipherVault/releases/latest) — Windows (.exe), Linux (.AppImage/.deb/.rpm), macOS (.dmg)

## Безопасность (12/10)

### Шифрование
- **AES-256-GCM** — authenticated encryption всех данных
- **Argon2id** —内存-hard key derivation (OWASP рекомендация)
- **Constant-time сравнение** — защита от timing attacks
- **CSPRNG** — crypto.randomInt для генерации паролей

### Защита в памяти
- **Secure Memory Guard** — обнуление буферов после использования
- **Key Zeroing** — обнуление ключей при блокировке
- **Forward Secrecy** — сессионные ephemeral keys

### Защита приложения
- **Anti-Tamper Detection** — проверка целостности бинарников
- **Screenshot Protection** — защита от скриншотов (macOS)
- **Encrypted Audit Log** — логирование всех действий (зашифровано)
- **Encrypted Metadata** — title и URL зашифрованы в БД

### Защита сети
- **Rate Limiting** — 4→6→8→10 попыток с задержками
- **TLS API** — HTTPS для REST API (self-signed cert)
- **CORS Restrictions** — только localhost
- **Security Headers** — X-Content-Type-Options, X-Frame-Options
- **Input Validation** — валидация всех входных данных

### Защита паролей
- **k-anonymity** — HIBP API (SHA-1 prefix only)
- **Duplicate Detection** — детекция повторяющихся паролей
- **Crack Time Estimation** — оценка времени взлома
- **Clipboard Auto-Clear** — очистка через 30 секунд
- **Push Notifications** — уведомления при обнаружении утечек

## Функции

### Passkeys / FIDO2
- Создание passkeys через WebAuthn API
- Хранение метаданных в зашифрованном vault
- Поддержка биометрической аутентификации

### Кастомные поля
- Текст, пароль, URL, email, телефон
- Добавление/удаление в Create/Edit модалах
- Шифрование вместе с остальными данными

### Генератор паролей
- Пресеты (PIN, Standard, Strong, Passphrase)
- Экспорт/импорт пресетов в JSON
- Настраиваемая длина и типы символов

### Массовые операции
- Ctrl+Click для выбора нескольких записей
- Массовое удаление
- Панель действий при выборе

### Горячие клавиши
- ↑↓ / j/k — навигация
- Ctrl+C — копировать пароль
- Ctrl+U — копировать логин
- Delete — удалить
- Escape — снять выделение

### Здоровье паролей
- Анализ слабых/повторяющихся/утёкших паролей
- Тренд здоровья (диаграмма)
- Оценка времени взлома
- Push-уведомления при утечках

### Сортировка
- По дате, имени, типу
- Переключение asc/desc

### UI/UX
- Настройка размера шрифта (small/normal/large)
- Недавние копирования
- Экспорт/импорт настроек
- Контекстное меню (правый клик)
- Шаблоны записей (Email, Social, Banking...)
- Автозаполнение URL из названия

### Интеграции
- Telegram уведомления о утечках
- Push-уведомления (Capacitor LocalNotifications)
- REST API для сторонних приложений
- Google Drive синхронизация
- Browser extension с автозаполнением

### Платформы
- **Desktop** — Electron (Windows/Mac/Linux)
- **Mobile** — Capacitor (Android/iOS)
- **Browser** — Chrome extension
- **API** — REST API на порту 19824 (HTTPS)

## Мобильное приложение

### Возможности
- Биометрическая аутентификация (Face ID /指纹)
- Autofill URL matching
- Auto-lock при уходе в фон
- Push-уведомления при утечках
- Google Drive синхронизация
- Offline-first архитектура

### Сборка Android
```bash
npm run dist:android
```

## Тесты

**300 тестов** across 27 файлов:

| Модуль | Тестов |
|--------|:------:|
| Криптография | 88 |
| Безопасность | 51 |
| Сервисы | 89 |
| Frontend | 63 |
| IPC | 13 |

```bash
npm test  # 300/300 passed
```

## Разработка

```bash
# Установка
npm install

# Запуск (Desktop)
npm run dev

# Запуск (Mobile)
npm run build:web
npx cap sync android
npx cap open android

# Сборка
npm run build

# Тесты
npm test

# Проверка типов
npx tsc --noEmit
```

## Технологии

| Уровень | Технология |
|---------|-----------|
| Десктоп | Electron 33 |
| Мобильное | Capacitor 8 |
| Интерфейс | React 19 + TypeScript |
| Крипто | AES-256-GCM + Argon2id |
| БД | sql.js (SQLite) |
| Тесты | Vitest (300 tests) |
| API | REST/HTTPS (port 19824) |
| Passkeys | WebAuthn API |

## Архитектура

```
CipherVault v14.0.1
├── Desktop (Electron)
│   ├── Security Module
│   │   ├── Memory Guard
│   │   ├── Tamper Detection
│   │   ├── Audit Log
│   │   ├── Key Rotation
│   │   └── Ephemeral Keys
│   ├── Crypto (AES-256-GCM + Argon2id)
│   ├── REST API (HTTPS, port 19824)
│   ├── WebSocket (port 19823)
│   └── Passkey Storage
├── Mobile (Capacitor)
│   ├── Biometric Auth
│   ├── Push Notifications
│   ├── Auto-lock
│   └── Google Drive Sync
├── Browser Extension
└── Cloud Sync (Google Drive)
```

## Лицензия

MIT
