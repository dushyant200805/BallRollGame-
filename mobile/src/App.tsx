import React, { useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ExpoSplash from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { RootNavigator } from './navigation/RootNavigator';
import { Storage, type SaveData } from './services/storage';
import { AudioService } from './services/audio';
import { colors } from './constants/theme';

// Keep the native splash up until saved progress is loaded. Fonts are embedded in the binary.
ExpoSplash.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg2).catch(() => {});
    (async () => {
      // Never hold the splash forever: fall back to defaults if storage is unusually slow.
      const data = await Promise.race<SaveData>([
        Storage.load(),
        new Promise<SaveData>((resolve) => setTimeout(() => resolve(Storage.data), 3000)),
      ]);
      setReady(true);
      // Sounds load in the background: the game never waits on (or breaks without) audio.
      void AudioService.init(data.settings);
    })();
  }, []);

  // App lifecycle: music stops in the background; progress is flushed to disk.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const fg = state === 'active';
      AudioService.setForeground(fg);
      if (!fg) void Storage.flush();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (ready) ExpoSplash.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" translucent />
        {ready ? <RootNavigator /> : <View style={styles.root} />}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg2 } });
