<p align="center">
  <img src="https://raw.githubusercontent.com/vipecoder228/CipherVault/main/resources/icon.png" width="120" alt="CipherVault Logo">
</p>

<h1 align="center">CipherVault</h1>

<p align="center">
  <strong>Безопасный менеджер паролей с шифрованием AES-256-GCM</strong>
</p>

<p align="center">
  <a href="https://github.com/vipecoder228/CipherVault/releases/latest">
    <img src="https://img.shields.io/github/v/release/vipecoder228/CipherVault?style=flat-square&color=blue" alt="Version">
  </a>
  <a href="https://github.com/vipecoder228/CipherVault/actions">
    <img src="https://img.shields.io/github/actions/workflow/status/vipecoder228/CipherVault/build.yml?branch=main&style=flat-square" alt="Build">
  </a>
  <a href="https://github.com/vipecoder228/CipherVault/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/vipecoder228/CipherVault?style=flat-square" alt="License">
  </a>
  <img src="https://img.shields.io/badge/tests-300%20passed-green?style=flat-square" alt="Tests">
  <img src="https://img.shields.io/badge/security-12%2F10-red?style=flat-square" alt="Security">
</p>

<p align="center">
  Windows / Linux / macOS / Android / iOS
</p>

---

## Скачать

📥 [**GitHub Releases**](https://github.com/vipecoder228/CipherVault/releases/latest) — Windows (.exe), Linux (.AppImage / .deb / .rpm), macOS (.dmg)

---

## Безопасность

### Шифрование
| Метод | Описание |
|-------|----------|
| **AES-256-GCM** | Authenticated encryption всех данных |
| **Argon2id** | Memory-hard key derivation (OWASP рекомендация) |
| **Constant-time сравнение** | Защита от timing attacks |
| **CSPRNG** | `crypto.randomInt` для генерации паролей |

### Защита в памяти
- **Secure Memory Guard** — 3-проходное обнуление буферов (0x00 → 0xFF → 0x00)
- **Key Zeroing** — обнуление ключей при блокировке / смене пароля
- **Forward Secrecy** — сессионные ephemeral keys
- **No Plaintext Keys** — ключи хранятся только в памяти, nunca на диске

### Защита приложения
- **Anti-Tamper Detection** — проверка целостности бинарников
- **Screenshot Protection** — защита от скриншотов (macOS)
- **Encrypted Audit Log** — логирование всех действий (зашифровано)
- **Encrypted Metadata** — title и URL зашифрованы в БД

### Защита сети
- **Rate Limiting** — 4→6→8→10 попыток с задержками
- **TLS API** — HTTPS для REST API (self-signed cert)
- **CORS** — только localhost
- **Security Headers** — X-Content-Type-Options, X-Frame-Options
- **Input Validation** — валидация всех входных данных

### Защита паролей
- **k-anonymity** — HIBP API (SHA-1 prefix only)
- **Duplicate Detection** — детекция повторяющихся паролей
- **Crack Time Estimation** — оценка времени взлома
- **Clipboard Auto-Clear** — настраиваемое время (10с / 30с / 1-5мин / отключено)
- **Push Notifications** — уведомления при обнаружении утечек

### Защита данных
- **Secure Storage** — шифрование секретов в localStorage (PBKDF2 + AES-GCM)
- **Encrypted Sync Password** — пароль синхронизации шифруется перед сохранением
- **Memory Guard** — 3-проходное обнуление буферов (secureWipe)
- **Key Zeroing** — обнуление ключей при блокировке / смене пароля
- **HMAC Audit Log** — целостность аудит-лога через HMAC-SHA256 подписи
- **Password Age Tracking** — отслеживание даты смены пароля

---

## Функции

### Passkeys / FIDO2
- Создание passkeys через WebAuthn API
- Хранение метаданных в зашифрованном vault
- Поддержка биометрической аутентификации

### Кастомные поля
- Текст, пароль, URL, email, телефон
- Добавление / удаление в Create / Edit модалах
- Шифрование вместе с остальными данными

### Генератор паролей
| Режим | Описание |
|-------|----------|
| **Password** | Случайные символы |
| **Passphrase** | BIP39 слова |
| **Username** | Прилагательное + существительное + число |

- Пресеты: PIN, Standard, Strong, Passphrase
- Экспорт / импорт пресетов в JSON
- Настраиваемая длина и типы символов

### Массовые операции
- Ctrl+Click для выбора нескольких записей
- Массовое удаление
- Панель действий при выборе

### Горячие клавиши
| Комбинация | Действие |
|------------|----------|
| `↑` `↓` / `j` `k` | Навигация |
| `Ctrl+C` | Копировать пароль |
| `Ctrl+U` | Копировать логин |
| `Delete` | Удалить запись |
| `Escape` | Снять выделение |

### Здоровье паролей
- Анализ слабых / повторяющихся / утёкших паролей
- Тренд здоровья (диаграмма)
- Оценка времени взлома
- Push-уведомления при утечках

### Сортировка
- По дате, имени, типу
- Переключение asc / desc

---

## UI / UX

- Настройка размера шрифта (small / normal / large)
- Недавние копирования
- Экспорт / импорт настроек
- Контекстное меню (правый клик)
- Шаблоны записей (Email, Social, Banking...)
- Автозаполнение URL из названия
- Тёмная / светлая тема

---

## Интеграции

| Сервис | Описание |
|--------|----------|
| **Telegram** | Уведомления о утечках |
| **Push** | Capacitor LocalNotifications |
| **REST API** | HTTPS, порт 19824 |
| **Google Drive** | Синхронизация vault |
| **Browser Extension** | Chrome, автозаполнение |

---

## Платформы

| Платформа | Технология | Статус |
|-----------|------------|--------|
| **Windows** | Electron | ✅ Готово |
| **macOS** | Electron | ✅ Готово |
| **Linux** | Electron | ✅ Готово |
| **Android** | Capacitor | ✅ Готово |
| **iOS** | Capacitor | 🔄 В разработке |
| **Chrome** | Extension | ✅ Готово |

---

## Мобильное приложение

### Возможности
- Биометрическая аутентификация (Face ID / Touch ID)
- Autofill URL matching
- Auto-lock при уходе в фон
- Push-уведомления при утечках
- Google Drive синхронизация
- Offline-first архитектура

### Сборка Android

```bash
npm run dist:android
```

---

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

---

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

---

## Технологии

| Уровень | Технология |
|---------|------------|
| Десктоп | Electron 33 |
| Мобильное | Capacitor 8 |
| Интерфейс | React 19 + TypeScript |
| Крипто | AES-256-GCM + Argon2id |
| БД | sql.js (SQLite) |
| Тесты | Vitest (300 tests) |
| API | REST / HTTPS (port 19824) |
| Passkeys | WebAuthn API |

---

## Архитектура

```
CipherVault v14.0.4
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

---

## Лицензия

[MIT](LICENSE)
