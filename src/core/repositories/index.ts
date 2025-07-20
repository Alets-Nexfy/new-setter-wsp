// Repository layer for data access
// This will contain abstract interfaces and concrete implementations
// for different data sources (Firestore, external APIs, etc.)

export interface BaseRepository<T> {
  findById(id: string): Promise<T | null>;
  findAll(filters?: any): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
}

export interface UserRepository extends BaseRepository<any> {
  findByEmail(email: string): Promise<any | null>;
  findByPhone(phone: string): Promise<any | null>;
}

export interface ChatRepository extends BaseRepository<any> {
  findByUserId(userId: string): Promise<any[]>;
  findByContactId(contactId: string): Promise<any[]>;
}

export interface KanbanRepository extends BaseRepository<any> {
  findByBoardId(boardId: string): Promise<any[]>;
  findByUserId(userId: string): Promise<any[]>;
} 