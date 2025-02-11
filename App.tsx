import React, { useEffect, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from 'react-native-splash-screen';
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
  Notification,
  EventType,
} from '@notifee/react-native';

// Update the interfaces to match your API response formats
interface TicketNotification {
  type: 'ticket';
  id: number;
  title: string;
  isViewed: boolean;
}

interface GuestChatNotification {
  type: 'guestChat';
  id: number;
  uuid: string;
  guestName: string;
  hotelName: string;
  hotelGroup: string;
  hotelGroupId: number;
  hotelId: number;
  guestId: number;
  hasPicture: string | null;
  lastMessage: string;
  lastMessageId: number | null;
  lastMessageTime: string;
  lastActivity: string;
  isActive: boolean;
  surveyResponseId: number;
  submittedAt: string;
  unreadCount: number;
}

interface StaffChatNotification {
  type: 'staffChat';
  id: number;
  firstName: string;
  lastName: string;
  chatRoomUuid: string | null;
  avatar: string | null;
  hotel: number | null;
  hotelGroup: number;
  lastMessage: string | null;
  lastMessageId: number | null;
  role: string[];
  hasPicture: string | null;
  lastMessageTime: string | null;
  unreadMessageCount: number;
}

type WebViewMessage = {
  type: 'ticket' | 'guestChat' | 'staffChat' | 'system';
  data: TicketNotification[] | GuestChatNotification[] | StaffChatNotification[];
};

interface NotificationTracker {
  tickets: Set<number>;  // Store ticket IDs
  guestChats: Set<number>;  // Store chat UUIDs
  staffChats: Set<number>;  // Store staff chat IDs
}

