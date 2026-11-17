import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

/** Rotating sun rays behind the level-complete panel. Port of the web `.win-burst`:
 *  repeating-conic-gradient of 10° gold rays (18% opacity) turning once every 14 s. */
export function SunBurst({ animate = true, color = 'rgba(255,204,51,0.18)' }: { animate?: boolean; color?: string }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const angle = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(angle);
      return;
    }
    angle.value = 0;
    angle.value = withRepeat(withTiming(Math.PI * 2, { duration: 14000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(angle);
  }, [animate, angle]);

  const cx = size.w / 2;
  const cy = size.h / 2;
  // 18 wedges of 10° with 10° gaps, long enough to cover the corners while rotating
  const rays = useMemo(() => {
    const p = Skia.Path.Make();
    const r = Math.hypot(size.w, size.h);
    if (!r) return p;
    for (let i = 0; i < 18; i++) {
      const a0 = (i * 20 * Math.PI) / 180;
      const a1 = ((i * 20 + 10) * Math.PI) / 180;
      p.moveTo(cx, cy);
      p.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      p.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      p.close();
    }
    return p;
  }, [size.w, size.h, cx, cy]);

  const transform = useDerivedValue(() => [{ rotate: angle.value }]);

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group origin={{ x: cx, y: cy }} transform={transform}>
            <Path path={rays} color={color} />
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}
