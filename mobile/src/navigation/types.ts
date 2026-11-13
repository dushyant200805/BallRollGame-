import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { LevelMode } from '../game/core/constants';

export type RootStackParamList = {
  Splash: undefined;
  Home: undefined;
  Levels: { mode: LevelMode };
  Game: { mode: LevelMode; number: number; resume?: boolean } | { mode: 'daily' };
  Balls: undefined;
  Settings: undefined;
  About: undefined;
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;
