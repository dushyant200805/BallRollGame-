import React, { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';
import { AudioService } from '../services/audio';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  name: IconName;
  onPress: () => void;
  label: string;
  off?: boolean; // e.g. sound muted
  slash?: boolean; // draw a slash over the icon when off (music)
  quiet?: boolean;
  size?: number;
}

/** Round icon button (port of the web .icon-btn). */
function IconButtonImpl({ name, onPress, label, off, slash, quiet, size = 48 }: Props) {
  return (
    <Pressable
      onPress={() => {
        if (!quiet) AudioService.play('click');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={off !== undefined ? { checked: !off } : undefined}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, { width: size, height: size, borderRadius: size / 2, opacity: off ? 0.6 : 1, transform: [{ scale: pressed ? 0.92 : 1 }] }]}
    >
      <Ionicons name={name} size={size * 0.5} color={colors.ink} />
      {slash && off ? <View style={[styles.slash, { width: size * 0.62 }]} /> : null}
    </Pressable>
  );
}

export const IconButton = memo(IconButtonImpl);

const styles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slash: { position: 'absolute', height: 3, borderRadius: 2, backgroundColor: colors.ink, transform: [{ rotate: '-45deg' }] },
});
