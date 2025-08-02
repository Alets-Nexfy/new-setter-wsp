
export interface BaseModel {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FirebaseTimestamp {
  _seconds: number;
  _nanoseconds: number;
}

export interface BaseFirestoreDocument {
  id: string;
  createdAt: FirebaseTimestamp | Timestamp | FieldValue;
  updatedAt: FirebaseTimestamp | Timestamp | FieldValue;
}

export abstract class BaseEntity implements BaseModel {
  public id: string;
  public createdAt: Date;
  public updatedAt: Date;

  constructor(data: Partial<BaseModel>) {
    this.id = data.id || '';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
  }

  public toFirestore(): Record<string, any> {
    return {
      id: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  public static fromFirestore(data: any): BaseEntity {
    return new (this as any)({
      id: data.id,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    });
  }

  public update(): void {
    this.updatedAt = new Date();
  }

  public toJSON(): Record<string, any> {
    return {
      id: this.id,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
} 