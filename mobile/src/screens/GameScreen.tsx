import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Canvas, Picture, Skia, type SkPicture } from '@shopify/react-native-skia';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { Toast } from '../components/Toast';
import { FailOverlay, LoadingOverlay, PauseOverlay, WinOverlay } from '../components/GameOverlays';
import { colors, fonts } from '../constants/theme';
import { GameEngine, type HudState, type Overlay, type UiPatch } from '../game/engine';
import { useBoardGesture } from '../game/useBoardGesture';
import { LevelManager } from '../game/levelManager';
import type { LevelMode } from '../game/core/constants';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { useStorageVersion } from '../hooks/useStorage';
import type { ScreenProps } from '../navigation/types';

const EMPTY_PICTURE = (() => {
  const rec = Skia.PictureRecorder();
  rec.beginRecording(Skia.XYWHRect(0, 0, 1, 1));
  return rec.finishRecordingAsPicture();
})();

export default function GameScreen({ navigation, route }: ScreenProps<'Game'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const picture = useSharedValue<SkPicture>(EMPTY_PICTURE);
  const [hud, setHud] = useState<HudState | null>(null);
  const [status, setStatus] = useState<{ text: string; kind?: 'good' | 'bad' }>({ text: '' });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [toast, setToast] = useState<{ msg: string | null; id: number }>({ msg: null, id: 0 });
  const [loading, setLoading] = useState(false);
  const [side, setSide] = useState(0);

  const onUi = useCallback((p: UiPatch) => {
    if (p.hud) setHud(p.hud);
    if (p.status) setStatus(p.status);
    if (p.overlay !== undefined) setOverlay(p.overlay);
    if (p.toast) setToast((t) => ({ msg: p.toast!, id: t.id + 1 }));
  }, []);

  const engineRef = useRef<GameEngine | null>(null);
  if (!engineRef.current) engineRef.current = new GameEngine(picture, onUi);
  const engine = engineRef.current;
  const gesture = useBoardGesture(engine);
  const isDaily = route.params.mode === 'daily';

  // ---- load the level -------------------------------------------------------
  const startDaily = useCallback(() => {
    const key = LevelManager.dailyKey();
    const cached = Storage.data.daily.cache;
    if (cached && cached.key === key) {
      engine.startDaily(LevelManager.getDaily(key, cached)!, key);
      return;
    }
    setLoading(true);
    // let the loading panel paint before the (CPU-heavy) generation runs
    setTimeout(() => {
      const level = LevelManager.getDaily(key, null);
      setLoading(false);
      if (!level) {
        onUi({ toast: "Couldn't build today's puzzle. Please try again." });
        navigation.goBack();
        return;
      }
      Storage.cacheDaily({ key, id: level.id, size: level.size, par: level.par, rows: [...level.rows], solution: (level.solution || []).map((m) => [...m]) });
      engine.startDaily(level, key);
    }, 80);
  }, [engine, navigation, onUi]);

  useEffect(() => {
    const p = route.params;
    if (p.mode === 'daily') startDaily();
    else if (!engine.startLevel(p.mode, p.number, p.resume !== false)) navigation.goBack();
    // route params only change via navigation.replace, which remounts the screen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- focus / lifecycle -----------------------------------------------------
  useFocusEffect(
    useCallback(() => {
      engine.applySettings();
      engine.activate();
      const back = BackHandler.addEventListener('hardwareBackPress', () => {
        const o = engine.overlay;
        if (!o) engine.pause();
        else if (o.type === 'pause') engine.resume();
        else if (o.type === 'fail' && o.info.canContinue) engine.dismissFail();
        else leaveToMenu();
        return true;
      });
      return () => {
        back.remove();
        engine.deactivate();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [engine]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') engine.onBackground();
    });
    return () => {
      sub.remove();
      engine.quit();
      engine.deactivate();
    };
  }, [engine]);

  // ---- layout: the board is the largest centred square that fits ---------------
  const onBoardLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      // layout size includes the board area's padding (12 h / 10 v)
      const s = Math.floor(Math.min(width - 24, height - 20, 640));
      setSide(s);
      engine.setBoardSize(s);
    },
    [engine],
  );

  // ---- navigation actions ----------------------------------------------------
  // Explicit stacks, so Back never returns into a finished game.
  const goHome = () => {
    engine.quit();
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };
  const leaveToMenu = () => {
    if (isDaily) return goHome();
    engine.quit();
    navigation.reset({ index: 1, routes: [{ name: 'Home' }, { name: 'Levels', params: { mode: engine.mode as LevelMode } }] });
  };
  const next = () => {
    if (isDaily) return goHome();
    const n = engine.number + 1;
    if (n <= LevelManager.count(engine.mode as LevelMode)) engine.startLevel(engine.mode as LevelMode, n, false);
    else leaveToMenu();
  };
  const replay = () => {
    if (isDaily) engine.startDaily(engine.level!, engine.dailyKey!);
    else engine.startLevel(engine.mode as LevelMode, engine.number, false);
  };
  const toggleSound = () => {
    const on = !Storage.settings.sound;
    Storage.setSetting('sound', on);
    AudioService.setSound(on);
    if (on) AudioService.play('click');
  };

  const enabled = !!hud?.controlsEnabled && !overlay;
  const statusColor = status.kind === 'good' ? '#7ff0c8' : status.kind === 'bad' ? '#ffb4a6' : colors.inkDim;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="pause" label="Pause" onPress={() => engine.pause()} />
        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>{hud?.title ?? ''}</Text>
          {hud ? (
            <View style={[styles.chip, { backgroundColor: hud.chipColor }]}>
              <Text style={styles.chipText} numberOfLines={1}>{hud.chip}</Text>
            </View>
          ) : null}
        </View>
        <IconButton name={Storage.settings.sound ? 'volume-high' : 'volume-mute'} label="Sound effects" off={!Storage.settings.sound} onPress={toggleSound} quiet />
      </View>

      <View style={styles.stats}>
        <Stat icon="move" label="Moves" value={String(hud?.moves ?? 0)} />
        <Stat icon={hud?.targetIcon === 'flash' ? 'flash' : 'flag'} label={hud?.targetLabel ?? 'Par'} value={String(hud?.target ?? 0)} warn={hud?.targetWarn} />
        <Stat icon="stopwatch-outline" label={hud?.timeLabel ?? 'Time'} value={hud?.time ?? '0:00'} warn={hud?.timeWarn} />
      </View>

      <View style={styles.boardArea} onLayout={onBoardLayout}>
        {side > 0 ? (
          <GestureDetector gesture={gesture}>
            <View style={{ width: side, height: side }} accessible accessibilityLabel="Puzzle board. Drag wooden tiles into empty slots to connect the pipe from the green start to the gold goal.">
              <Canvas style={{ width: side, height: side }}>
                <Picture picture={picture} />
              </Canvas>
            </View>
          </GestureDetector>
        ) : null}
      </View>

      <Text style={[styles.status, { color: statusColor }]} numberOfLines={2} accessibilityLiveRegion="polite">
        {status.text}
      </Text>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 10 }]}>
        <Ctrl icon="arrow-undo" label="Undo" disabled={!enabled || !hud?.canUndo} onPress={() => engine.undo()} />
        <Ctrl icon="refresh" label="Restart" disabled={!enabled} onPress={() => engine.restart()} />
        <Ctrl icon="bulb" label="Hint" disabled={!enabled} onPress={() => engine.hint()} />
        <Ctrl icon="play" label="Play" play ready={!!hud?.ready} disabled={!enabled} onPress={() => engine.roll()} />
      </View>

      {overlay?.type === 'pause' ? (
        <PauseOverlay
          showLevels={!isDaily}
          onResume={() => engine.resume()}
          onRestart={() => engine.restart()}
          onSettings={() => navigation.navigate('Settings')}
          onLevels={leaveToMenu}
          onHome={goHome}
        />
      ) : null}
      {overlay?.type === 'win' ? <WinOverlay info={overlay.info} onNext={next} onReplay={replay} onMenu={leaveToMenu} /> : null}
      {overlay?.type === 'fail' ? (
        <FailOverlay info={overlay.info} showLevels={!isDaily} onContinue={() => engine.dismissFail()} onRetry={() => engine.restart()} onLevels={leaveToMenu} />
      ) : null}
      {loading ? <LoadingOverlay text="Building today's puzzle…" /> : null}
      <Toast message={toast.msg} id={toast.id} bottom={insets.bottom + 110} />
    </View>
  );
}

