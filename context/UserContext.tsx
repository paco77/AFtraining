import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { AppUser, Client } from '../constants/UserTypes';
import api, { getBaseUrl } from '../services/api';
import Storage from '../services/storage';


interface UserContextType {
    currentUser: AppUser | null;
    clients: Client[];
    isInitialized: boolean;
    login: (user: AppUser, token: string, rememberMe?: boolean) => Promise<void>;
    addClient: (client: Client, photos?: { profile: string | null; front: string | null; side: string | null; back: string | null }) => void;
    updateProfilePhoto: (uri: string) => Promise<AppUser>;
    updateProfile: (data: Partial<AppUser>) => Promise<AppUser>;
    logout: () => void;
    refreshProfile: () => Promise<void>;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

const formatGlobalUrl = (path: string | null) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `https://aftraining-storage.sfo2.digitaloceanspaces.com/${cleanPath}`;
};

const mapApiUserToFrontend = (apiUser: any): AppUser => {
    if (!apiUser) return apiUser;
    const base = {
        id: String(apiUser.id),
        username: apiUser.username,
        email: apiUser.email,
        role: apiUser.role as any,
        name: apiUser.name,
        trainingInfo: apiUser.training_info,
        profilePhotoUrl: formatGlobalUrl(apiUser.profile_photo_url || apiUser.profile_photo_path),
    };

    if (apiUser.role === 'client') {
        return {
            ...base,
            role: 'client',
            coachId: String(apiUser.coach_id),
            coach: apiUser.coach ? mapApiUserToFrontend(apiUser.coach) : undefined,
            age: apiUser.age,
            weight: apiUser.weight,
            height: apiUser.height,
            trainingTime: apiUser.training_time,
            objectives: apiUser.objectives,
            front_photo_url: formatGlobalUrl(apiUser.front_photo_url || apiUser.front_photo_path || apiUser.front_photo),
            side_photo_url: formatGlobalUrl(apiUser.side_photo_url || apiUser.side_photo_path || apiUser.side_photo),
            back_photo_url: formatGlobalUrl(apiUser.back_photo_url || apiUser.back_photo_path || apiUser.back_photo),
            initial_measurements: apiUser.initial_measurements || apiUser.measurements,
        };
    }

    return {
        ...base,
        role: 'coach',
        experienceYears: apiUser.experience_years,
        formation: apiUser.training_info, // Usamos training_info de la API como 'formation' en el Coach
        clients: Array.isArray(apiUser.clients) ? apiUser.clients.map(String) : [],
    };
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
    const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
    const [clients, setClients] = useState<Client[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const login = async (user: AppUser, token: string, rememberMe: boolean = false) => {
        const mappedUser = mapApiUserToFrontend(user);
        await Storage.setItem('auth_token', token);
        await Storage.setItem('user_data', JSON.stringify(mappedUser));
        await Storage.setItem('remember_me', rememberMe ? 'true' : 'false');
        setCurrentUser(mappedUser);
        // Aseguramos que se cargue el perfil completo (clientes, etc) inmediatamente
        await fetchProfile();
    };

    const fetchProfile = useCallback(async () => {
        try {
            const response = await api.get('me');
            const rawUser = response.data.data || response.data;
            console.log('DEBUG ME RAW DATA:', JSON.stringify(rawUser, null, 2));
            const user = mapApiUserToFrontend(rawUser);

            setCurrentUser(user);
            await Storage.setItem('user_data', JSON.stringify(user));

            if (user.role === 'coach') {
                const clientsRes = await api.get('clients');
                const rawClients = clientsRes.data.data || [];
                if (rawClients.length > 0) {
                    console.log('DEBUG FIRST CLIENT RAW DATA:', JSON.stringify(rawClients[0], null, 2));
                }
                const mappedClients = rawClients.map(mapApiUserToFrontend);
                setClients(mappedClients);
            }
        } catch (error: any) {
            const status = error.response?.status;
            if (!status || status >= 500) {
                console.error('Error fetching profile:', error);
            }
            // Si el error es 401, limpiamos el estado para redirigir al login
            if (status === 401) {
                logout();
            }
        }
    }, []);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const token = await Storage.getItem('auth_token');
                const savedUser = await Storage.getItem('user_data');
                const rememberMe = await Storage.getItem('remember_me');

                if (rememberMe === 'true' && savedUser) {
                    setCurrentUser(JSON.parse(savedUser));
                } else if (rememberMe !== 'true') {
                    // Si no se eligió recordar, limpiamos para este nuevo inicio
                    await Storage.deleteItem('auth_token');
                    await Storage.deleteItem('user_data');
                    setCurrentUser(null);
                }

                if (rememberMe === 'true' && token) {
                    // No bloqueamos la inicialización con el fetchProfile.
                    // Lo ejecutamos de fondo para validar y actualizar el perfil.
                    fetchProfile().catch(err => {
                        console.error('Background fetchProfile error:', err);
                    });
                }
            } catch (e) {
                console.error('Error during auth initialization:', e);
            } finally {
                setIsInitialized(true);
            }
        }
        checkAuth();
    }, [fetchProfile]);

    const addClient = useCallback(async (clientData: any, photos?: { profile: string | null; front: string | null; side: string | null; back: string | null }) => {
        try {
            let dataToSend = clientData;
            let headers = {};

            if (photos && (photos.profile || photos.front || photos.side || photos.back)) {
                dataToSend = new FormData();
                Object.keys(clientData).forEach(key => {
                    if (clientData[key] !== null && clientData[key] !== undefined) {
                        dataToSend.append(key, String(clientData[key]));
                    }
                });

                ['profile', 'front', 'side', 'back'].forEach(side => {
                    const uri = (photos as any)[side];
                    if (uri) {
                        const filename = uri.split('/').pop() || 'photo.jpg';
                        const match = /\.(\w+)$/.exec(filename);
                        const type = match ? `image/${match[1]}` : `image`;
                        dataToSend.append(`${side}_photo`, {
                            uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                            name: filename,
                            type,
                        } as any);
                    }
                });
                headers = { 'Content-Type': 'multipart/form-data' };
            }

            const response = await api.post('clients', dataToSend, { headers });
            const newClient = mapApiUserToFrontend(response.data.data);
            setClients((prev) => [...prev, newClient as Client]);
        } catch (error: any) {
            console.log('Error adding client:', error.response?.data || error.message);
            throw error;
        }
    }, []);

    const updateProfilePhoto = async (uri: string) => {
        try {
            const formData = new FormData();

            // Preparar el archivo para FormData
            let filename = uri.split('/').pop() || 'photo.jpg';
            const match = /\.(\w+)$/.exec(filename);
            let type = match ? `image/${match[1]}` : `image/jpeg`;
            if (!match) filename = `${filename}.jpg`;

            // @ts-ignore
            formData.append('profile_photo', {
                uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                name: filename,
                type: type,
            });

            // Laravel requiere _method='PUT' para procesar FormData en peticiones PUT
            formData.append('_method', 'PUT');

            const response = await api.post('profile', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const updatedUser = mapApiUserToFrontend(response.data.data);
            setCurrentUser(updatedUser);
            await Storage.setItem('user_data', JSON.stringify(updatedUser));
            return updatedUser;
        } catch (error: any) {
            console.error('Error updating profile photo:', error.response?.data || error.message);
            throw error;
        }
    };

    const updateProfile = async (data: Partial<AppUser>) => {
        try {
            const payload = {
                name: data.name,
                experience_years: data.experienceYears,
                training_info: data.formation || data.trainingInfo // Para Coach se guarda su formación en training_info
            };
            const response = await api.put('profile', payload);
            const updatedUser = mapApiUserToFrontend(response.data.data);
            setCurrentUser(updatedUser);
            await Storage.setItem('user_data', JSON.stringify(updatedUser));
            return updatedUser;
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    };

    const logout = async () => {
        await Storage.deleteItem('auth_token');
        await Storage.deleteItem('user_data');
        await Storage.deleteItem('remember_me');
        setCurrentUser(null);
    };

    return (
        <UserContext.Provider value={{ currentUser, clients, isInitialized, login, addClient, updateProfilePhoto, updateProfile, logout, refreshProfile: fetchProfile }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};
