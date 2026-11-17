import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { Logo } from '../components/Logo';
import { GameButton } from '../components/GameButton';
import { IconButton } from '../components/IconButton';
import { colors, fonts } from '../constants/theme';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { LevelManager } from '../game/levelManager';
import { useStorageVersion } from '../hooks/useStorage';
import { playTarget, totalStarsAllModes } from '../utils/progress';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { ballPicture } from '../game/render/ballPainter';
import type { ScreenProps } from '../navigation/types';
import { RewardService } from '../services/rewards';
import { RewardImage } from '../components/RewardImage';
import { CoinChip } from './GiftsScreen';

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const contentW = Math.min(width - 32, 440);

  const target = playTarget();
  const playSub = target.resume ? `Continue level ${target.number}` : target.allDone ? 'All levels complete!' : `Level ${target.number}`;
  const dailyDone = !!Storage.dailyResult(LevelManager.dailyKey());
  const ball = Storage.selectedBall();
  const ballPic = React.useMemo(() => ballPicture(ball, 30), [ball]);
  const newBalls = Storage.unlockedBallCount() > (Storage.data.ballsSeen || 1);
  const s = Storage.settings;
  const giftsReady = RewardService.readyCount();

  const toggleSound = () => {
    const on = !s.sound;
    Storage.setSetting('sound', on);
    AudioService.setSound(on);
    if (on) AudioService.play('click');
  };
  const toggleMusic = () => {
    const on = !s.music;
    Storage.setSetting('music', on);
    AudioService.setMusic(on);
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Animated.View entering={FadeInDown.springify()} style={{ alignItems: 'center' }}>
          <Logo width={Math.min(230, contentW * 0.66, height * 0.21)} />
          <Text style={[styles.title, { fontSize: Math.max(34, Math.min(48, height * 0.055)) }]} accessibilityRole="header">
            Ball <Text style={{ color: colors.gold }}>Roll</Text>
          </Text>
          <Text style={styles.tag}>SLIDE · CONNECT · ROLL</Text>
        </Animated.View>

        <View style={styles.walletRow}>
          <View style={styles.stars} accessibilityLabel={`${totalStarsAllModes()} stars collected`}>
            <Ionicons name="star" size={18} color={colors.gold} />
            <Text style={styles.starsText}>{totalStarsAllModes()}</Text>
          </View>
          <CoinChip coins={RewardService.coins} />
        </View>

        <View style={{ width: contentW, gap: 14 }}>
          <GameButton
            variant="primary"
            size="xl"
            label="Play"
            sub={playSub}
            icon={(ink) => <Ionicons name="play-circle" size={40} color={ink} />}
            onPress={() => navigation.navigate('Game', { mode: 'classic', number: target.number, resume: target.resume })}
          />
          <View style={styles.grid}>
            <Tile variant="teal" label="Levels" icon={<Ionicons name="grid" size={24} color="#fff" />}
              onPress={() => navigation.navigate('Levels', { mode: Storage.data.lastMode === 'daily' ? 'classic' : Storage.data.lastMode })} />
            <Tile variant="pink" label="Daily" icon={<Ionicons name="calendar" size={24} color="#fff" />} badge={dailyDone ? '✓ Done' : 'New'} badgeDone={dailyDone}
              onPress={() => navigation.navigate('Game', { mode: 'daily' })} />
            <Tile variant="gold" label="Challenge" ink="#4a3200" icon={<Ionicons name="flash" size={24} color="#4a3200" />}
              onPress={() => navigation.navigate('Levels', { mode: 'challenge' })} />
            <Tile variant="violet" label="Time Trial" icon={<Ionicons name="stopwatch" size={24} color="#fff" />}
              onPress={() => navigation.navigate('Levels', { mode: 'timetrial' })} />
            <Tile variant="orange" label="Balls" a11y={`Ball Collection${newBalls ? ', new balls unlocked' : ''}`} badge={newBalls ? 'New' : undefined}
              icon={<Canvas style={{ width: 30, height: 30 }}><Picture picture={ballPic} /></Canvas>}
              onPress={() => navigation.navigate('Balls')} />
            <Tile variant="purple" label="Gifts" a11y={`Gifts and Rewards${giftsReady ? `, ${giftsReady} ready to open` : ''}`}
              badge={giftsReady ? String(giftsReady) : undefined} badgeGift icon={<RewardImage art="gift" width={30} />}
              onPress={() => navigation.navigate('Gifts')} />
          </View>
        </View>

        <View style={styles.footer}>
          <IconButton name="settings-sharp" label="Settings" onPress={() => navigation.navigate('Settings')} />
          <IconButton name={s.sound ? 'volume-high' : 'volume-mute'} label="Sound effects" off={!s.sound} onPress={toggleSound} quiet />
          <IconButton name="musical-notes" label="Music" off={!s.music} slash onPress={toggleMusic} />
        </View>
      </ScrollView>
    </View>
  );
}

/** Home tile: icon over label, three per row (like the web home grid). */
function Tile(p: {
  variant: React.ComponentProps<typeof GameButton>['variant'];
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  ink?: string;
  a11y?: string;
  badge?: string;
  badgeDone?: boolean;
  badgeGift?: boolean;
}) {
  return (
    <GameButton style={styles.cell} variant={p.variant} size="lg" accessibilityLabel={p.a11y || p.label} onPress={p.onPress}>
      <View style={styles.tile}>
        {p.icon}
        <Text style={[styles.tileLabel, p.ink ? { color: p.ink } : null]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {p.label}
        </Text>
      </View>
      {p.badge ? (
        <View style={[styles.badge, p.badgeDone && styles.badgeDone, p.badgeGift && styles.badgeGift]}>
          <Text style={[styles.badgeText, p.badgeGift && { color: '#fff' }]}>{p.badge}</Text>
        </View>
      ) : null}
    </GameButton>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 14 },
  title: { fontFamily: fonts.bold, fontSize: 48, color: colors.ink, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  tag: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 3, color: colors.inkDim },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  starsText: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '31.5%' },
  tile: { alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8 },
  wide: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileLabel: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
  tileLabelSm: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 17, color: '#fff' },
  walletRow: { flexDirection: 'row', gap: 10 },
  badgeGift: { backgroundColor: colors.coral },
  badge: { position: 'absolute', top: -6, right: -10, backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeDone: { backgroundColor: '#4cc38a' },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: '#3a2414' },
  footer: { flexDirection: 'row', gap: 16, marginTop: 6 },
});
