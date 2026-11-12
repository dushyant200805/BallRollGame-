import React, { useEffect } from 'react';
import { Canvas, Circle, Group, Line, LinearGradient, RadialGradient, RoundedRect, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

/** The web home-screen logo (three tiles, gold tube, red ball rolling into the goal), drawn with Skia.
 *  The ball rolls along the tube on a loop, like the CSS `logo-roll` animation. */
export function Logo({ width = 260, animate = true }: { width?: number; animate?: boolean }) {
  const k = width / 220;
  const h = 120 * k;
  const roll = useSharedValue(0);
  useEffect(() => {
    if (!animate) return;
    roll.value = withRepeat(
      withSequence(
        withDelay(700, withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) })),
        withDelay(500, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
  }, [animate, roll]);
  const ballX = useDerivedValue(() => (38 + (182 - 38) * roll.value) * k);
  const ballR = useDerivedValue(() => (roll.value > 0.96 ? 12 - (roll.value - 0.96) * 100 : 12) * k);
  const shine = useDerivedValue(() => vec(ballX.value - 4 * k, 68 * k));

  const tile = (x: number, c0: string, c1: string) => (
    <Group key={x}>
      <RoundedRect x={x * k} y={44 * k} width={64 * k} height={64 * k} r={12 * k} color="rgba(0,0,0,0.33)" />
      <RoundedRect x={x * k} y={40 * k} width={64 * k} height={64 * k} r={12 * k}>
        <LinearGradient start={vec(x * k, 40 * k)} end={vec((x + 26) * k, 104 * k)} colors={[c0, c1]} />
      </RoundedRect>
    </Group>
  );

  return (
    <Canvas style={{ width, height: h }}>
      {tile(6, '#c8f0d6', '#5cc58e')}
      {tile(78, '#f6d197', '#d9964f')}
      {tile(150, '#ffe9a8', '#f0b23a')}
      <Line p1={vec(38 * k, 72 * k)} p2={vec(182 * k, 72 * k)} color="rgba(60,32,12,0.53)" strokeWidth={24 * k} />
      <Line p1={vec(38 * k, 72 * k)} p2={vec(182 * k, 72 * k)} color="#ffcc33" strokeWidth={15 * k} />
      <Line p1={vec(38 * k, 72 * k)} p2={vec(182 * k, 72 * k)} color="rgba(255,250,215,0.9)" strokeWidth={5 * k} />
      <Circle cx={182 * k} cy={72 * k} r={13 * k} color="#2a1804" />
      <Circle cx={182 * k} cy={72 * k} r={13 * k} color="#ffe48a" style="stroke" strokeWidth={3.5 * k} />
      <Circle cx={ballX} cy={72 * k} r={ballR}>
        <RadialGradient c={shine} r={18 * k} colors={['#ff9aa4', '#f23a55', '#8f0f2a']} positions={[0, 0.45, 1]} />
      </Circle>
    </Canvas>
  );
}
