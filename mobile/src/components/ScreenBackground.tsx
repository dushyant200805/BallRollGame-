import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/theme';

/** The web game's background: deep blue gradient with warm and teal glows. */
function ScreenBackgroundImpl() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[colors.bg1, colors.bg2]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={['rgba(255,204,120,0.12)', 'rgba(255,204,120,0)']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.6, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(47,196,182,0)', 'rgba(47,196,182,0.14)']}
        start={{ x: 0.4, y: 0.6 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

export const ScreenBackground = memo(ScreenBackgroundImpl);
