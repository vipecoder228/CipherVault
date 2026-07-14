import type { en } from './en'

export default {
  // Security Health
  health_title: 'Безопасность паролей',
  health_analyzed: 'Проанализировано паролей: {n}',
  health_reanalyze: 'Анализировать заново',
  health_weak: 'Слабые',
  health_reused: 'Повторяющиеся',
  health_old: 'Устаревшие',
  health_issues_found: 'Найденные проблемы',
  health_all_good: 'Все пароли в порядке!',
  health_score_good: 'Хорошо',
  health_score_fair: 'Нормально',
  health_score_weak: 'Слабо',
  health_analyzing: 'Анализ...',

  // Health issues
  missing_uppercase: 'Нет заглавных букв',
  missing_lowercase: 'Нет строчных букв',
  missing_numbers: 'Нет цифр',
  missing_special: 'Нет специальных символов',
  breached: 'Обнаружен в утечках данных',
  old_password: 'Пароль старше 180 дней',
  reused: 'Используется в нескольких записях',

  // Settings
  settings_title: 'Настройки',
  tab_security: 'Безопасность',
  tab_appearance: 'Внешний вид',
  tab_about: 'О приложении',
  theme_label: 'Тема',
  language_label: 'Язык',
  dark: 'Тёмная',
  light: 'Светлая',

  // Security settings
  change_master_password: 'Изменить мастер-пароль',
  current_password: 'Текущий пароль',
  new_password: 'Новый пароль',
  confirm_password: 'Подтвердите пароль',
  update_password: 'Обновить пароль',
  totp_enabled: 'Двухфакторная аутентификация',
  setup_totp: 'Настроить 2FA',
  disable_totp: 'Отключить 2FA',
  auto_lock: 'Авто-блокировка',
  global_shortcut: 'Глобальная горячая клавиша',
  backup_export: 'Экспорт резервной копии',
  backup_import: 'Импорт резервной копии',
  security_health: 'Безопасность паролей',
  emergency_access: 'Экстренный доступ',
  duress_code: 'Код под принуждением',
  setup_duress: 'Настроить код под принуждением',
  remove_duress: 'Удалить код под принуждением',
  clipboard_clear: 'Автоочистка буфера',

  // About
  about_title: 'CipherVault',
  about_subtitle: 'Менеджер паролей',
  about_description: 'Безопасный менеджер паролей с шифрованием AES-256-GCM. Все данные хранятся локально и зашифрованы вашим мастер-паролем. Архитектура нулевого знания — мы никогда не видим ваши пароли.',

  // Toasts
  toast_password_updated: 'Пароль обновлён',
  toast_totp_enabled: 'Двухфакторная аутентификация включена',
  toast_totp_disabled: 'Двухфакторная аутентификация отключена',
  toast_shortcut_updated: 'Горячая клавиша обновлена',
  toast_autolock_updated: 'Авто-блокировка обновлена',
  toast_backup_exported: 'Резервная копия экспортирована',
  toast_backup_imported: 'Резервная копия импортирована',
  toast_health_failed: 'Не удалось проанализировать пароли',
  toast_clipboard_cleared: 'Буфер очищен',
  toast_duress_removed: 'Код под принуждением удалён',
  toast_fill_all: 'Заполните все поля',
  toast_passwords_no_match: 'Пароли не совпадают',
  toast_password_min: 'Пароль должен содержать минимум 8 символов',
  toast_error: 'Произошла ошибка',
} as const
