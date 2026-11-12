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
import type { ScreenProps } from '../navigation/types';

export default function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width - 32, 440);

  const target = playTarget();
  const playSub = target.resume ? `Continue level ${target.number}` : target.allDone ? 'All levels complete!' : `Level ${target.number}`;
  const dailyDone = !!Storage.dailyResult(LevelManager.dailyKey());
  const s = Storage.settings;

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
          <Logo width={Math.min(250, contentW * 0.75)} />
          <Text style={styles.title} accessibilityRole="header">
            Ball <Text style={{ color: colors.gold }}>Roll</Text>
          </Text>
          <Text style={styles.tag}>SLIDE · CONNECT · ROLL</Text>
        </Animated.View>

        <View style={styles.stars} accessibilityLabel={`${totalStarsAllModes()} stars collected`}>
          <Ionicons name="star" size={18} color={colors.gold} />
          <Text style={styles.starsText}>{totalStarsAllModes()}</Text>
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
            <GameButton style={styles.cell} variant="teal" size="lg" label="Levels" icon={(ink) => <Ionicons name="grid" size={22} color={ink} />}
              onPress={() => navigation.navigate('Levels', { mode: Storage.data.lastMode === 'daily' ? 'classic' : Storage.data.lastMode })} />
            <GameButton style={styles.cell} variant="pink" size="lg" label="Daily" icon={(ink) => <Ionicons name="calendar" size={22} color={ink} />}
              onPress={() => navigation.navigate('Game', { mode: 'daily' })}>
              <View style={styles.row}>
                <Ionicons name="calendar" size={22} color="#fff" />
                <Text style={styles.tileLabel}>Daily</Text>
              </View>
              <View style={[styles.badge, dailyDone && styles.badgeDone]}>
                <Text style={styles.badgeText}>{dailyDone ? '✓ Done' : 'New'}</Text>
              </View>
            </GameButton>
            <GameButton style={styles.cell} variant="gold" size="lg" label="Challenge" icon={(ink) => <Ionicons name="flash" size={22} color={ink} />}
              onPress={() => navigation.navigate('Levels', { mode: 'challenge' })} />
            <GameButton style={styles.cell} variant="violet" size="lg" label="Time Trial" icon={(ink) => <Ionicons name="stopwatch" size={22} color={ink} />}
              onPress={() => navigation.navigate('Levels', { mode: 'timetrial' })} />
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, gap: 14 },
  title: { fontFamily: fonts.bold, fontSize: 48, color: colors.ink, marginTop: 2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  tag: { fontFamily: fonts.semibold, fontSize: 13, letterSpacing: 3, color: colors.inkDim },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.25)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  starsText: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  cell: { width: '48.5%' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tileLabel: { fontFamily: fonts.bold, fontSize: 18, color: '#fff' },
  badge: { position: 'absolute', top: -6, right: -10, backgroundColor: colors.gold, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeDone: { backgroundColor: '#4cc38a' },
  badgeText: { fontFamily: fonts.bold, fontSize: 11, color: '#3a2414' },
  footer: { flexDirection: 'row', gap: 16, marginTop: 6 },
});
