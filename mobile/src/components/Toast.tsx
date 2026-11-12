import React, { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { colors, fonts } from '../constants/theme';

/** Short message near the bottom of the screen. `id` changes for every new message. */
export function Toast({ message, id, bottom }: { message: string | null; id: number; bottom: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2400);
    return () => clearTimeout(t);
  }, [message, id]);
  if (!visible || !message) return null;
  return (
    <Animated.View key={id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(160)} style={[styles.toast, { bottom }]} pointerEvents="none" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '88%',
    backgroundColor: 'rgba(10,20,32,0.92)',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    zIndex: 60,
  },
  text: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15, textAlign: 'center' },
});
