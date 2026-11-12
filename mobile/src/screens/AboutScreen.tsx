import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../constants/theme';
import type { ScreenProps } from '../navigation/types';

export default function AboutScreen({ navigation }: ScreenProps<'About'>) {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" label="Back" onPress={() => navigation.goBack()} />
        <Text style={styles.h2} accessibilityRole="header">About</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center' }}>
          <Logo width={200} animate={false} />
          <Text style={styles.name}>Ball <Text style={{ color: colors.gold }}>Roll</Text></Text>
          <Text style={styles.ver}>Version {version}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h3}>How to play</Text>
          <Text style={styles.p}>
            Slide the wooden pipe tiles into the empty slots to build a track from the green start tile to the gold goal,
            then press Play and watch the ball roll home. Dark bolted tiles and stone blocks never move. Solve a level in
            the fewest moves (par) for three stars.
          </Text>
          <Text style={styles.p}>
            Classic teaches the basics. Challenge gives you one empty slot and a shrinking move limit. Time Trial races the
            clock. The Daily Challenge is a new puzzle every day.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h3}>Privacy policy</Text>
          <Text style={styles.p}>
            Ball Roll does not collect, store or share any personal information. There are no accounts, ads, analytics or
            trackers, and the game works completely offline.
          </Text>
          <Text style={styles.p}>
            Your progress (unlocked levels, stars, best scores, the level in progress) and settings are saved only on this
            device. They are removed when you uninstall the app or use Settings → Reset progress.
          </Text>
          <Text style={styles.p}>
            The only permission the app uses is vibration, for haptic feedback. It never accesses your microphone, camera,
            location, contacts or files.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.h3}>Credits</Text>
          <Text style={styles.p}>
            All graphics are drawn in code and every sound is synthesized. Font: Fredoka (SIL Open Font License). Icons:
            Ionicons (MIT).
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  content: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
  name: { fontFamily: fonts.bold, fontSize: 36, color: colors.ink },
  ver: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkDim },
  card: { backgroundColor: colors.panel, borderRadius: 22, padding: 18, borderBottomWidth: 5, borderBottomColor: '#e2c9a6', gap: 8 },
  h3: { fontFamily: fonts.bold, fontSize: 19, color: colors.panelInk },
  p: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.panelDim },
});
