import { Platform } from 'react-native';

/** Visual identity, taken from the web game's CSS variables (css/style.css :root). */
export const colors = {
  bg1: '#1e3d58',
  bg2: '#0f1e2e',
  ink: '#fff8ec',
  inkDim: '#b9c8d6',
  panel: '#fff6e6',
  panelInk: '#3a2414',
  panelDim: '#8a6a4e',
  wood1: '#f6d197',
  wood2: '#d9964f',
  woodDark: '#6f3f1d',
  coral: '#ff6b4a',
  coralDark: '#c4402a',
  teal: '#2fc4b6',
  tealDark: '#1b8a80',
  gold: '#ffcc33',
  goldDark: '#c99300',
  violet: '#7c6cff',
  violetDark: '#5040c8',
  pink: '#f06aa8',
  pinkDark: '#b83c78',
  danger: '#e8445a',
  dangerDark: '#a82638',
  lockedTop: '#56606d',
  lockedBottom: '#424b57',
  overlay: 'rgba(8, 16, 26, 0.72)',
} as const;

/** Fredoka is embedded in the app binary (expo-font config plugin in app.json).
 *  Android names an embedded font by its file name; iOS uses its PostScript name. */
export const fonts = Platform.select({
  ios: { medium: 'Fredoka-Medium', semibold: 'Fredoka-SemiBold', bold: 'Fredoka-Bold' },
  default: { medium: 'Fredoka_500Medium', semibold: 'Fredoka_600SemiBold', bold: 'Fredoka_700Bold' },
});

export const radius = 18;
