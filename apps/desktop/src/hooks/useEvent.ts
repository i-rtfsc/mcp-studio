import { useEffect } from 'react';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { EventName, EventPayload } from '@/lib/events';
import { logger } from '@/lib/logger';

/**
 * A type-safe hook to listen to Tauri events.
 * Automatically handles unlistening on cleanup.
 *
 * @param event The event name (e.g., 'config:changed')
 * @param handler The callback function
 */
export function useEvent<T extends EventName>(
  event: T,
  handler: (payload: EventPayload<T>) => void
) {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<EventPayload<T>>(event, (eventObj) => {
          // Tauri wraps the payload in an object { event: string, payload: T, ... }
          // We just pass the inner payload to the handler
          handler(eventObj.payload);
        });
      } catch (error) {
        logger.error(`Failed to listen to event: ${event}`, { fields: { error } });
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [event, handler]);
}
