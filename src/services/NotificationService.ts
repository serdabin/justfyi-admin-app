declare global {
  var webViewRef: any;
}

import { getApp } from '@react-native-firebase/app';
import { getMessaging, getToken, onMessage, FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import messaging from '@react-native-firebase/messaging';

import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  EventType,
} from '@notifee/react-native';
import { AuthAPI } from './api';

export class NotificationService {
  static async requestUserPermission() {
    try {
      // Use the namespaced API since that's what's available
      const authStatus = await messaging().requestPermission();

      const enabled = authStatus === messaging.AuthorizationStatus.AUTHORIZED || authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (enabled) {
        const token = await this.getFCMToken();
        console.log('Token obtained:', token ? 'yes' : 'no');
      }

      return enabled;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  static async getFCMToken() {
    try {
      const messaging = getMessaging(getApp());
      const newToken = await getToken(messaging);
      if (newToken) {
        console.log('FCM token case 1:', newToken);
        await AsyncStorage.setItem('fcmToken', newToken);
      }
      console.log('FCM token case 2:', newToken);
      return newToken;
    } catch (error) {
      console.log('Error getting FCM token:', error);
      return null;
    }
  }

  static async onNotificationReceived(callback: (notification: any) => void) {
    // Handle background messages
    const messaging = getMessaging(getApp());
    messaging.setBackgroundMessageHandler(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
      console.log('Message handled in the background!', remoteMessage);
      callback(remoteMessage);
    });

    // Handle foreground messages
    return onMessage(messaging, async remoteMessage => {
      console.log('Received foreground message:', remoteMessage);
      callback(remoteMessage);
    });
  }

  static async handleNotification(remoteMessage: any) {
    console.log('Received notification:', remoteMessage);
    const { data, notification } = remoteMessage;

    // Create a channel for Android
    const channelId = await notifee.createChannel({
      id: 'justfyi-channel',
      name: 'JustFYI Channel',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibration: true,
      sound: 'default',
    });

    // Display the notification
    await notifee.displayNotification({
      title: notification?.title || 'New Notification',
      body: notification?.body || '',
      data: data,
      android: {
        channelId,
        smallIcon: 'ic_notification',
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: 'default',
        },
        color: '#ff5400',
        sound: 'default',
      },
      ios: {
        sound: 'default',
        foregroundPresentationOptions: {
          badge: true,
          sound: true,
          banner: true,
          list: true,
        },
      },
    });
  }

  static async onNotificationPress(data: any, webViewRef: any) {
    switch (data.type) {
      case 'ticket':
        webViewRef.current?.injectJavaScript(
          'window.location.href = "/manage/tickets";'
        );
        break;
      case 'guestChat':
        webViewRef.current?.injectJavaScript(
          'window.location.href = "/manage/guest-chats";'
        );
        break;
      case 'staffChat':
        webViewRef.current?.injectJavaScript(
          'window.location.href = "/manage/staff-chats";'
        );
        break;
      case 'feedback':
        webViewRef.current?.injectJavaScript(
          'window.location.href = "/manage/feedback";'
        );
        break;
    }
  }

  static async initializeNotifications() {
    console.log('Initializing notifications');
    await this.requestUserPermission();

    const messaging = getMessaging(getApp());

    // Add token refresh handler
    messaging.onTokenRefresh(async (newToken: string) => {
      console.log('FCM Token refreshed:', newToken);
      const oldToken = await AsyncStorage.getItem('fcmToken');
      await AsyncStorage.setItem('fcmToken', newToken);

      try {
        const userId = await AsyncStorage.getItem('currentUserId');
        if (userId) {
          if (oldToken) {
            await AuthAPI.removeDeviceToken({
              userId,
              deviceToken: oldToken,
            });
          }
          await AuthAPI.registerDeviceToken({
            userId,
            deviceToken: newToken,
          });
        }
      } catch (error) {
        console.error('Error updating refreshed token:', error);
      }
    });

    // Handle background messages
    messaging.setBackgroundMessageHandler(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
      console.log('Received background message:', remoteMessage);
      await this.handleNotification(remoteMessage);
    });

    // Handle foreground messages
    onMessage(messaging, async remoteMessage => {
      console.log('Received foreground message:', remoteMessage);
      await this.handleNotification(remoteMessage);
    });

    // Set up notifee event listener
    notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification) {
        this.onNotificationPress(detail.notification.data, global.webViewRef);
      }
    });

    notifee.onBackgroundEvent(async ({ type, detail }) => {
      if (type === EventType.PRESS && detail.notification) {
        this.onNotificationPress(detail.notification.data, global.webViewRef);
      }
    });
  }

  public static async clearFCMToken() {
    try {
      // Get current token for backend cleanup
      const token = await AsyncStorage.getItem('fcmToken');

      // Clear local storage
      await AsyncStorage.removeItem('fcmToken');
      await AsyncStorage.removeItem('currentUserId');

      // Delete Firebase token
      await messaging().deleteToken();

      console.log('FCM token cleared successfully');
      return token;  // Return old token in case needed for cleanup
    } catch (error) {
      console.error('Error clearing FCM token:', error);
      return null;
    }
  }

  public static async setCurrentUser(userId: string | number) {
    try {
      // Ensure userId is stored as string
      await AsyncStorage.setItem('currentUserId', String(userId));
    } catch (error) {
      console.error('Error setting current user:', error);
    }
  }
}
