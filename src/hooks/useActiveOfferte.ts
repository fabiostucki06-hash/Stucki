import { useSyncExternalStore } from 'react';
import { getActiveOfferteId, subscribeActiveOfferteId } from '../lib/settings';
import type { Offerte } from '../types';

/** Only Offerten that can still take positions can be the active one. */
export const isOpenOfferte = (o: Offerte): boolean => o.status === 'entwurf' || o.status === 'versendet';

/** The active Offerte (see getActiveOfferteId), or undefined when none is
    selected or the remembered one was accepted, rejected or deleted since. */
export function useActiveOfferte(offerten: Offerte[]): Offerte | undefined {
  const id = useSyncExternalStore(subscribeActiveOfferteId, getActiveOfferteId);
  return id ? offerten.find((o) => o.id === id && isOpenOfferte(o)) : undefined;
}
