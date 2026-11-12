import { useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { GameEngine } from './engine';

/** Touch input for the board (replaces the web Pointer Events controller).
 *  Same rules: drag a tile toward an empty slot (commit past 35% of a cell),
 *  or tap a tile that has only one free side. Runs on the JS thread so it can
 *  call straight into the engine; coordinates are relative to the board canvas. */
export function useBoardGesture(engine: GameEngine) {
  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minDistance(0)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .onBegin((e) => engine.pointerDown(e.x, e.y))
        .onUpdate((e) => engine.pointerMove(e.x, e.y))
        .onFinalize((_e, success) => {
          if (success) engine.pointerUp();
          else engine.pointerCancel();
        }),
    [engine],
  );
}
