import { useEffect, useReducer } from 'react';
import { Storage } from '../services/storage';

/** Re-render the calling component whenever saved data changes (progress, settings). */
export function useStorageVersion(): number {
  const [version, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => Storage.subscribe(bump), []);
  return version;
}