function Stat({ icon, label, value, warn }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string; warn?: boolean }) {
  return (
    <View style={[styles.stat, warn && styles.statWarn]}>
      <Ionicons name={icon} size={20} color={warn ? '#ffd0c8' : colors.gold} />
      <View>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

function Ctrl(p: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; disabled?: boolean; play?: boolean; ready?: boolean }) {
  // The Play button pulses once the path is complete (web: .ctrl-play.ready).
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (p.play && p.ready && Storage.settings.animations === 'full') {
      pulse.value = withRepeat(withSequence(withTiming(1, { duration: 450 }), withTiming(0, { duration: 450 })), -1);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [p.play, p.ready, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + pulse.value * 0.06 }] }));
  const body = (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      accessibilityRole="button"
      accessibilityLabel={p.play ? 'Roll the ball' : p.label}
      accessibilityState={{ disabled: !!p.disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.ctrl,
        p.play && styles.ctrlPlay,
        p.play && p.ready && styles.ctrlReady,
        { opacity: p.disabled ? 0.45 : 1, transform: [{ translateY: pressed ? 3 : 0 }] },
      ]}
    >
      <Ionicons name={p.icon} size={p.play ? 28 : 24} color={p.play ? '#fff' : colors.ink} />
      <Text style={[styles.ctrlText, p.play && { color: '#fff' }]}>{p.label}</Text>
    </Pressable>
  );
  return p.play ? <Animated.View style={[{ flex: 1.35 }, pulseStyle]}>{body}</Animated.View> : body;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, gap: 10 },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.ink },
  chip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, marginTop: 2 },
  chipText: { fontFamily: fonts.bold, fontSize: 12, color: '#fff' },
  stats: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: 12, maxWidth: 640, width: '100%', alignSelf: 'center' },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  statWarn: { backgroundColor: 'rgba(232,68,90,0.55)' },
  statLabel: { fontFamily: fonts.medium, fontSize: 11, color: colors.inkDim },
  statValue: { fontFamily: fonts.bold, fontSize: 18, color: colors.ink, marginTop: -2 },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  status: { fontFamily: fonts.semibold, fontSize: 14, textAlign: 'center', paddingHorizontal: 20, minHeight: 38 },
  controls: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 4, maxWidth: 640, width: '100%', alignSelf: 'center' },
  ctrl: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderBottomWidth: 4,
    borderBottomColor: 'rgba(0,0,0,0.3)',
  },
  ctrlPlay: { backgroundColor: colors.coral, borderBottomColor: colors.coralDark },
  ctrlReady: { backgroundColor: '#ffb020', borderBottomColor: colors.goldDark },
  ctrlText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink, marginTop: 1 },
});
