declare global {
  var webViewRef: any;
}

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
    const authStatus = await messaging().requestPermission();
    const enabled =
      authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
      authStatus === messaging.AuthorizationStatus.PROVISIONAL;

    if (enabled) {
      console.log('Authorization status:', authStatus);
      await this.getFCMToken();
    }
  }

  static async getFCMToken() {
    try {
      const newToken = await messaging().getToken();
      if (newToken) {
        console.log('FCM token:', newToken);
        await AsyncStorage.setItem('fcmToken', newToken);
      }
      return newToken;
    } catch (error) {
      console.log('Error getting FCM token:', error);
      return null;
    }
  }


  static async onNotificationReceived(callback: (notification: any) => void) {
    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('Message handled in the background!', remoteMessage);
      callback(remoteMessage);
    });

    // Handle foreground messages
    return messaging().onMessage(async remoteMessage => {
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

    // Add token refresh handler
    messaging().onTokenRefresh(async (newToken) => {
      console.log('FCM Token refreshed:', newToken);
      const oldToken = await AsyncStorage.getItem('fcmToken');
      await AsyncStorage.setItem('fcmToken', newToken);

      try {
        const userId = await AsyncStorage.getItem('currentUserId');
        if (userId) {
          if (oldToken) {
            await AuthAPI.removeDeviceToken({
              userId,
              deviceToken: oldToken
            });
          }
          await AuthAPI.registerDeviceToken({
            userId,
            deviceToken: newToken
          });
        }
      } catch (error) {
        console.error('Error updating refreshed token:', error);
      }
    });


    // Handle background messages
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      await this.handleNotification(remoteMessage);
    });

    // Handle foreground messages
    messaging().onMessage(async remoteMessage => {
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
      await AsyncStorage.removeItem('fcmToken');
      await messaging().deleteToken();
      return true;
    } catch (error) {
      console.error('Error clearing FCM token:', error);
      return false;
    }
  }
}
