import React, { useEffect, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { SafeAreaProvider } from 'react-native-safe-area-context';
import SplashScreen from 'react-native-splash-screen';
import { NotificationService } from './src/services/NotificationService';
import { AuthAPI } from './src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

type WebViewMessage = {
  type: 'login' | 'logout' | 'system';
  data: {
    user_data?: {
      id: string;
    };
    userId?: string;
    message?: string;
  };
};

function App(): React.JSX.Element {
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    const initializeApp = async () => {
      // Store webViewRef globally for notification handling
      (global as any).webViewRef = webViewRef;

      // Initialize notifications and handle token refresh
      await NotificationService.initializeNotifications();

      // Hide splash screen after initialization
      SplashScreen.hide();
    };

    initializeApp();
  }, []);

  const onWebViewMessage = async (event: any) => {
    console.log('Received message:', event.nativeEvent.data);
    try {
      const message: WebViewMessage = JSON.parse(event.nativeEvent.data);
      console.log('Parsed message:', message);

      switch (message.type) {
        case 'login':
          if (message.data.user_data?.id) {
            const fcmToken = await NotificationService.getFCMToken();
            if (fcmToken) {
              try {
                // Store current user ID
                await NotificationService.setCurrentUser(message.data.user_data.id);

                const payload = {
                  userId: message.data.user_data.id,
                  deviceToken: fcmToken
                };

                console.log('Payload:', payload);
                // Register device token
                await AuthAPI.registerDeviceToken({
                  userId: message.data.user_data.id,
                  deviceToken: fcmToken
                });
                console.log('Device token registered successfully');
              } catch (error) {
                console.error('Failed to register device token:', error);
              }
            }
          }
          break;

        case 'logout':
          try {
            const currentToken = await NotificationService.getFCMToken();
            if (currentToken && message.data.userId) {
              // First remove from backend
              await AuthAPI.removeDeviceToken({
                userId: message.data.userId,
                deviceToken: currentToken
              });
              // Then clear local token
              await NotificationService.clearFCMToken();
              console.log('Device token cleared successfully');
            }
          } catch (error) {
            console.error('Failed to handle logout:', error);
          }
          break;

        case 'system':
          console.log('System message:', message.data.message);
          break;
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
    }
  };

  const injectedJavaScript = `
(function() {
  // Function to safely handle message posting
  function postMessage(type, data) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: type,
        data: data
      }));
    }
  }

  // Listen for userLogin event
  window.addEventListener('userLogin', function(e) {
    const response = e.detail;
    postMessage('login', { user_data: response.user_data });
  });

  // Listen for userLogout event
  window.addEventListener('userLogout', function(e) {
    const userId = e.detail;
    postMessage('logout', { userId: userId });
  });

  // Notify that WebView is loaded
  postMessage('system', { message: 'WebView Loaded' });
})();
`;

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
        onMessage={onWebViewMessage}
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
