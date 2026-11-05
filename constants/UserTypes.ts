import { MonthlyPlan } from './PlanTypes';

export type UserRole = 'coach' | 'client' | 'independiente';

export interface BaseUser {
    id: string;
    username: string;
    email: string;
    phone?: string;
    role: UserRole;
    name: string;
    trainingInfo?: string;
    profilePhotoUrl?: string | null;
    created_at?: string;
}

export interface Coach extends BaseUser {
    role: 'coach';
    email: string;
    clients: string[]; // IDs of clients
    experienceYears?: number;
    formation?: string;
}

export interface Client extends BaseUser {
    role: 'client';
    coachId: string;
    coach?: BaseUser;
    age?: number;
    weight?: number;
    height?: number;
    trainingTime?: string; // e.g. "6 months"
    objectives?: string;
    photos?: {
        front: string | null;
        side: string | null;
        back: string | null;
    };
    front_photo_url?: string | null;
    side_photo_url?: string | null;
    back_photo_url?: string | null;
    initial_measurements?: string;
    plan?: MonthlyPlan;
}

export interface IndependentUser extends BaseUser {
    role: 'independiente';
    age?: number;
    weight?: number;
    height?: number;
    trainingTime?: string;
    objectives?: string;
    photos?: {
        front: string | null;
        side: string | null;
        back: string | null;
    };
    front_photo_url?: string | null;
    side_photo_url?: string | null;
    back_photo_url?: string | null;
    initial_measurements?: string;
    plan?: MonthlyPlan;
}

export type AppUser = Coach | Client | IndependentUser;
