// Централизованные сообщения об ошибках на русском

export const ERRORS = {
  // Vault
  VAULT_ALREADY_INITIALIZED: 'Хранилище уже создано',
  VAULT_NOT_INITIALIZED: 'Хранилище не создано',
  VAULT_NOT_FOUND: 'Хранилище не найдено',
  VAULT_IS_LOCKED: 'Хранилище заблокировано',
  VAULT_IS_UNLOCKED: 'Хранилище уже разблокировано',
  LOCK_BEFORE_SWITCH: 'Заблокируйте хранилище перед переключением',

  // Auth
  INVALID_MASTER_PASSWORD: 'Неверный мастер-пароль',
  CURRENT_PASSWORD_INCORRECT: 'Текущий пароль неверен',
  TOO_MANY_ATTEMPTS: 'Слишком много неудачных попыток. Перезапустите приложение.',

  // TOTP
  TOTP_CODE_REQUIRED: 'Введите код TOTP',
  TOTP_INVALID_CODE: 'Неверный код TOTP',
  TOTP_CORRUPTED: 'Конфигурация TOTP повреждена',
  TOTP_SETUP_IN_PROGRESS: 'Настройка TOTP уже выполняется',
  TOTP_RE_ENCRYPT_FAILED: 'Не удалось повторно зашифровать секрет TOTP',

  // Alarm
  ALARM_PASSWORD_NOT_SET: 'Пароль принуждения не настроен',
  ALARM_PASSWORD_INVALID: 'Неверный пароль принуждения',

  // Backup
  BACKUP_PASSWORD_REQUIRED: 'Введите пароль для бэкапа',
  BACKUP_CANCELLED: 'Отменено',
  BACKUP_FORMAT_INVALID: 'Неверный формат бэкапа',
  BACKUP_DECRYPT_FAILED: 'Ошибка расшифровки: неверный пароль или повреждённый файл',
  BACKUP_FILE_TOO_SMALL: 'Файл бэкапа слишком мал',
  BACKUP_BAD_MAGIC: 'Неверный формат файла бэкапа',
  BACKUP_UNSUPPORTED_VERSION: 'Неподдерживаемая версия бэкапа',
  BACKUP_FAILED_SAVE: 'Не удалось сохранить бэкап',
  BACKUP_NO_WINDOW: 'Нет доступного окна',

  // Sync
  SYNC_NOT_CONFIGURED: 'Синхронизация не настроена',
  SYNC_EXPORT_FAILED: 'Ошибка экспорта',
  SYNC_FOLDER_SET: 'Папка синхронизации: {folder}',
  SYNC_FOLDER_FAILED: 'Не удалось выбрать папку',
  SYNC_SUCCESS: 'Синхронизация выполнена',
  SYNC_FAILED: 'Ошибка синхронизации',
  SYNC_DISABLED: 'Синхронизация отключена',
  SYNC_DISABLE_FAILED: 'Не удалось отключить синхронизацию',
  SYNC_PASSWORD_FIRST: 'Сначала введите пароль синхронизации',

  // Shortcut
  SHORTCUT_INVALID_FORMAT: 'Неверный формат горячей клавиши',
  SHORTCUT_REGISTER_FAILED: 'Не удалось зарегистрировать горячую клавишу. Возможно, она занята другим приложением.',

  // Entries
  ENTRY_TITLE_REQUIRED: 'Введите название',
  ENTRY_CREATED: 'Запись создана',
  ENTRY_CREATE_FAILED: 'Не удалось создать запись',
  ENTRY_DELETED: 'Запись удалена',

  // Clipboard
  COPIED: 'Скопировано',
  COPY_FAILED: 'Не удалось скопировать',
  CLIPBOARD_CLEARED: 'Буфер обмена очищен',
  CLIPBOARD_CLEAR_FAILED: 'Не удалось очистить буфер',

  // Duress
  DURESS_CODE_SET: 'Код принуждения настроен',
  DURESS_CODE_SET_FAILED: 'Не удалось настроить код принуждения',
  DURESS_CODE_REMOVED: 'Код принуждения удалён',
  DURESS_CODE_REMOVE_FAILED: 'Не удалось удалить код принуждения',
  DURESS_PASSWORDS_DONT_MATCH: 'Пароли не совпадают',
  DURESS_PASSWORD_MIN_LENGTH: 'Пароль должен быть не менее 4 символов',
  DURESS_PASSWORD_REQUIRED: 'Введите пароль',
  DURESS_BACKUP_PASSWORD_REQUIRED: 'Введите пароль для бэкапа',
  DURESS_BACKUP_PASSWORDS_DONT_MATCH: 'Пароли бэкапа не совпадают',

  // Email
  EMAIL_CREATED: 'Email создан: {address}',
  EMAIL_CREATE_FAILED: 'Не удалось создать email',
  EMAIL_DELETED: 'Email удалён',
  EMAIL_DELETE_FAILED: 'Не удалось удалить email',
  MESSAGE_DELETED: 'Сообщение удалено',
  MESSAGE_DELETE_FAILED: 'Не удалось удалить сообщение',
  EMAILS_LOAD_FAILED: 'Не удалось загрузить emails',
  MESSAGE_LOAD_FAILED: 'Не удалось загрузить сообщение',
  MESSAGE_COPY_FAILED: 'Не удалось скопировать сообщение',

  // Telegram
  TELEGRAM_CONNECTED: 'Бот подключён: @{botName}',
  TELEGRAM_INVALID_TOKEN: 'Неверный токен',
  TELEGRAM_CONNECTION_FAILED: 'Ошибка подключения',
  TELEGRAM_BACKUP_SENT: 'Бэкап отправлен в Telegram',
  TELEGRAM_BACKUP_SAVED: 'Бэкап сохранён',
  TELEGRAM_BACKUP_WIPED: 'Данные удалены',

  // Emergency
  RECOVERY_PASSWORD_REQUIRED: 'Введите пароль восстановления',
  RECOVERY_PASSWORDS_DONT_MATCH: 'Пароли не совпадают',
  RECOVERY_PASSWORD_MIN_LENGTH: 'Пароль должен быть не менее 8 символов',
  EMERGENCY_BACKUP_CREATED: 'Экстренный бэкап создан',
  EMERGENCY_BACKUP_FAILED: 'Не удалось создать экстренный бэкап',

  // Settings
  SETTINGS_PASSWORD_CHANGED: 'Мастер-пароль изменён',
  SETTINGS_PASSWORD_CHANGE_FAILED: 'Не удалось изменить пароль',
  SETTINGS_PASSWORDS_DONT_MATCH: 'Пароли не совпадают',
  SETTINGS_PASSWORD_MIN_LENGTH: 'Пароль должен быть не менее 8 символов',
  SETTINGS_FILL_ALL: 'Заполните все поля',
  SETTINGS_2FA_ENABLED: '2FA включена',
  SETTINGS_2FA_DISABLED: '2FA отключена',
  SETTINGS_2FA_INVALID: 'Неверный код',
  SETTINGS_SHORTCUT_UPDATED: 'Горячая клавиша обновлена',
  SETTINGS_SHORTCUT_FAILED: 'Не удалось обновить горячую клавишу',
  SETTINGS_AUTO_LOCK_DESC: 'Автоблокировка настроена',

  // Import/Export
  IMPORT_SUCCESS: 'Импортировано {count} записей',
  IMPORT_FAILED: 'Ошибка импорта',
  EXPORT_SUCCESS: 'Экспорт завершён',
  EXPORT_FAILED: 'Ошибка экспорта',
  PANIC_BACKUP_IMPORTED: 'Восстановлено {count} записей из бэкапа',
  PANIC_BACKUP_IMPORT_FAILED: 'Ошибка импорта бэкапа',
  PANIC_BACKUP_PASSWORD_REQUIRED: 'Введите пароль бэкапа',

  // General
  OPERATION_FAILED: 'Операция не удалась',
  NETWORK_ERROR: 'Ошибка сети',
  UNKNOWN_ERROR: 'Неизвестная ошибка',
} as const

export type ErrorKey = keyof typeof ERRORS
