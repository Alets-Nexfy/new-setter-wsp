import { BaseEntity, BaseModel } from './BaseModel';

export interface UserModel extends BaseModel {
  email: string;
  name: string;
  role: 'admin' | 'user';
  isActive: boolean;
  lastLoginAt?: Date;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  defaultPlatform?: 'whatsapp' | 'instagram';
  aiEnabled?: boolean;
  automationEnabled?: boolean;
  notificationsEnabled?: boolean;
  language?: string;
  timezone?: string;
}

export class User extends BaseEntity implements UserModel {
  public email: string;
  public name: string;
  public role: 'admin' | 'user';
  public isActive: boolean;
  public lastLoginAt?: Date;
  public preferences?: UserPreferences;

  constructor(data: Partial<UserModel>) {
    super(data);
    this.email = data.email || '';
    this.name = data.name || '';
    this.role = data.role || 'user';
    this.isActive = data.isActive ?? true;
    this.lastLoginAt = data.lastLoginAt;
    this.preferences = data.preferences;
  }

  public toFirestore(): Record<string, any> {
    return {
      ...super.toFirestore(),
      email: this.email,
      name: this.name,
      role: this.role,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt,
      preferences: this.preferences,
    };
  }

  public static fromFirestore(data: any): User {
    return new User({
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      isActive: data.isActive,
      lastLoginAt: data.lastLoginAt?.toDate?.() || data.lastLoginAt,
      preferences: data.preferences,
      createdAt: data.createdAt?.toDate?.() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
    });
  }

  public updateLastLogin(): void {
    this.lastLoginAt = new Date();
    this.update();
  }

  public isAdmin(): boolean {
    return this.role === 'admin';
  }

  public canAccessPlatform(platform: 'whatsapp' | 'instagram'): boolean {
    return this.isActive;
  }

  public toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      email: this.email,
      name: this.name,
      role: this.role,
      isActive: this.isActive,
      lastLoginAt: this.lastLoginAt?.toISOString(),
      preferences: this.preferences,
    };
  }
} 