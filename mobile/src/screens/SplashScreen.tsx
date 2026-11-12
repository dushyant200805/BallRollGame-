import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withTiming, ZoomIn } from 'react-native-reanimated';
import { ScreenBackground } from '../components/ScreenBackground';
import { Logo } from '../components/Logo';
import { colors, fonts } from '../constants/theme';
import type { ScreenProps } from '../navigation/types';

/** Animated entrance after the native splash: logo pops in, title rises, a loading bar fills, then Home. */
export default function SplashScreen({ navigation }: ScreenProps<'Splash'>) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(300, withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) }));
    const t = setTimeout(() => navigation.replace('Home'), 1650);
    return () => clearTimeout(t);
  }, [navigation, progress]);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View style={styles.root}>
      <ScreenBackground />
      <Animated.View entering={ZoomIn.springify().damping(12)}>
        <Logo width={250} />
      </Animated.View>
      <Animated.Text entering={FadeInDown.delay(250).springify()} style={styles.title}>
        Ball <Text style={styles.gold}>Roll</Text>
      </Animated.Text>
      <Animated.Text entering={FadeIn.delay(500)} style={styles.tag}>
        SLIDE · CONNECT · ROLL
      </Animated.Text>
      <Animated.View entering={FadeIn.delay(400)} style={styles.track} accessibilityLabel="Loading">
        <Animated.View style={[styles.fill, bar]} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontFamily: fonts.bold, fontSize: 52, color: colors.ink, marginTop: 8, textShadowColor: 'rgba(0,0,0,0.35)', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  gold: { color: colors.gold },
  tag: { fontFamily: fonts.semibold, fontSize: 14, letterSpacing: 3, color: colors.inkDim, marginTop: 2 },
  track: { width: 180, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 36, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: colors.gold },
});
