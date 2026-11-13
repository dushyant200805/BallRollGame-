import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { GameButton } from '../components/GameButton';
import { colors, fonts } from '../constants/theme';
import { Storage, type Settings } from '../services/storage';
import { AudioService } from '../services/audio';
import { haptic } from '../services/haptics';
import { useStorageVersion } from '../hooks/useStorage';
import { VolumeSlider } from '../components/VolumeSlider';
import type { Volumes } from '../services/storage';
import type { ScreenProps } from '../navigation/types';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen({ navigation }: ScreenProps<'Settings'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const s = Storage.settings;

  const set = <K extends keyof Settings>(name: K, value: Settings[K]) => {
    Storage.setSetting(name, value);
    if (name === 'sound') AudioService.setSound(value as boolean);
    if (name === 'music') AudioService.setMusic(value as boolean);
    if (name === 'vibration' && value) haptic('connect');
    if (name !== 'music') AudioService.play('click');
  };

  const setVol = React.useCallback((name: keyof Volumes) => (v: number) => {
    Storage.setVolume(name, v);
    AudioService.setVolumes({ [name]: v });
  }, []);
  const sample = React.useCallback((name: keyof Volumes) => () => {
    // a short sample when the finger lifts, so the level can be judged
    if (name === 'roll') void AudioService.playPreview(Storage.selectedBall().id);
    else if (name !== 'music') AudioService.play('connect');
  }, []);
  const handlers = React.useMemo(() => ({
    master: [setVol('master'), sample('master')],
    roll: [setVol('roll'), sample('roll')],
    sfx: [setVol('sfx'), sample('sfx')],
    music: [setVol('music'), sample('music')],
  }) as const, [setVol, sample]);

  const confirmReset = () => {
    Alert.alert('Reset all progress?', 'Stars, unlocked levels and best scores will be erased. Settings are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          Storage.resetProgress();
          void Storage.flush();
          Alert.alert('Progress reset', 'All levels are locked again, starting from level 1.');
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" label="Back" onPress={() => navigation.goBack()} />
        <Text style={styles.h2} accessibilityRole="header">Settings</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Row icon="volume-high" label="Sound effects">
            <Switch value={s.sound} onValueChange={(v) => set('sound', v)} trackColor={{ true: colors.teal, false: '#cdbfae' }} thumbColor="#fff" accessibilityLabel="Sound effects" />
          </Row>
          <Row icon="musical-notes" label="Music">
            <Switch value={s.music} onValueChange={(v) => set('music', v)} trackColor={{ true: colors.teal, false: '#cdbfae' }} thumbColor="#fff" accessibilityLabel="Music" />
          </Row>
          <Row icon="phone-portrait" label="Vibration">
            <Switch value={s.vibration} onValueChange={(v) => set('vibration', v)} trackColor={{ true: colors.teal, false: '#cdbfae' }} thumbColor="#fff" accessibilityLabel="Vibration" />
          </Row>
        </View>

        <View style={styles.card}>
          <VolumeSlider label="Master volume" icon="volume-medium" value={s.volumes.master} onChange={handlers.master[0]} onComplete={handlers.master[1]} />
          <VolumeSlider label="Ball rolling" icon="ellipse" value={s.volumes.roll} onChange={handlers.roll[0]} onComplete={handlers.roll[1]} />
          <VolumeSlider label="Sound effects" icon="notifications" value={s.volumes.sfx} onChange={handlers.sfx[0]} onComplete={handlers.sfx[1]} />
          <VolumeSlider label="Background music" icon="musical-notes" value={s.volumes.music} onChange={handlers.music[0]} onComplete={handlers.music[1]} />
        </View>

        <View style={styles.card}>
          <Row icon="sparkles" label="Animations" last>
            <View style={styles.seg} accessibilityRole="radiogroup">
              {(['full', 'reduced'] as const).map((v) => (
                <Pressable
                  key={v}
                  onPress={() => set('animations', v)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: s.animations === v }}
                  style={[styles.segBtn, s.animations === v && styles.segSel]}
                >
                  <Text style={[styles.segText, s.animations === v && { color: '#fff' }]}>{v === 'full' ? 'Full' : 'Reduced'}</Text>
                </Pressable>
              ))}
            </View>
          </Row>
        </View>

        <GameButton label="About & privacy" icon={(c) => <Ionicons name="information-circle" size={22} color={c} />} onPress={() => navigation.navigate('About')} />
        <GameButton variant="danger" label="Reset progress" icon={(c) => <Ionicons name="trash" size={20} color={c} />} onPress={confirmReset} />
        <GameButton variant="primary" label="Done" icon={(c) => <Ionicons name="checkmark" size={22} color={c} />} onPress={() => navigation.goBack()} />
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, children, last }: { icon: IconName; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <View style={styles.rowLabel}>
        <Ionicons name={icon} size={20} color={colors.panelDim} />
        <Text style={styles.rowText}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  content: { padding: 16, gap: 12, maxWidth: 520, width: '100%', alignSelf: 'center' },
  card: { backgroundColor: colors.panel, borderRadius: 22, paddingHorizontal: 16, borderBottomWidth: 5, borderBottomColor: '#e2c9a6' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 10 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: 'rgba(138,106,78,0.18)' },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  rowText: { fontFamily: fonts.semibold, fontSize: 17, color: colors.panelInk },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(138,106,78,0.15)', borderRadius: 14, padding: 3 },
  segBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11 },
  segSel: { backgroundColor: colors.teal },
  segText: { fontFamily: fonts.bold, fontSize: 14, color: colors.panelDim },
});
