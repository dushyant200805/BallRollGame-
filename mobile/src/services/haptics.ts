/** Device haptics for important actions; respects the Vibration setting. */
import * as Haptics from 'expo-haptics';
import { Storage } from './storage';

type Kind = 'slide' | 'connect' | 'win' | 'fail' | 'break' | 'tap' | 'warn';

export function haptic(kind: Kind) {
  if (!Storage.settings.vibration) return;
  const run = (): Promise<void> => {
    switch (kind) {
      case 'slide':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'tap':
        return Haptics.selectionAsync();
      case 'connect':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      case 'win':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'warn':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      case 'break':
        return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      case 'fail':
        return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };
  run().catch(() => {});
}
