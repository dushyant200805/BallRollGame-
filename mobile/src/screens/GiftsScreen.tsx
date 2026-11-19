import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackground } from '../components/ScreenBackground';
import { IconButton } from '../components/IconButton';
import { GameButton } from '../components/GameButton';
import { Toast } from '../components/Toast';
import { Poster, RewardImage } from '../components/RewardImage';
import { AdPlaceholder, RewardReveal, SpendConfirm, ThemeSwatch, applyRewardNow } from '../components/RewardDialogs';
import { colors, fonts } from '../constants/theme';
import { BALL_SKINS } from '../game/data/ballSkins';
import type { HistoryEntry } from '../game/core/rewards';
import { RewardService } from '../services/rewards';
import { Storage } from '../services/storage';
import { AudioService } from '../services/audio';
import { useStorageVersion } from '../hooks/useStorage';
import type { ScreenProps } from '../navigation/types';

export function CoinChip({ coins }: { coins: number }) {
  return (
    <View style={styles.coinChip} accessibilityLabel={`${coins} coins`}>
      <RewardImage art="coins" width={22} />
      <Text style={styles.coinText}>{coins}</Text>
    </View>
  );
}

export default function GiftsScreen({ navigation }: ScreenProps<'Gifts'>) {
  useStorageVersion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const innerW = Math.min(width, 640) - 32;
  const [busy, setBusy] = useState(RewardService.busy);
  const [ad, setAd] = useState<((watched: boolean) => void) | null>(null);
  const [confirmCost, setConfirmCost] = useState<number | null>(null);
  const [reveal, setReveal] = useState<HistoryEntry | null>(null);
  const [playing, setPlaying] = useState<string | null>(AudioService.previewing);
  const [toast, setToast] = useState<{ msg: string | null; id: number }>({ msg: null, id: 0 });
  const say = (msg: string) => setToast((t) => ({ msg, id: t.id + 1 }));

  useEffect(() => {
    const off = RewardService.subscribeBusy(setBusy);
    return () => {
      off();
    };
  }, []);
  useEffect(() => AudioService.subscribePreview(setPlaying), []);
  useFocusEffect(useCallback(() => () => AudioService.stopPreview(), []));

  const coins = RewardService.coins;
  const next = RewardService.dailyNext();
  const m = RewardService.milestone();
  const theme = RewardService.theme();
  const ball = Storage.selectedBall();
  const rollSel = RewardService.state.rollSound && RewardService.isSoundOwned(RewardService.state.rollSound) ? RewardService.state.rollSound : '';

  // ---- gifts --------------------------------------------------------------------
  const showAd = () => new Promise<boolean>((resolve) => setAd(() => resolve));

  const openDaily = async () => {
    if (RewardService.busy) return;
    if (next.kind === 'ad') {
      const res = await RewardService.openDailyWithAd(showAd);
      setAd(null);
      if (res.ok) setReveal(res.entry);
      else if (res.reason === 'ad') say('Watch the whole ad to get the gift.');
    } else if (next.kind === 'coins') {
      if (coins < next.cost) say(`Not enough coins. This gift costs ${next.cost} coins.`);
      else setConfirmCost(next.cost);
    }
  };

  const onConfirm = (yes: boolean) => {
    const cost = confirmCost;
    setConfirmCost(null);
    if (!yes || cost == null) return;
    const res = RewardService.openDailyWithCoins(cost);
    if (res.ok) setReveal(res.entry);
    else say(res.reason === 'coins' ? 'Not enough coins.' : 'The price changed. Please try again.');
  };

  const openMilestone = () => {
    const e = RewardService.openMilestone();
    if (e) setReveal(e);
  };

  // ---- cosmetics -------------------------------------------------------------------
  const pickTheme = (id: string) => {
    if (RewardService.setTheme(id)) say(`${RewardService.theme().name} theme on`);
  };
  const pickSound = (id: string) => {
    if (!RewardService.setRollSound(id)) return;
    AudioService.setBall(RewardService.rollSoundId());
    say(id ? `${BALL_SKINS.find((s) => s.id === id)?.name} sound selected` : "Using the ball's own sound");
  };
  const preview = (id: string) => {
    if (AudioService.previewing === id) return AudioService.stopPreview();
    if (!Storage.settings.sound) return say('Sound effects are off. Turn them on in Settings to hear previews.');
    void AudioService.playPreview(id);
  };

  const themeCols = innerW >= 520 ? 4 : 3;
  const themeW = Math.floor((innerW - 10 * (themeCols - 1)) / themeCols);
  const dailyLabel = next.kind === 'ad' ? 'Watch ad to open' : next.kind === 'coins' ? `Open for ${next.cost} coins` : 'Come back tomorrow';
  const dailyDesc =
    next.kind === 'ad'
      ? "Today's first gift is free: watch a short ad to open it."
      : next.kind === 'coins'
        ? 'Want more? Open another gift with coins. The price doubles with each gift and resets tomorrow.'
        : "You've opened every gift for today.";
  const left = m.every - m.progress;

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <IconButton name="chevron-back" label="Back to home" onPress={() => navigation.goBack()} />
        <Text style={styles.h2} accessibilityRole="header">Gifts</Text>
        <CoinChip coins={coins} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false}>
        <View style={{ width: innerW, alignSelf: 'center', gap: 14 }}>
          <View style={styles.wallet}>
            <WalletItem art="coins" label="Coins" value={coins} />
            <WalletItem art="moves" label="Extra Moves" value={RewardService.extraMoves} />
          </View>

          <View style={styles.card}>
            <Poster art="dailyPoster" width={innerW - 24} height={((innerW - 24) * 220) / 600} title="Daily Gift" sub="A new surprise every day" />
            <Text style={styles.desc}>{dailyDesc}</Text>
            <GameButton
              variant={next.kind === 'coins' ? 'gold' : 'primary'}
              label={dailyLabel}
              disabled={busy || next.kind === 'limit'}
              icon={(c) => (next.kind === 'ad' ? <Ionicons name="play-circle" size={22} color={c} /> : next.kind === 'coins' ? <RewardImage art="coins" width={24} /> : null)}
              onPress={openDaily}
            />
            <Text style={styles.meta}>
              {`Opened today: ${next.opened}`}
              {next.kind === 'coins' && coins < next.cost ? ` · You need ${next.cost - coins} more coins` : ''}
            </Text>
          </View>

          <View style={styles.card}>
            <Poster art="milestonePoster" width={innerW - 24} height={((innerW - 24) * 220) / 600} title="Milestone Gift" sub={`Clear ${m.every} levels, open a gift`} badge={String(m.every)} />
            <View style={styles.bar} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: m.every, now: m.available ? m.every : m.progress }}>
              <View style={[styles.barFill, { width: `${Math.round((m.available ? 1 : m.progress / m.every) * 100)}%` }]} />
              <Text style={styles.barText}>{m.available ? `${m.available} gift${m.available > 1 ? 's' : ''} ready!` : `${m.progress} / ${m.every} levels`}</Text>
            </View>
            <GameButton
              variant="primary"
              label={m.available ? 'Open milestone gift' : `Clear ${left} more level${left > 1 ? 's' : ''}`}
              disabled={!m.available || busy}
              icon={(c) => <Ionicons name={m.available ? 'gift' : 'lock-closed'} size={20} color={c} />}
              onPress={openMilestone}
            />
          </View>

          <Head color="#f06aa8" title="Game Themes" sub="Win more from gifts" />
          <View style={styles.grid}>
            {RewardService.cfg.themes.map((t) => {
              const owned = RewardService.isThemeOwned(t.id);
              const isCur = t.id === theme.id;
              return (
                <Pressable
                  key={t.id}
                  disabled={!owned || isCur}
                  onPress={() => pickTheme(t.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${t.name}${isCur ? ', in use' : owned ? ', tap to use' : ', locked, win it from a gift'}`}
                  style={[styles.themeCard, { width: themeW }, isCur && styles.sel, !owned && { opacity: 0.55 }]}
                >
                  <ThemeSwatch theme={t} size={56} />
                  <Text style={styles.themeName} numberOfLines={1}>{t.name}</Text>
                  <Text style={[styles.themeState, isCur && { color: colors.gold }]}>{isCur ? '✓ In use' : owned ? 'Use' : '🔒 Gift'}</Text>
                </Pressable>
              );
            })}
          </View>

          <Head color={colors.violet} title="Rolling Sounds" sub="Use any sound with any ball" />
          <View style={{ gap: 8 }}>
            <SoundRow title="Ball's own sound" sub={`${ball.name} · ${ball.sound}`} owned selected={rollSel === ''} playing={playing === ball.id}
              onPreview={() => preview(ball.id)} onUse={() => pickSound('')} />
            {BALL_SKINS.map((sk) => {
              const owned = RewardService.isSoundOwned(sk.id);
              return (
                <SoundRow key={sk.id} title={sk.name} sub={owned ? sk.sound : `${sk.sound} · unlock the ball or win it from a gift`} owned={owned}
                  selected={rollSel === sk.id} playing={playing === sk.id} onPreview={() => preview(sk.id)} onUse={() => pickSound(sk.id)} />
              );
            })}
          </View>

          <Head color={colors.gold} title="Gift History" />
          <View style={{ gap: 8 }}>
            {RewardService.state.history.length ? (
              RewardService.state.history.slice(0, 15).map((h) => {
                const d = RewardService.describe(h);
                return (
                  <View key={h.id} style={styles.hist}>
                    <RewardImage art={d.art} width={32} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histName}>{d.name}</Text>
                      <Text style={styles.histSub}>{`${RewardService.sourceLabel(h)} · ${new Date(h.t).toLocaleDateString()}`}</Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.histSub, { textAlign: 'center' }]}>No gifts opened yet.</Text>
            )}
          </View>
        </View>
      </ScrollView>

      {confirmCost != null ? <SpendConfirm cost={confirmCost} onAnswer={onConfirm} /> : null}
      {reveal ? (
        <RewardReveal
          entry={reveal}
          onClose={() => setReveal(null)}
          onUse={() => {
            say(applyRewardNow(reveal));
            setReveal(null);
          }}
        />
      ) : null}
      {ad ? <AdPlaceholder onDone={(w) => ad(w)} /> : null}
      <Toast message={toast.msg} id={toast.id} bottom={insets.bottom + 24} />
    </View>
  );
}

function WalletItem({ art, label, value }: { art: string; label: string; value: number }) {
  return (
    <View style={styles.walletItem} accessible accessibilityLabel={`${label}: ${value}`}>
      <RewardImage art={art} width={38} />
      <View>
        <Text style={styles.walletLabel}>{label}</Text>
        <Text style={styles.walletValue}>{value}</Text>
      </View>
    </View>
  );
}

function Head({ color, title, sub }: { color: string; title: string; sub?: string }) {
  return (
    <View style={styles.head}>
      <View style={[styles.headDot, { backgroundColor: color }]} />
      <Text style={styles.headTitle}>{title}</Text>
      {sub ? <Text style={styles.headSub}>{sub}</Text> : null}
    </View>
  );
}

function SoundRow(p: { title: string; sub: string; owned: boolean; selected: boolean; playing: boolean; onPreview: () => void; onUse: () => void }) {
  return (
    <View style={[styles.soundRow, p.selected && styles.sel, !p.owned && { opacity: 0.55 }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.soundTitle}>{p.title}</Text>
        <Text style={styles.soundSub}>{p.sub}</Text>
      </View>
      {p.owned ? (
        <Pressable onPress={p.onPreview} accessibilityRole="button" accessibilityLabel={`Preview ${p.title}`} hitSlop={4} style={[styles.preview, p.playing && styles.previewOn]}>
          <Ionicons name={p.playing ? 'stop' : 'play'} size={18} color="#fff" />
        </Pressable>
      ) : null}
      <Pressable
        onPress={p.onUse}
        disabled={!p.owned || p.selected}
        accessibilityRole="button"
        accessibilityLabel={p.selected ? `${p.title} in use` : p.owned ? `Use ${p.title}` : `${p.title}, locked`}
        style={[styles.use, p.selected && styles.useSel, !p.owned && styles.useLocked]}
      >
        {p.owned ? <Text style={styles.useText}>{p.selected ? '✓ In use' : 'Use'}</Text> : <Ionicons name="lock-closed" size={16} color={colors.inkDim} />}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  h2: { fontFamily: fonts.bold, fontSize: 24, color: colors.ink },
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.25)', paddingLeft: 6, paddingRight: 12, paddingVertical: 5, borderRadius: 16 },
  coinText: { fontFamily: fonts.bold, fontSize: 15, color: '#ffe08a' },
  scroll: { paddingTop: 6 },
  wallet: { flexDirection: 'row', gap: 10 },
  walletItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.22)' },
  walletLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkDim },
  walletValue: { fontFamily: fonts.bold, fontSize: 20, color: colors.ink },
  card: { gap: 10, padding: 12, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)' },
  desc: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkDim, textAlign: 'center' },
  meta: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.inkDim, textAlign: 'center', marginTop: -2 },
  bar: { height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 15, backgroundColor: '#f07050' },
  barText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink, textAlign: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  headDot: { width: 12, height: 12, borderRadius: 4 },
  headTitle: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
  headSub: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.inkDim, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeCard: { alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.08)' },
  sel: { borderColor: colors.gold, backgroundColor: 'rgba(255,204,51,0.12)' },
  themeName: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  themeState: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkDim },
  soundRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 8, paddingLeft: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 2, borderColor: 'transparent' },
  soundTitle: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  soundSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkDim },
  preview: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal, borderBottomWidth: 3, borderBottomColor: colors.tealDark },
  previewOn: { backgroundColor: colors.coral, borderBottomColor: colors.coralDark },
  use: { minWidth: 72, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.panel, borderBottomWidth: 3, borderBottomColor: '#d7b98f', paddingHorizontal: 8 },
  useSel: { backgroundColor: colors.gold, borderBottomColor: colors.goldDark },
  useLocked: { backgroundColor: 'rgba(0,0,0,0.25)', borderBottomColor: 'transparent' },
  useText: { fontFamily: fonts.bold, fontSize: 13, color: colors.panelInk },
  hist: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)' },
  histName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  histSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkDim },
});
