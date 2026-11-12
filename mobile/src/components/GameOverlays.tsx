import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { Panel, PanelText } from './Panel';
import { GameButton } from './GameButton';
import { colors, fonts } from '../constants/theme';
import type { FailInfo, WinInfo } from '../game/engine';
import { AudioService } from '../services/audio';
import { Storage } from '../services/storage';

export function PauseOverlay(p: { onResume: () => void; onRestart: () => void; onSettings: () => void; onLevels: () => void; onHome: () => void; showLevels: boolean }) {
  return (
    <Panel title="Paused" icon={<Ionicons name="pause" size={34} color="#fff" />}>
      <View style={styles.actions}>
        <GameButton variant="primary" label="Resume" icon={(c) => <Ionicons name="play" size={20} color={c} />} onPress={p.onResume} />
        <GameButton label="Restart" icon={(c) => <Ionicons name="refresh" size={20} color={c} />} onPress={p.onRestart} />
        <GameButton label="Settings" icon={(c) => <Ionicons name="settings-sharp" size={20} color={c} />} onPress={p.onSettings} />
        {p.showLevels ? <GameButton label="Levels" icon={(c) => <Ionicons name="grid" size={20} color={c} />} onPress={p.onLevels} /> : null}
        <GameButton label="Home" icon={(c) => <Ionicons name="home" size={20} color={c} />} onPress={p.onHome} />
      </View>
    </Panel>
  );
}

/** Level complete: the stars pop in one by one with a chime each (like the web win dialog). */
export function WinOverlay({ info, onNext, onReplay, onMenu }: { info: WinInfo; onNext: () => void; onReplay: () => void; onMenu: () => void }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const delay = Storage.settings.animations === 'reduced' ? 60 : 320;
    const timers = [0, 1, 2]
      .filter((i) => i < info.stars)
      .map((i) =>
        setTimeout(() => {
          setShown(i + 1);
          AudioService.star(i);
        }, 300 + i * delay),
      );
    return () => timers.forEach(clearTimeout);
  }, [info]);

  const daily = info.mode === 'daily';
  return (
    <Panel title={info.title} iconColor={colors.gold} icon={<Ionicons name="trophy" size={32} color="#fff" />}>
      <View style={styles.stars} accessibilityLabel={`${info.stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.starSlot, i === 1 && styles.starBig]}>
            <Ionicons name="star" size={i === 1 ? 60 : 46} color="rgba(120,80,40,0.18)" />
            {i < shown ? (
              <Animated.View entering={ZoomIn.springify().damping(9)} style={StyleSheet.absoluteFill}>
                <View style={styles.starCenter}>
                  <Ionicons name="star" size={i === 1 ? 60 : 46} color={colors.gold} />
                </View>
              </Animated.View>
            ) : null}
          </View>
        ))}
      </View>
      {info.note ? <Text style={styles.note}>{info.note}</Text> : null}
      <View style={styles.stats}>
        <Stat icon="move" label="Moves" value={info.movesText} />
        <Stat icon="stopwatch-outline" label="Time" value={info.time} />
        <Stat icon="ribbon" label="Best" value={String(info.best)} />
      </View>
      <View style={styles.row}>
        <GameButton style={{ flex: 1 }} label="Replay" icon={(c) => <Ionicons name="refresh" size={20} color={c} />} onPress={onReplay} />
        {daily || info.hasNext ? (
          <GameButton style={{ flex: 1 }} variant="primary" label={daily ? 'Home' : 'Next'} iconRight icon={(c) => <Ionicons name="chevron-forward" size={20} color={c} />} onPress={onNext} />
        ) : null}
      </View>
      {!daily ? (
        <Text style={styles.link} onPress={onMenu} accessibilityRole="link">
          Level select
        </Text>
      ) : null}
    </Panel>
  );
}

function Stat({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={colors.panelDim} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const FAIL_ICON = { broken: 'alert-circle', time: 'hourglass', moves: 'hand-left' } as const;

export function FailOverlay({ info, onContinue, onRetry, onLevels, showLevels }: { info: FailInfo; onContinue: () => void; onRetry: () => void; onLevels: () => void; showLevels: boolean }) {
  return (
    <Panel title={info.title} iconColor={colors.danger} icon={<Ionicons name={FAIL_ICON[info.icon]} size={34} color="#fff" />}>
      <PanelText>{info.msg}</PanelText>
      <View style={styles.actions}>
        {info.canContinue ? (
          <GameButton variant="primary" label="Keep trying" icon={(c) => <Ionicons name="hand-right" size={20} color={c} />} onPress={onContinue} />
        ) : null}
        <GameButton label="Restart level" icon={(c) => <Ionicons name="refresh" size={20} color={c} />} onPress={onRetry} />
        {showLevels ? <GameButton label="Levels" icon={(c) => <Ionicons name="grid" size={20} color={c} />} onPress={onLevels} /> : null}
      </View>
    </Panel>
  );
}

export function LoadingOverlay({ text }: { text: string }) {
  return (
    <Panel title="Daily Challenge" iconColor={colors.pink} icon={<Ionicons name="calendar" size={30} color="#fff" />}>
      <PanelText>{text}</PanelText>
    </Panel>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10, marginTop: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 6 },
  stars: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 6, marginBottom: 6 },
  starSlot: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
  starBig: { width: 68, height: 68, marginBottom: 10 },
  starCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { fontFamily: fonts.semibold, fontSize: 15, color: colors.coralDark, textAlign: 'center', marginBottom: 10 },
  stats: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'rgba(138,106,78,0.1)', borderRadius: 16, paddingVertical: 10, marginBottom: 10 },
  stat: { alignItems: 'center', gap: 1 },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.panelDim },
  statValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.panelInk },
  link: { fontFamily: fonts.semibold, fontSize: 15, color: colors.panelDim, textAlign: 'center', marginTop: 12, textDecorationLine: 'underline', padding: 4 },
});
