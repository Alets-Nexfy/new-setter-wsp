export interface KanbanBoard {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  teamId?: string;
  settings?: KanbanBoardSettings;
}

export interface KanbanBoardSettings {
  allowCardCreation: boolean;
  allowCardEditing: boolean;
  allowCardDeletion: boolean;
  allowColumnReordering: boolean;
  allowCardReordering: boolean;
  maxCardsPerColumn?: number;
  autoArchiveCompleted: boolean;
  archiveAfterDays?: number;
}

export interface KanbanColumn {
  id: string;
  boardId: string;
  name: string;
  description?: string;
  color?: string;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  settings?: KanbanColumnSettings;
}

export interface KanbanColumnSettings {
  allowCardCreation: boolean;
  allowCardEditing: boolean;
  allowCardDeletion: boolean;
  allowCardReordering: boolean;
  maxCards?: number;
  autoArchive: boolean;
  archiveAfterDays?: number;
}

export interface KanbanCard {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'archived';
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  dueDate?: Date;
  tags: string[];
  attachments: KanbanAttachment[];
  comments: KanbanComment[];
  activity: KanbanActivity[];
  metadata: Record<string, any>;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  lastActivityAt: Date;
}

export interface KanbanAttachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'document' | 'video' | 'audio' | 'other';
  size: number;
  uploadedAt: Date;
  uploadedBy: string;
}

export interface KanbanComment {
  id: string;
  cardId: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  createdAt: Date;
  updatedAt: Date;
  isEdited: boolean;
  mentions: string[];
}

export interface KanbanActivity {
  id: string;
  cardId: string;
  type: 'created' | 'moved' | 'assigned' | 'commented' | 'updated' | 'archived' | 'restored';
  description: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface KanbanStats {
  boardId: string;
  totalCards: number;
  cardsByStatus: Record<string, number>;
  cardsByPriority: Record<string, number>;
  cardsByAssignee: Record<string, number>;
  averageCompletionTime: number;
  overdueCards: number;
  completedThisWeek: number;
  completedThisMonth: number;
  lastUpdated: Date;
}

export interface KanbanFilter {
  status?: string[];
  priority?: string[];
  assignee?: string[];
  tags?: string[];
  dueDate?: {
    from?: Date;
    to?: Date;
  };
  createdDate?: {
    from?: Date;
    to?: Date;
  };
  search?: string;
}

export interface KanbanSort {
  field: 'title' | 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' | 'assignee';
  direction: 'asc' | 'desc';
}

export interface CreateBoardRequest {
  name: string;
  description?: string;
  color?: string;
  teamId?: string;
  settings?: Partial<KanbanBoardSettings>;
}

export interface UpdateBoardRequest {
  name?: string;
  description?: string;
  color?: string;
  isActive?: boolean;
  settings?: Partial<KanbanBoardSettings>;
}

export interface CreateColumnRequest {
  boardId: string;
  name: string;
  description?: string;
  color?: string;
  order?: number;
  settings?: Partial<KanbanColumnSettings>;
}

export interface UpdateColumnRequest {
  name?: string;
  description?: string;
  color?: string;
  order?: number;
  isActive?: boolean;
  settings?: Partial<KanbanColumnSettings>;
}

export interface CreateCardRequest {
  boardId: string;
  columnId: string;
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigneeId?: string;
  dueDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UpdateCardRequest {
  title?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  status?: 'todo' | 'in_progress' | 'review' | 'done' | 'archived';
  assigneeId?: string;
  dueDate?: Date;
  tags?: string[];
  metadata?: Record<string, any>;
  columnId?: string;
  order?: number;
}

export interface MoveCardRequest {
  cardId: string;
  targetColumnId: string;
  targetOrder?: number;
}

export interface AddCommentRequest {
  cardId: string;
  content: string;
  mentions?: string[];
}

export interface UpdateCommentRequest {
  commentId: string;
  content: string;
  mentions?: string[];
}

export interface KanbanQueryOptions {
  filter?: KanbanFilter;
  sort?: KanbanSort;
  limit?: number;
  offset?: number;
  includeArchived?: boolean;
}

// Additional types for controller compatibility
export interface CreateCommentRequest {
  cardId: string;
  content: string;
  mentions?: string[];
}

export interface KanbanFilters {
  status?: string[];
  priority?: string[];
  assignee?: string[];
  tags?: string[];
  dueDate?: {
    from?: Date;
    to?: Date;
  };
  createdDate?: {
    from?: Date;
    to?: Date;
  };
  search?: string;
}

export interface KanbanSortOptions {
  field: 'title' | 'priority' | 'dueDate' | 'createdAt' | 'updatedAt' | 'assignee';
  direction: 'asc' | 'desc';
} 