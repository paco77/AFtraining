import { MonthlyPlan } from './PlanTypes';

export type UserRole = 'coach' | 'client';

export interface BaseUser {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    name: string;
    trainingInfo?: string;
    profilePhotoUrl?: string;
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
    plan?: MonthlyPlan;
}

export type AppUser = Coach | Client;
