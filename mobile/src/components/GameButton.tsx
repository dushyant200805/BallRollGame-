import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { colors, fonts } from '../constants/theme';
import { AudioService } from '../services/audio';

export type ButtonVariant = 'primary' | 'plain' | 'danger' | 'teal' | 'pink' | 'gold' | 'violet';

const VARIANTS: Record<ButtonVariant, { top: string; bottom: string; edge: string; ink: string }> = {
  primary: { top: '#ff8466', bottom: colors.coral, edge: colors.coralDark, ink: '#fff' },
  plain: { top: '#ffffff', bottom: colors.panel, edge: '#e2c9a6', ink: colors.panelInk },
  danger: { top: '#f26176', bottom: colors.danger, edge: colors.dangerDark, ink: '#fff' },
  teal: { top: '#47d6c9', bottom: colors.teal, edge: colors.tealDark, ink: '#fff' },
  pink: { top: '#f585b9', bottom: colors.pink, edge: colors.pinkDark, ink: '#fff' },
  gold: { top: '#ffd95c', bottom: colors.gold, edge: colors.goldDark, ink: '#4a3200' },
  violet: { top: '#9488ff', bottom: colors.violet, edge: colors.violetDark, ink: '#fff' },
};

interface Props {
  label?: string;
  sub?: string;
  icon?: React.ReactNode | ((ink: string) => React.ReactNode);
  iconRight?: boolean;
  variant?: ButtonVariant;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg' | 'xl';
  quiet?: boolean; // no click sound (the action plays its own)
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

/** Chunky 3D game button (port of the web .btn styles) with a springy press. */
function GameButtonImpl({ label, sub, icon, iconRight, variant = 'plain', onPress, disabled, style, size = 'md', quiet, accessibilityLabel, children }: Props) {
  const v = VARIANTS[variant];
  const press = useSharedValue(0);
  const anim = useAnimatedStyle(() => ({ transform: [{ translateY: press.value * 3 }, { scale: 1 - press.value * 0.02 }] }));
  const handlePress = useCallback(() => {
    if (!quiet) AudioService.play('click');
    onPress();
  }, [onPress, quiet]);
  const h = size === 'xl' ? 72 : size === 'lg' ? 58 : 50;
  const ic = typeof icon === 'function' ? icon(v.ink) : icon;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      onPressIn={() => (press.value = withSpring(1, { damping: 18, stiffness: 400 }))}
      onPressOut={() => (press.value = withSpring(0, { damping: 14, stiffness: 300 }))}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || [label, sub].filter(Boolean).join(', ')}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.wrap, { opacity: disabled ? 0.45 : 1 }, style]}
      hitSlop={4}
    >
      <View style={[styles.edge, { backgroundColor: v.edge, borderRadius: size === 'xl' ? 24 : 18 }]} />
      <Animated.View style={[{ minHeight: h }, anim]}>
        <LinearGradient
          colors={[v.top, v.bottom]}
          style={[styles.face, { minHeight: h, borderRadius: size === 'xl' ? 24 : 18 }]}
        >
          {children ?? (
            <View style={[styles.row, iconRight && { flexDirection: 'row-reverse' }]}>
              {ic}
              {label ? (
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={[styles.label, { color: v.ink, fontSize: size === 'xl' ? 26 : 18 }]}>{label}</Text>
                  {sub ? <Text style={[styles.sub, { color: v.ink }]}>{sub}</Text> : null}
                </View>
              ) : null}
            </View>
          )}
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export const GameButton = memo(GameButtonImpl);

const styles = StyleSheet.create({
  wrap: { paddingBottom: 5 },
  edge: { position: 'absolute', left: 0, right: 0, top: 5, bottom: 0 },
  face: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  label: { fontFamily: fonts.bold, letterSpacing: 0.3 },
  sub: { fontFamily: fonts.medium, fontSize: 13, opacity: 0.9, marginTop: -2 },
});
