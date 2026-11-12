import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ZoomIn } from 'react-native-reanimated';
import { colors, fonts } from '../constants/theme';

interface Props {
  icon?: React.ReactNode;
  iconColor?: string;
  title: string;
  children?: React.ReactNode;
}

/** Modal dialog (port of the web .overlay/.panel): dimmed backdrop with a cream panel that pops in. */
export function Panel({ icon, iconColor = colors.teal, title, children }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={styles.backdrop} accessibilityViewIsModal>
      <Animated.View entering={ZoomIn.springify().damping(14).stiffness(180)} style={styles.panel}>
        {icon ? <View style={[styles.icon, { backgroundColor: iconColor }]}>{icon}</View> : null}
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

export function PanelText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.text}>{children}</Text>;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.panel,
    borderRadius: 26,
    paddingHorizontal: 22,
    paddingTop: 44,
    paddingBottom: 20,
    alignItems: 'stretch',
    borderBottomWidth: 6,
    borderBottomColor: '#e2c9a6',
  },
  icon: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.panel,
  },
  title: { fontFamily: fonts.bold, fontSize: 26, color: colors.panelInk, textAlign: 'center', marginBottom: 8 },
  text: { fontFamily: fonts.medium, fontSize: 16, color: colors.panelDim, textAlign: 'center', marginBottom: 14, lineHeight: 22 },
});
