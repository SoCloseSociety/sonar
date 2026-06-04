import { useEffect, useRef } from 'react';
import { connectSocket, subscribeToChannels, getSocket, disconnectSocket } from '@/services/socket';
import { useEventStore } from '@/stores/eventStore';
import { useMarketStore } from '@/stores/marketStore';
import type { SonarEvent } from '@/types/event';

const CHANNELS = ['events', 'markets', 'flights', 'vessels', 'tension', 'signals'];

/**
 * Connect to WebSocket and wire real-time events to zustand stores.
 * Call once in MainLayout.
 */
export function useWebSocket() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const socket = connectSocket();

    const onConnect = () => {
      console.log('[SONAR WS] Connected');
      subscribeToChannels(CHANNELS);
    };
    const onDisconnect = () => {
      console.log('[SONAR WS] Disconnected');
    };
    const onNewEvent = (data: unknown) => {
      try {
        useEventStore.getState().addEvent(data as SonarEvent);
      } catch (err) {
        console.error('[SONAR WS] new_event error:', err);
      }
    };
    const onMarketUpdate = (data: { condition_id?: string; new_price?: number; [k: string]: unknown }) => {
      try {
        if (data.condition_id) {
          useMarketStore.getState().updateMarket(data.condition_id, {
            price_yes: data.new_price,
            ...data,
          });
        }
      } catch (err) {
        console.error('[SONAR WS] market_update error:', err);
      }
    };
    const onNewSignal = (data: unknown) => {
      console.log('[SONAR WS] New signal received:', data);
    };
    const onTensionUpdate = (data: unknown) => {
      console.log('[SONAR WS] Tension update:', data);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('new_event', onNewEvent);
    socket.on('market_update', onMarketUpdate);
    socket.on('new_signal', onNewSignal);
    socket.on('tension_update', onTensionUpdate);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('new_event', onNewEvent);
      socket.off('market_update', onMarketUpdate);
      socket.off('new_signal', onNewSignal);
      socket.off('tension_update', onTensionUpdate);
      disconnectSocket();
      initialized.current = false;
    };
  }, []);

  return getSocket();
}
