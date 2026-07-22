// Push Notification Service
// Sends breach alerts and security notifications to mobile devices

import { isCapacitor } from '../../shared/bridge'

export interface NotificationPayload {
  title: string
  body: string
  data?: Record<string, any>
}

export interface PushNotificationService {
  isAvailable(): Promise<boolean>
  requestPermission(): Promise<boolean>
  hasPermission(): Promise<boolean>
  sendLocalNotification(payload: NotificationPayload): Promise<void>
  registerForPush(): Promise<string | null>
}

// ─── Capacitor Implementation ─────────────────────────

const capacitorPushNotification: PushNotificationService = {
  async isAvailable(): Promise<boolean> {
    try {
      await import('@capacitor/push-notifications')
      return true
    } catch {
      return false
    }
  },

  async requestPermission(): Promise<boolean> {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const permission = await PushNotifications.requestPermissions()
      return permission.receive === 'granted'
    } catch {
      return false
    }
  },

  async hasPermission(): Promise<boolean> {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const permission = await PushNotifications.checkPermissions()
      return permission.receive === 'granted'
    } catch {
      return false
    }
  },

  async sendLocalNotification(payload: NotificationPayload): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      await LocalNotifications.schedule({
        notifications: [{
          title: payload.title,
          body: payload.body,
          id: Math.floor(Math.random() * 1000000),
          extra: payload.data || {},
        }],
      })
    } catch (error) {
      console.error('Failed to send local notification:', error)
    }
  },

  async registerForPush(): Promise<string | null> {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications')
      await PushNotifications.register()

      return new Promise((resolve) => {
        PushNotifications.addListener('registration', (token) => {
          resolve(token.value)
        })

        PushNotifications.addListener('registrationError', () => {
          resolve(null)
        })

        // Timeout after 10 seconds
        setTimeout(() => resolve(null), 10000)
      })
    } catch {
      return null
    }
  },
}

// ─── Web Fallback ─────────────────────────────────────

const webPushNotification: PushNotificationService = {
  async isAvailable(): Promise<boolean> {
    return 'Notification' in window
  },

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    return result === 'granted'
  },

  async hasPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false
    return Notification.permission === 'granted'
  },

  async sendLocalNotification(payload: NotificationPayload): Promise<void> {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    new Notification(payload.title, { body: payload.body, icon: '/icon.png' })
  },

  async registerForPush(): Promise<string | null> {
    // Web push requires a service worker and is more complex
    // For now, return null — local notifications work via Notification API
    return null
  },
}

// ─── Factory ──────────────────────────────────────────

export function getPushNotificationService(): PushNotificationService {
  if (isCapacitor) return capacitorPushNotification
  return webPushNotification
}

let service: PushNotificationService | null = null

export function getPushNotification(): PushNotificationService {
  if (!service) {
    service = getPushNotificationService()
  }
  return service
}

export default getPushNotification
