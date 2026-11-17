import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { RewardService } from '../services/rewards';
import { useStorageVersion } from '../hooks/useStorage';

/** The web game's background: gradient with a warm and a cool glow, coloured by the selected
 *  game theme (themes are unlocked from gifts; see js/data/rewards-config.js). */
function ScreenBackgroundImpl() {
  useStorageVersion();
  const t = RewardService.theme();
  const fade = (c: string) => c.replace(/[\d.]+\)$/, '0)');
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[t.bg[0], t.bg[1]]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[t.glow[0], fade(t.glow[0])]} start={{ x: 0.1, y: 0 }} end={{ x: 0.6, y: 0.4 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={[fade(t.glow[1]), t.glow[1]]} start={{ x: 0.4, y: 0.6 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </View>
  );
}

export const ScreenBackground = memo(ScreenBackgroundImpl);
