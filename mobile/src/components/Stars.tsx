import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

/** Row of 3 rating stars; filled ones are gold. */
function StarsImpl({ count, size = 14, dim = 'rgba(80,45,20,0.35)' }: { count: number; size?: number; dim?: string }) {
  return (
    <View style={styles.row} accessible={false}>
      {[0, 1, 2].map((i) => (
        <Ionicons key={i} name="star" size={size} color={i < count ? colors.gold : dim} style={i < count ? styles.on : undefined} />
      ))}
    </View>
  );
}

export const Stars = memo(StarsImpl);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 1 },
  on: { textShadowColor: 'rgba(120,70,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 1 },
});
