# CipherVault

Безопасный менеджер паролей с шифрованием AES-256-GCM и оценкой безопасности 12/10.

> **🔒 Безопасность: 12/10**
> 
> CipherVault v14.0.0 — enterprise-level безопасность с 303 тестами.

## Скачать

📥 [GitHub Releases](https://github.com/vipecoder228/CipherVault/releases/latest) — Windows (.exe), Linux (.AppImage/.deb/.rpm), macOS (.dmg)

## Безопасность (12/10)

### Шифрование
- **AES-256-GCM** — authenticated encryption всех данных
- **PBKDF2 600K** — итераций для защиты от brute-force
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

### Защита сети
- **Rate Limiting** — 4→6→8→10 попыток с задержками
- **CORS Restrictions** — только localhost
- **Security Headers** — X-Content-Type-Options, X-Frame-Options
- **Input Validation** — валидация всех входных данных

### Защита паролей
- **k-anonymity** — HIBP API (SHA-1 prefix only)
- **Duplicate Detection** — детекция повторяющихся паролей
- **Crack Time Estimation** — оценка времени взлома
- **Clipboard Auto-Clear** — очистка через 30 секунд

## Функции

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
- REST API для сторонних приложений
- Google Drive синхронизация
- Browser extension с автозаполнением

### Платформы
- **Desktop** — Electron (Windows/Mac/Linux)
- **Mobile** — Capacitor (Android/iOS)
- **Browser** — Chrome/Edge/Firefox extension
- **API** — REST API на порту 19824

## Тесты

**303 теста** across 27 файлов:

| Модуль | Тестов |
|--------|:------:|
| Криптография | 88 |
| Безопасность | 51 |
| Сервисы | 89 |
| Frontend | 63 |
| IPC | 13 |

```bash
npm test  # 303/303 passed
```

## Разработка

```bash
# Установка
npm install

# Запуск
npm run dev

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
| Крипто | AES-256-GCM + PBKDF2 600K |
| БД | sql.js (SQLite) |
| Тесты | Vitest (303 tests) |
| API | REST (port 19824) |

## Архитектура

```
CipherVault v14.0.0
├── Desktop (Electron)
│   ├── Security Module
│   │   ├── Memory Guard
│   │   ├── Tamper Detection
│   │   ├── Audit Log
│   │   ├── Key Rotation
│   │   └── Ephemeral Keys
│   ├── Crypto (AES-256-GCM)
│   ├── REST API (port 19824)
│   └── WebSocket (port 19823)
├── Mobile (Capacitor)
├── Browser Extension
└── Cloud Sync (Google Drive)
```

## Лицензия

MIT
