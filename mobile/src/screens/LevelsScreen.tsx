import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { LevelTile } from '../components/LevelTile';
import { colors, fonts } from '../constants/theme';
import { LevelManager, MODES, LEVEL_MODES } from '../game/levelManager';
import type { LevelMode } from '../game/core/constants';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { useStorageVersion } from '../hooks/useStorage';
import { nextLevelFor } from '../utils/progress';
import type { ScreenProps } from '../navigation/types';

const TAB_ICON: Record<LevelMode, React.ComponentProps<typeof Ionicons>['name']> = {
  classic: 'game-controller',
  challenge: 'flash',
  timetrial: 'stopwatch',
};

export default function LevelsScreen({ navigation, route }: ScreenProps<'Levels'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [mode, setMode] = useState<LevelMode>(route.params.mode);
  const scrollRef = useRef<ScrollView>(null);
  const currentY = useRef(0);

  const innerW = Math.min(width, 560) - 32;
  // 6 columns fit every tier in one or two tidy rows; very narrow phones use 5
  const cols = innerW >= 320 ? 6 : 5;
  const gap = 10;
  const tile = Math.floor((innerW - gap * (cols - 1)) / cols);

  const count = LevelManager.count(mode);
  const current = nextLevelFor(mode);
  const tiers = useMemo(() => LevelManager.tiersFor(mode).filter((t) => t.from <= count), [mode, count]);

  const open = useCallback((n: number) => navigation.navigate('Game', { mode, number: n }), [navigation, mode]);

  useEffect(() => {
    // bring the next level to play into view
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, currentY.current - 120), animated: true }), 120);
    return () => clearTimeout(t);
  }, [mode]);

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" label="Back to home" onPress={() => navigation.goBack()} />
        <Text style={styles.h2} accessibilityRole="header">Levels</Text>
        <View style={styles.starCount} accessibilityLabel={`${Storage.totalStars(mode)} of ${count * 3} stars`}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={styles.starText}>
            {Storage.totalStars(mode)} / {count * 3}
          </Text>
        </View>
      </View>

      <View style={styles.tabs} accessibilityRole="tablist">
        {LEVEL_MODES.map((m) => {
          const sel = m === mode;
          return (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: sel }}
              onPress={() => {
                AudioService.play('click');
                setMode(m);
                Storage.setLastMode(m);
              }}
              style={[styles.tab, sel && styles.tabSel]}
            >
              <Ionicons name={TAB_ICON[m]} size={16} color={sel ? colors.panelInk : colors.inkDim} />
              <Text style={[styles.tabText, sel && { color: colors.panelInk }]}>{MODES[m].short}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.desc}>{MODES[mode].desc}</Text>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={{ width: innerW, alignSelf: 'center' }}>
          {tiers.map((tier) => {
            const to = Math.min(tier.to, count);
            const nums: number[] = [];
            for (let n = tier.from; n <= to; n++) nums.push(n);
            return (
              <View
                key={tier.name}
                style={{ marginBottom: 14 }}
                onLayout={
                  current >= tier.from && current <= to
                    ? (e) => {
                        const row = Math.floor((current - tier.from) / cols);
                        currentY.current = e.nativeEvent.layout.y + 30 + row * (tile + 5 + gap);
                      }
                    : undefined
                }
              >
                <View style={styles.tierHead}>
                  <View style={[styles.tierDot, { backgroundColor: tier.color }]} />
                  <Text style={styles.tierName}>{tier.name}</Text>
                  <Text style={styles.tierRange}>Levels {tier.from}–{to}</Text>
                </View>
                <View style={[styles.grid, { gap }]}>
                  {nums.map((n) => {
                    const res = Storage.levelResult(mode, n);
                    return (
                      <LevelTile
                        key={n}
                        n={n}
                        size={tile}
                        unlocked={Storage.isUnlocked(mode, n)}
                        stars={res ? res.stars : 0}
                        done={!!res}
                        current={n === current && !res}
                        onPress={open}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  starCount: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  starText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  tabs: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 30, padding: 5, maxWidth: 528, alignSelf: 'stretch' },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: 26 },
  tabSel: { backgroundColor: colors.panel, borderBottomWidth: 3, borderBottomColor: '#d7b98f' },
  tabText: { fontFamily: fonts.bold, fontSize: 15, color: colors.inkDim },
  desc: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkDim, textAlign: 'center', marginHorizontal: 20, marginTop: 10, marginBottom: 6 },
  scroll: { paddingTop: 8 },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tierDot: { width: 12, height: 12, borderRadius: 4 },
  tierName: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  tierRange: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
});
