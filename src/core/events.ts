export interface SessionEvent {
  sessionId: string;
  type: string;
  data?: any;
  decision?: any;
  timestamp: Date;
}

export interface EventEmitter {
  emit(event: SessionEvent): void | Promise<void>;
}
