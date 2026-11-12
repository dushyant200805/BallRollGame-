import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';
import { Stars } from './Stars';
import { AudioService } from '../services/audio';

interface Props {
  n: number;
  size: number;
  unlocked: boolean;
  stars: number;
  done: boolean;
  current: boolean;
  onPress: (n: number) => void;
}

/** One wooden level button (port of the web .level-btn). */
function LevelTileImpl({ n, size, unlocked, stars, done, current, onPress }: Props) {
  if (!unlocked) {
    return (
      <View style={[styles.wrap, { width: size, height: size + 5 }]} accessibilityLabel={`Level ${n}, locked`} accessibilityState={{ disabled: true }}>
        <View style={[styles.edge, { backgroundColor: '#2f3640' }]} />
        <LinearGradient colors={[colors.lockedTop, colors.lockedBottom]} style={[styles.face, { height: size }]}>
          <Ionicons name="lock-closed" size={size * 0.24} color="#a9b3bf" />
        </LinearGradient>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => {
        AudioService.play('click');
        onPress(n);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Level ${n}${done ? `, ${stars} stars` : ''}`}
      style={({ pressed }) => [styles.wrap, { width: size, height: size + 5, transform: [{ translateY: pressed ? 3 : 0 }] }]}
    >
      <View style={[styles.edge, { backgroundColor: colors.woodDark }]} />
      <LinearGradient colors={[colors.wood1, colors.wood2]} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.face, { height: size }, current && styles.current]}>
        <Text style={[styles.num, { fontSize: size * 0.3 }]}>{n}</Text>
        <Stars count={stars} size={Math.max(10, size * 0.14)} />
        {done ? <View style={styles.doneDot} /> : null}
      </LinearGradient>
    </Pressable>
  );
}

export const LevelTile = memo(LevelTileImpl);

const styles = StyleSheet.create({
  wrap: {},
  edge: { position: 'absolute', left: 0, right: 0, top: 5, bottom: 0, borderRadius: 18 },
  face: { borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 2 },
  current: { borderWidth: 3, borderColor: colors.gold },
  num: { fontFamily: fonts.bold, color: '#4a2a12' },
  doneDot: { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#4cc38a', borderWidth: 1.5, borderColor: '#fff' },
});