function App(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);
  const shownNotifications = useRef<NotificationTracker>({
    tickets: new Set(),
    guestChats: new Set(),
    staffChats: new Set(),
  });

  // Request notification permissions
  useEffect(() => {
    requestPermissions();
    setupNotificationListeners();

    SplashScreen.hide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestPermissions = async () => {
    try {
      const settings = await notifee.requestPermission();
      if (settings.authorizationStatus === AuthorizationStatus.DENIED) {
        console.log('User denied notifications permission');
      }
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  };

  const setupNotificationListeners = () => {
    notifee.onForegroundEvent(({ type, detail }: any) => {
      if (type === EventType.PRESS) {
        handleNotificationPress(detail.notification);
      }
    });

    notifee.onBackgroundEvent(async ({ type, detail }: any) => {
      if (type === EventType.PRESS) {
        handleNotificationPress(detail.notification);
      }
    });
  };

  const handleNotificationPress = async (notification: Notification | null) => {
    if (!notification?.data) {
      return;
    }
    const data = notification.data;
    switch (data.type) {
      case 'ticket':
        webViewRef.current?.injectJavaScript('window.location.href = \'/manage/tickets\';');
        clearTicketNotification(Number(data.id));
        break;
      case 'guestChat':
        webViewRef.current?.injectJavaScript('window.location.href = \'/manage/guest-chats\';');
        clearGuestChatNotification(Number(data.id));
        break;
      case 'staffChat':
        webViewRef.current?.injectJavaScript('window.location.href = \'/manage/staff-chats\';');
        clearStaffChatNotification(Number(data.id));
        break;
    }
  };

  const sendPushNotification = async (title: string, message: string, data: any = {}) => {
    try {
      // Create a channel if it doesn't exist (Android requirement)
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
        title,
        body: message,
        data,
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
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  };

  // Update your existing notification handlers
  const handleTicketNotifications = (notifications: TicketNotification[]) => {
    notifications.forEach(notification => {
      if (!notification.isViewed && !shownNotifications.current.tickets.has(notification.id)) {
        sendPushNotification(
          'New Ticket',
          notification.title,
          { type: 'ticket', id: notification.id }
        );
        shownNotifications.current.tickets.add(notification.id);
      }
    });
  };

  const handleGuestChatNotifications = (notifications: GuestChatNotification[]) => {
    notifications.forEach(notification => {
      const lastMessageId = notification.lastMessageId;

      if (notification.unreadCount > 0 && notification.lastMessage && lastMessageId !== null && !shownNotifications.current.guestChats.has(lastMessageId)) {
        sendPushNotification(
          `New Guest Message - ${notification.guestName}`,
          `${notification.hotelName}: ${notification.lastMessage}`,
          { type: 'guestChat', uuid: notification.uuid }
        );
        shownNotifications.current.guestChats.add(lastMessageId);
      }
    });
  };

  const handleStaffChatNotifications = (notifications: StaffChatNotification[]) => {
    notifications.forEach(notification => {
      const lastMessageId = notification.lastMessageId;
      if (notification.unreadMessageCount > 0 && notification.lastMessage && lastMessageId !== null && !shownNotifications.current.staffChats.has(lastMessageId)) {
        const senderName = `${notification.firstName} ${notification.lastName}`;
        sendPushNotification(
          `New Staff Message - ${senderName}`,
          notification.lastMessage,
          { type: 'staffChat', id: lastMessageId }
        );
        shownNotifications.current.staffChats.add(lastMessageId);
      }
    });
  };

  const onWebViewMessage = (event: any) => {
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);
      console.log('Received message:', message);

      switch (message.type) {
        case 'ticket':
          handleTicketNotifications(message.data as TicketNotification[]);
          break;
        case 'guestChat':
          handleGuestChatNotifications(message.data as GuestChatNotification[]);
          break;
        case 'staffChat':
          handleStaffChatNotifications(message.data as StaffChatNotification[]);
          break;
        case 'system':
          console.log('System message received:', message.data);
          break;
        default:
          console.warn('Unknown message type received:', message);
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  // Update the injected JavaScript to handle the specific events
  const injectedJavaScript = `
    (function() {
      // Function to safely handle message posting
      function postMessage(type, data) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: type,
          data: data
        }));
      }

      // Listen for ticket notifications
      window.addEventListener('ticketNotifications', function(e) {
        postMessage('ticket', e.detail);
      });

      // Listen for guest chat notifications
      window.addEventListener('guestChatNotifications', function(e) {
        postMessage('guestChat', e.detail);
      });

      // Listen for staff chat notifications
      window.addEventListener('staffChatNotifications', function(e) {
        postMessage('staffChat', e.detail);
      });

      // Notify that WebView is loaded
      postMessage('system', { message: 'WebView Loaded' });
    })();
  `;

  // Clear old notifications periodically (optional)
  useEffect(() => {
    const CLEAR_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
    const interval = setInterval(() => {
      shownNotifications.current = {
        tickets: new Set(),
        guestChats: new Set(),
        staffChats: new Set(),
      };
    }, CLEAR_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Add these methods to clear shown notifications when user views them
  const clearTicketNotification = (ticketId: number) => {
    shownNotifications.current.tickets.delete(ticketId);
  };

  const clearGuestChatNotification = (lastMessageId: number) => {
    shownNotifications.current.guestChats.delete(lastMessageId);
  };

  const clearStaffChatNotification = (chatId: number) => {
    shownNotifications.current.staffChats.delete(chatId);
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.action === 'view') {
        handleNotificationClick(data);
      } else {
        onWebViewMessage(event);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };

  const handleNotificationClick = (event: any) => {
    const data = event.data;
    switch (data.type) {
      case 'viewTicket':
        clearTicketNotification(data.ticketId);
        break;
      case 'viewGuestChat':
        clearGuestChatNotification(data.chatUuid);
        break;
      case 'viewStaffChat':
        clearStaffChatNotification(data.chatId);
        break;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        translucent
        backgroundColor="transparent"
        barStyle={'light-content'}
      />
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://test-admin.justfyi.io/auth/login' }}
        style={styles.container}
        originWhitelist={['*']}
        allowFileAccess={true}
        downloadingMessage="Downloading"
        lackPermissionToDownloadMessage="Cannot download files as permission was denied."
        onMessage={handleWebViewMessage}
        injectedJavaScript={injectedJavaScript}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    height: '100%',
    width: '100%',
  },
});

export default App;
