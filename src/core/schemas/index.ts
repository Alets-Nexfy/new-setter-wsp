// Database schemas and validation schemas

export interface DatabaseSchema {
  collection: string;
  fields: Record<string, any>;
  indexes?: string[];
  validation?: Record<string, any>;
}

export interface UserSchema extends DatabaseSchema {
  collection: 'users';
  fields: {
    id: string;
    email: string;
    phone?: string;
    name: string;
    role: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface ChatSchema extends DatabaseSchema {
  collection: 'chats';
  fields: {
    id: string;
    userId: string;
    contactId: string;
    platform: string;
    messages: any[];
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
}

export interface KanbanSchema extends DatabaseSchema {
  collection: 'kanban';
  fields: {
    id: string;
    userId: string;
    name: string;
    columns: any[];
    cards: any[];
    createdAt: Date;
    updatedAt: Date;
  };
} 