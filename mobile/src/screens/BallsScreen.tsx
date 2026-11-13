import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { Toast } from '../components/Toast';
import { colors, fonts } from '../constants/theme';
import { BALL_COLLECTIONS, BALL_SKINS, type BallSkin } from '../game/data/ballSkins';
import { ballPicture } from '../game/render/ballPainter';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { useStorageVersion } from '../hooks/useStorage';
import type { ScreenProps } from '../navigation/types';

const COLLECTION_COLOR: Record<string, string> = { Basic: '#4cc38a', Premium: '#a35ee0', Special: '#f0a83a' };
const BALL_SIZE = 76;

export default function BallsScreen({ navigation }: ScreenProps<'Balls'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [playing, setPlaying] = useState<string | null>(AudioService.previewing);
  const [toast, setToast] = useState<{ msg: string | null; id: number }>({ msg: null, id: 0 });
  const stars = Storage.allStars();
  const selected = Storage.selectedBall().id;

  const innerW = Math.min(width, 640) - 32;
  const cols = innerW >= 560 ? 4 : innerW >= 330 ? 3 : 2;
  const gap = 10;
  const cardW = Math.floor((innerW - gap * (cols - 1)) / cols);

  useEffect(() => AudioService.subscribePreview(setPlaying), []);
  useEffect(() => {
    Storage.markBallsSeen();
  }, []);
  // never keep a preview playing after leaving the screen
  useFocusEffect(useCallback(() => () => AudioService.stopPreview(), []));

  const say = (msg: string) => setToast((t) => ({ msg, id: t.id + 1 }));

  const onPreview = useCallback((id: string) => {
    if (AudioService.previewing === id) {
      AudioService.stopPreview();
      return;
    }
    if (!Storage.settings.sound) {
      say('Sound effects are off. Turn them on in Settings to hear previews.');
      return;
    }
    void AudioService.playPreview(id);
  }, []);

  const onUse = useCallback((skin: BallSkin) => {
    if (!Storage.isBallUnlocked(skin)) return;
    AudioService.play('click');
    Storage.setBall(skin.id);
    AudioService.setBall(skin.id);
    say(`${skin.name} selected`);
  }, []);

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" label="Back to home" onPress={() => navigation.goBack()} />
        <Text style={styles.h2} accessibilityRole="header">Ball Collection</Text>
        <View style={styles.starCount} accessibilityLabel={`${stars} stars`}>
          <Ionicons name="star" size={16} color={colors.gold} />
          <Text style={styles.starText}>{stars}</Text>
        </View>
      </View>
      <Text style={styles.desc}>Every ball looks and sounds different. Earn stars to unlock more, and tap ▶ to hear one.</Text>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={{ width: innerW, alignSelf: 'center' }}>
          {BALL_COLLECTIONS.map((col) => (
            <View key={col} style={{ marginBottom: 16 }}>
              <View style={styles.tierHead}>
                <View style={[styles.tierDot, { backgroundColor: COLLECTION_COLOR[col] }]} />
                <Text style={styles.tierName}>{col}</Text>
                <Text style={styles.tierRange}>Collection</Text>
              </View>
              <View style={[styles.grid, { gap }]}>
                {BALL_SKINS.filter((s) => s.collection === col).map((skin) => (
                  <BallCard
                    key={skin.id}
                    skin={skin}
                    width={cardW}
                    unlocked={stars >= skin.cost}
                    missing={Math.max(0, skin.cost - stars)}
                    selected={skin.id === selected}
                    playing={playing === skin.id}
                    onPreview={onPreview}
                    onUse={onUse}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <Toast message={toast.msg} id={toast.id} bottom={insets.bottom + 24} />
    </View>
  );
}

interface CardProps {
  skin: BallSkin;
  width: number;
  unlocked: boolean;
  missing: number;
  selected: boolean;
  playing: boolean;
  onPreview: (id: string) => void;
  onUse: (skin: BallSkin) => void;
}

const BallCard = memo(function BallCard({ skin, width, unlocked, missing, selected, playing, onPreview, onUse }: CardProps) {
  const picture = useMemo(() => ballPicture(skin, BALL_SIZE), [skin]);
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (playing) pulse.value = withRepeat(withTiming(1, { duration: 450 }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 120 });
    }
  }, [playing, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.08 }] }));

  return (
    <View style={[styles.card, { width }, selected && styles.cardSel]}>
      {!unlocked ? (
        <View style={styles.lockTag}>
          <Ionicons name="lock-closed" size={11} color="#fff" />
          <Text style={styles.lockText}>{skin.cost}</Text>
          <Ionicons name="star" size={11} color={colors.gold} />
        </View>
      ) : null}
      <View style={{ opacity: unlocked ? 1 : 0.55 }}>
        <Canvas style={{ width: BALL_SIZE, height: BALL_SIZE }}>
          <Picture picture={picture} />
        </Canvas>
      </View>
      <Text style={styles.name} numberOfLines={1}>{skin.name}</Text>
      <Text style={styles.sound} numberOfLines={2}>{skin.sound}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={() => onUse(skin)}
          disabled={!unlocked || selected}
          accessibilityRole="button"
          accessibilityLabel={unlocked ? (selected ? `${skin.name} selected` : `Use ${skin.name}`) : `${skin.name}, locked, needs ${skin.cost} stars`}
          style={({ pressed }) => [
            styles.use,
            selected && styles.useSel,
            !unlocked && styles.useLocked,
            { transform: [{ translateY: pressed ? 2 : 0 }] },
          ]}
        >
          <Text style={[styles.useText, !unlocked && { color: colors.inkDim }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            {selected ? '✓ In use' : unlocked ? 'Use' : `Need ${missing} ★`}
          </Text>
        </Pressable>
        <Animated.View style={pulseStyle}>
          <Pressable
            onPress={() => onPreview(skin.id)}
            accessibilityRole="button"
            accessibilityLabel={`Preview ${skin.name} sound`}
            accessibilityState={{ selected: playing }}
            hitSlop={4}
            style={[styles.preview, playing && styles.previewOn]}
          >
            <Ionicons name={playing ? 'stop' : 'play'} size={18} color="#fff" />
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 24, color: colors.ink },
  starCount: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  starText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  desc: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkDim, textAlign: 'center', marginHorizontal: 20, marginBottom: 8 },
  scroll: { paddingTop: 6 },
  tierHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tierDot: { width: 12, height: 12, borderRadius: 4 },
  tierName: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  tierRange: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkDim },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cardSel: { borderColor: colors.gold, backgroundColor: 'rgba(255,204,51,0.12)' },
  lockTag: { position: 'absolute', top: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, zIndex: 2 },
  lockText: { fontFamily: fonts.bold, fontSize: 11, color: '#fff' },
  name: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, marginTop: 2 },
  sound: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.inkDim, textAlign: 'center', minHeight: 30 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, alignSelf: 'stretch' },
  use: { flex: 1, minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderBottomWidth: 3, borderBottomColor: '#d7b98f', paddingHorizontal: 4 },
  useSel: { backgroundColor: colors.gold, borderBottomColor: colors.goldDark },
  useLocked: { backgroundColor: 'rgba(0,0,0,0.25)', borderBottomColor: 'transparent' },
  useText: { fontFamily: fonts.bold, fontSize: 13, color: colors.panelInk },
  preview: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, borderBottomWidth: 3, borderBottomColor: colors.tealDark },
  previewOn: { backgroundColor: colors.coral, borderBottomColor: colors.coralDark },
});
