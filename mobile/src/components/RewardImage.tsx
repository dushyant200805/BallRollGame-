import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { fonts } from '../constants/theme';
import { Canvas, ImageSVG, Skia, type SkSVG } from '@shopify/react-native-skia';
import { REWARD_ART } from '../game/data/rewardArt';
import { REWARDS_CONFIG } from '../game/data/rewardsConfig';

const cache = new Map<string, SkSVG | null>();

function svgFor(file: string): SkSVG | null {
  if (!cache.has(file)) {
    const src = REWARD_ART[file];
    cache.set(file, src ? Skia.SVG.MakeFromString(src) : null);
  }
  return cache.get(file) ?? null;
}

/** Reward / poster art. `art` is a key of REWARDS_CONFIG.art (or a file name in assets/rewards).
 *  The art is PLACEHOLDER: replace the SVG files and re-run scripts/convert-levels.js. */
function RewardImageImpl({ art, width, height, style }: { art: string; width: number; height?: number; style?: StyleProp<ViewStyle> }) {
  const file = REWARDS_CONFIG.art[art] || art;
  const svg = useMemo(() => svgFor(file), [file]);
  const h = height ?? width;
  if (!svg) return null;
  return (
    <Canvas style={[{ width, height: h }, style]} pointerEvents="none">
      <ImageSVG svg={svg} x={0} y={0} width={width} height={h} />
    </Canvas>
  );
}

export const RewardImage = memo(RewardImageImpl);

/** Poster art with its words drawn as native text (Skia's SVG renderer skips SVG <text>).
 *  Positions follow the placeholder posters' 600x220 / 360x560 layouts. */
export function Poster({ art, width, height, title, sub, badge, center }: {
  art: string; width: number; height: number; title: string; sub?: string; badge?: string; center?: boolean;
}) {
  const k = height / (center ? 560 : 220);
  return (
    <View style={{ width, height }}>
      <RewardImage art={art} width={width} height={height} />
      <View style={[StyleSheet.absoluteFill, center ? { alignItems: 'center', paddingTop: 395 * k } : { paddingLeft: 36 * (width / 600), paddingTop: 40 * k }]} pointerEvents="none">
        <Text style={[styles.title, { fontSize: (center ? 38 : 46) * k }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[styles.sub, { fontSize: (center ? 20 : 23) * k }, center && { color: '#b9c8d6' }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {badge ? (
        <Text style={[styles.badge, { left: (470 / 600) * width - 40, top: 104 * k - 14 * k, width: 80, fontSize: 28 * k }]}>{badge}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.bold, color: '#fff' },
  sub: { fontFamily: fonts.semibold, color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  badge: { position: 'absolute', textAlign: 'center', fontFamily: fonts.bold, color: '#7a5600' },
});
