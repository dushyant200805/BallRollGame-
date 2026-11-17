/** Reward dialogs: the gift-opening reveal, the placeholder rewarded ad and the
 *  "spend coins?" confirmation (ports of the web #overlay-reward / #overlay-ad / #overlay-confirm). */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { LinearGradient } from 'expo-linear-gradient';
import { Panel, PanelText } from './Panel';
import { GameButton } from './GameButton';
import { Poster, RewardImage } from './RewardImage';
import { colors, fonts } from '../constants/theme';
import { RewardService } from '../services/rewards';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { BALL_SKINS } from '../game/data/ballSkins';
import { ballPicture } from '../game/render/ballPainter';
import type { HistoryEntry } from '../game/core/rewards';
import type { GameTheme } from '../game/data/rewardsConfig';

export function ThemeSwatch({ theme, size }: { theme: GameTheme; size: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.25, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)' }}>
      <LinearGradient colors={theme.bg} style={StyleSheet.absoluteFill} />
      <LinearGradient
        colors={[theme.tray[0], theme.tray[1]]}
        style={{ position: 'absolute', left: '22%', right: '22%', top: '30%', bottom: '18%', borderRadius: size * 0.1 }}
      />
    </View>
  );
}

/** Art for a reward: the real ball / theme preview, else the reward-type image. */
export function RewardArt({ entry, size }: { entry: { type: HistoryEntry['type']; item?: string }; size: number }) {
  const skin = entry.type === 'ball' ? BALL_SKINS.find((s) => s.id === entry.item) : undefined;
  const pic = useMemo(() => (skin ? ballPicture(skin, size) : null), [skin, size]);
  if (pic) {
    return (
      <Canvas style={{ width: size, height: size }}>
        <Picture picture={pic} />
      </Canvas>
    );
  }
  if (entry.type === 'theme') {
    const t = RewardService.cfg.themes.find((x) => x.id === entry.item);
    if (t) return <ThemeSwatch theme={t} size={size * 0.9} />;
  }
  return <RewardImage art={RewardService.cfg.types[entry.type].art} width={size} />;
}

/** Gift reveal: the box shakes, then pops open on the reward. */
export function RewardReveal({ entry, onClose, onUse }: { entry: HistoryEntry; onClose: () => void; onUse: () => void }) {
  const [open, setOpen] = useState(false);
  const shake = useSharedValue(0);
  const d = RewardService.describe(entry);
  const canUse = entry.type === 'ball' || entry.type === 'theme' || entry.type === 'sound';

  useEffect(() => {
    const reduced = Storage.settings.animations === 'reduced';
    AudioService.play('hint');
    if (!reduced) shake.value = withRepeat(withSequence(withTiming(-1, { duration: 120 }), withTiming(1, { duration: 240 }), withTiming(0, { duration: 120 })), -1);
    const t = setTimeout(() => {
      cancelAnimation(shake);
      setOpen(true);
      AudioService.play('win');
    }, reduced ? 150 : 1100);
    return () => {
      clearTimeout(t);
      cancelAnimation(shake);
    };
  }, [shake]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (open) onClose();
      return true;
    });
    return () => sub.remove();
  }, [open, onClose]);

  const boxStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * 8}deg` }, { scale: 1 + Math.abs(shake.value) * 0.04 }] }));

  return (
    <Panel burst title={open ? d.name : 'Opening…'} iconColor="#9a5ee8" icon={<Ionicons name="gift" size={32} color="#fff" />}>
      <View style={styles.stage}>
        {open ? (
          <Animated.View entering={ZoomIn.springify().damping(10)}>
            <RewardArt entry={entry} size={130} />
          </Animated.View>
        ) : (
          <Animated.View style={boxStyle}>
            <RewardImage art="gift" width={130} />
          </Animated.View>
        )}
      </View>
      <Text style={styles.label}>{open ? `You got: ${d.label}` : ' '}</Text>
      <View style={styles.actions}>
        {open && canUse ? (
          <GameButton variant="primary" label={entry.type === 'theme' ? 'Use this theme' : entry.type === 'sound' ? 'Use this sound' : 'Use this ball'} onPress={onUse} />
        ) : null}
        <GameButton label="Collect" disabled={!open} onPress={onClose} />
      </View>
    </Panel>
  );
}

/** Apply a cosmetic reward right away ("Use this ..."). Returns a toast message. */
export function applyRewardNow(entry: HistoryEntry): string {
  if (entry.type === 'ball' && entry.item) Storage.setBall(entry.item);
  if (entry.type === 'theme' && entry.item) RewardService.setTheme(entry.item);
  if (entry.type === 'sound' && entry.item) RewardService.setRollSound(entry.item);
  if (entry.type === 'ball' || entry.type === 'sound') AudioService.setBall(RewardService.rollSoundId());
  return `${RewardService.describe(entry).name} is now in use`;
}

/** Placeholder rewarded ad (stands in for an ad network). `onDone(true)` only after the full ad. */
export function AdPlaceholder({ onDone }: { onDone: (watched: boolean) => void }) {
  const [left, setLeft] = useState(RewardService.cfg.ad.seconds);
  const done = useRef(false);
  const finish = (watched: boolean) => {
    if (done.current) return;
    done.current = true;
    onDone(watched);
  };
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      finish(false);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.adRoot} accessibilityViewIsModal>
      <View style={styles.adFrame}>
        <View style={styles.adTop}>
          <View style={styles.adTag}>
            <Text style={styles.adTagText}>Ad</Text>
          </View>
          <Text style={styles.adTimer}>{left > 0 ? `Reward in ${left}s` : 'Reward unlocked'}</Text>
          <GameButton style={styles.adClose} label="" accessibilityLabel="Close ad" icon={<Ionicons name="close" size={20} color={colors.panelInk} />} onPress={() => finish(false)} />
        </View>
        <View style={{ alignSelf: 'center' }}>
          <Poster center art="adPoster" width={300} height={467} title="Your Ad Here" sub="Test rewarded ad" />
        </View>
        <GameButton variant="primary" label="Claim reward" disabled={left > 0} onPress={() => finish(true)} />
      </View>
    </Animated.View>
  );
}

/** "Spend coins?" confirmation shown before every coin purchase. */
export function SpendConfirm({ cost, onAnswer }: { cost: number; onAnswer: (yes: boolean) => void }) {
  const answered = useRef(false);
  const answer = (yes: boolean) => {
    if (answered.current) return; // a double tap must never pay twice
    answered.current = true;
    onAnswer(yes);
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      answer(false);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Panel title="Open another gift?" iconColor={colors.gold} icon={<RewardImage art="coins" width={44} />}>
      <PanelText>{`This gift costs ${cost} coins. You have ${RewardService.coins} coins.`}</PanelText>
      <View style={styles.row}>
        <GameButton style={{ flex: 1 }} label="Cancel" onPress={() => answer(false)} />
        <GameButton style={{ flex: 1 }} variant="primary" label={`Spend ${cost}`} onPress={() => answer(true)} />
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  stage: { height: 150, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.panelDim, textAlign: 'center', marginBottom: 12 },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  adRoot: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.94)', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 80 },
  adFrame: { width: '100%', maxWidth: 380, gap: 12 },
  adTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  adTag: { backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  adTagText: { fontFamily: fonts.bold, fontSize: 13, color: '#5a3d00' },
  adTimer: { fontFamily: fonts.medium, fontSize: 15, color: colors.inkDim, flex: 1 },
  adClose: { width: 50 },
});
