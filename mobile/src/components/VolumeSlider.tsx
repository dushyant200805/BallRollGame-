import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../constants/theme';

interface Props {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  value: number; // 0..1
  onChange: (v: number) => void; // while dragging
  onComplete?: (v: number) => void; // finger lifted
}

/** Volume slider (drag or tap anywhere on the track). Accessible as an adjustable control. */
function VolumeSliderImpl({ label, icon, value, onChange, onComplete }: Props) {
  const [width, setWidth] = useState(0);
  const [v, setV] = useState(value);
  const live = useRef(value);
  useEffect(() => {
    setV(value);
    live.current = value;
  }, [value]);

  const gesture = useMemo(() => {
    const at = (x: number) => (width > 0 ? Math.max(0, Math.min(1, x / width)) : live.current);
    const update = (x: number) => {
      const nv = Math.round(at(x) * 100) / 100;
      if (nv === live.current) return;
      live.current = nv;
      setV(nv);
      onChange(nv);
    };
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
      .hitSlop({ top: 12, bottom: 12 })
      .onBegin((e) => update(e.x))
      .onUpdate((e) => update(e.x))
      .onFinalize(() => onComplete?.(live.current));
  }, [width, onChange, onComplete]);

  const step = (d: number) => {
    const nv = Math.max(0, Math.min(1, Math.round((live.current + d) * 100) / 100));
    live.current = nv;
    setV(nv);
    onChange(nv);
    onComplete?.(nv);
  };

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100), text: `${Math.round(v * 100)} percent` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
    >
      <View style={styles.head}>
        <View style={styles.labelRow}>
          <Ionicons name={icon} size={18} color={colors.panelDim} />
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.value}>{Math.round(v * 100)}%</Text>
      </View>
      <GestureDetector gesture={gesture}>
        <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${v * 100}%` }]} />
          </View>
          <View style={[styles.thumb, { left: Math.max(0, v * width - 13) }]} />
        </View>
      </GestureDetector>
    </View>
  );
}

export const VolumeSlider = memo(VolumeSliderImpl);

const styles = StyleSheet.create({
  wrap: { paddingVertical: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontFamily: fonts.semibold, fontSize: 16, color: colors.panelInk },
  value: { fontFamily: fonts.bold, fontSize: 15, color: colors.panelDim, minWidth: 44, textAlign: 'right' },
  hit: { height: 30, justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(138,106,78,0.25)', overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.teal, borderRadius: 4 },
  thumb: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: colors.teal,
    top: 2,
  },
});
