/** Messages between the web interface and the native Xbox host. */

interface HostWindow extends Window {
  chrome?: { webview?: { postMessage(message: unknown): void; addEventListener?(type: 'message', listener: (event: { data: unknown }) => void): void } };
  ATTRACT_NATIVE?: boolean;
}

const host = window as unknown as HostWindow;

export const isNative = (): boolean => host.ATTRACT_NATIVE === true;

export function postNative(message: unknown): void {
  try { host.chrome?.webview?.postMessage(message); } catch { /* browser preview has no host */ }
}

export function onNativeMessage(listener: (message: Record<string, unknown>) => void): void {
  host.chrome?.webview?.addEventListener?.('message', (event) => {
    if (event.data && typeof event.data === 'object') listener(event.data as Record<string, unknown>);
  });
}

export interface LaunchRequest { gameId: string; core: string; path: string }

/** Ask the host to start the game in RetroArch; it returns to this app when the player quits. */
export function launchGame(request: LaunchRequest): void {
  postNative({ type: 'launch', ...request });
}
