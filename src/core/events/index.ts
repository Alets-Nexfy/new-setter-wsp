// Event handling system for decoupled communication

export interface EventHandler<T = any> {
  handle(event: T): Promise<void>;
}

export interface EventEmitter {
  emit(event: string, data: any): void;
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
}

export class EventBus implements EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();

  emit(event: string, data: any): void {
    const handlers = this.handlers.get(event) || [];
    handlers.forEach(handler => {
      handler.handle(data).catch(error => {
        console.error(`Error handling event ${event}:`, error);
      });
    });
  }

  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }
}

export const eventBus = new EventBus(); 