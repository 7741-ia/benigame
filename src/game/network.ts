export type NetworkStatus = "unconfigured" | "connecting" | "online" | "offline";

export interface NearbyPlayer {
  id: string;
  nickname: string;
  x: number;
  z: number;
}

export interface MultiplayerConfig {
  url: string;
  authToken?: string;
}

// Real WebSocket adapter. It never creates fake players. A compatible backend
// must authenticate users, persist progression and validate purchases/money.
export class MultiplayerClient {
  status: NetworkStatus = "unconfigured";
  private socket: WebSocket | null = null;
  private config: MultiplayerConfig | null = null;
  private listeners = new Set<(status: NetworkStatus) => void>();

  private setStatus(status: NetworkStatus) {
    this.status = status;
    this.listeners.forEach((listener) => listener(status));
  }

  subscribe(listener: (status: NetworkStatus) => void) {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  configure(config: MultiplayerConfig) {
    this.config = config;
    this.setStatus("offline");
  }

  connect() {
    if (!this.config?.url) {
      this.setStatus("unconfigured");
      return false;
    }
    this.setStatus("connecting");
    try {
      this.socket = new WebSocket(this.config.url);
    } catch {
      this.socket = null;
      this.setStatus("offline");
      return false;
    }
    this.socket.addEventListener("open", () => {
      this.setStatus("online");
      this.socket?.send(
        JSON.stringify({ type: "auth", token: this.config?.authToken ?? null })
      );
    });
    this.socket.addEventListener("close", () => {
      this.setStatus("offline");
    });
    this.socket.addEventListener("error", () => {
      this.setStatus("offline");
    });
    return true;
  }

  send(type: string, payload: unknown) {
    if (this.status !== "online" || this.socket?.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify({ type, payload }));
    return true;
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
    this.setStatus(this.config ? "offline" : "unconfigured");
  }
}

export const multiplayer = new MultiplayerClient();