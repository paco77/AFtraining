import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

export type ActivityType = 'Running' | 'Caminata' | 'Ciclismo';

export interface LocationPoint {
    latitude: number;
    longitude: number;
    timestamp?: number;
}

export interface OutdoorActivity {
    id: string;
    date: string;
    type: ActivityType;
    distanceKm: number;
    durationSeconds: number;
    avgPaceMinKm: number;
    coordinates: LocationPoint[];
    userId?: string;
}

interface OutdoorActivityContextType {
    activities: OutdoorActivity[];
    isTracking: boolean;
    isPaused: boolean;
    activeType: ActivityType;
    elapsedSeconds: number;
    distanceKm: number;
    currentPaceMinKm: number;
    currentRoute: LocationPoint[];
    currentLocation: LocationPoint | null;
    startTracking: (type: ActivityType) => Promise<boolean>;
    pauseTracking: () => void;
    resumeTracking: () => void;
    stopAndSaveTracking: () => Promise<OutdoorActivity | null>;
    cancelTracking: () => void;
    deleteActivity: (id: string) => Promise<void>;
    refreshActivities: () => Promise<void>;
}

const OutdoorActivityContext = createContext<OutdoorActivityContextType | undefined>(undefined);

const STORAGE_KEY = '@af_outdoor_activities_v1';
export const BACKGROUND_LOCATION_TASK = 'AF_BACKGROUND_LOCATION_TRACKING';

// Global array to collect background updates across renders
let globalBgRoute: LocationPoint[] = [];

// Helper: Haversine distance formula between two lat/lng points in KM
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Calculate total distance from an array of coordinates
export function getTotalRouteDistanceKm(coords: LocationPoint[]): number {
    if (coords.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        total += calculateDistanceKm(
            coords[i - 1].latitude,
            coords[i - 1].longitude,
            coords[i].latitude,
            coords[i].longitude
        );
    }
    return total;
}

// Define Background Task (Mobile only)
if (Platform.OS !== 'web') {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }: any) => {
        if (error) {
            console.warn('Background location task error:', error);
            return;
        }
        if (data) {
            const { locations } = data;
            if (locations && locations.length > 0) {
                locations.forEach((loc: any) => {
                    const newPoint: LocationPoint = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        timestamp: loc.timestamp
                    };
                    globalBgRoute.push(newPoint);
                });
            }
        }
    });
}

export const OutdoorActivityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [activities, setActivities] = useState<OutdoorActivity[]>([]);
    const [isTracking, setIsTracking] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [activeType, setActiveType] = useState<ActivityType>('Running');
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [distanceKm, setDistanceKm] = useState(0);
    const [currentRoute, setCurrentRoute] = useState<LocationPoint[]>([]);
    const [currentLocation, setCurrentLocation] = useState<LocationPoint | null>(null);

    const timerRef = useRef<any>(null);
    const foregroundSubRef = useRef<Location.LocationSubscription | null>(null);

    // Load saved activities on startup
    useEffect(() => {
        loadActivities();
        fetchInitialLocation();
    }, []);

    const loadActivities = async () => {
        try {
            const json = await AsyncStorage.getItem(STORAGE_KEY);
            if (json) {
                const parsed = JSON.parse(json);
                setActivities(parsed);
            }
        } catch (e) {
            console.error('Error loading outdoor activities:', e);
        }
    };

    const saveActivities = async (newActivities: OutdoorActivity[]) => {
        try {
            setActivities(newActivities);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newActivities));
        } catch (e) {
            console.error('Error saving outdoor activities:', e);
        }
    };

    const fetchInitialLocation = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                setCurrentLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    timestamp: loc.timestamp
                });
            }
        } catch (e) {
            console.log('Error fetching initial location:', e);
        }
    };

    // Timer effect
    useEffect(() => {
        if (isTracking && !isPaused) {
            timerRef.current = setInterval(() => {
                setElapsedSeconds(prev => prev + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isTracking, isPaused]);

    // Start Tracking
    const startTracking = async (type: ActivityType): Promise<boolean> => {
        try {
            const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
            if (fgStatus !== 'granted') {
                Alert.alert('Permiso Denegado', 'Se requiere acceso a la ubicación para registrar tu ruta.');
                return false;
            }

            if (Platform.OS !== 'web') {
                await Location.requestBackgroundPermissionsAsync();
            }

            // Reset tracking state
            globalBgRoute = [];
            setActiveType(type);
            setElapsedSeconds(0);
            setDistanceKm(0);
            setCurrentRoute([]);
            setIsPaused(false);
            setIsTracking(true);

            // Get initial starting position
            const startLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
            const startPoint: LocationPoint = {
                latitude: startLoc.coords.latitude,
                longitude: startLoc.coords.longitude,
                timestamp: startLoc.timestamp
            };
            setCurrentLocation(startPoint);
            setCurrentRoute([startPoint]);
            globalBgRoute.push(startPoint);

            // Subscribe to foreground location updates
            foregroundSubRef.current = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.BestForNavigation,
                    timeInterval: 2000,
                    distanceInterval: 3
                },
                (loc) => {
                    const newPoint: LocationPoint = {
                        latitude: loc.coords.latitude,
                        longitude: loc.coords.longitude,
                        timestamp: loc.timestamp
                    };
                    setCurrentLocation(newPoint);

                    setCurrentRoute(prev => {
                        if (prev.length === 0) return [newPoint];
                        const last = prev[prev.length - 1];
                        const dist = calculateDistanceKm(last.latitude, last.longitude, newPoint.latitude, newPoint.longitude);
                        // Add point if moved > 2 meters
                        if (dist > 0.002) {
                            const updated = [...prev, newPoint];
                            setDistanceKm(getTotalRouteDistanceKm(updated));
                            return updated;
                        }
                        return prev;
                    });
                }
            );

            // Start background location updates if supported
            if (Platform.OS !== 'web') {
                const hasTaskStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
                if (!hasTaskStarted) {
                    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
                        accuracy: Location.Accuracy.BestForNavigation,
                        timeInterval: 3000,
                        distanceInterval: 4,
                        foregroundService: {
                            notificationTitle: 'AF Training - Registrando Actividad',
                            notificationBody: `Seguimiento de ${type} en curso...`,
                            notificationColor: '#CCFF00'
                        }
                    }).catch(err => console.log('Background task start error:', err));
                }
            }

            return true;
        } catch (error) {
            console.error('Error starting location tracking:', error);
            Alert.alert('Error', 'No se pudo iniciar el rastreo GPS.');
            return false;
        }
    };

    // Pause tracking
    const pauseTracking = () => {
        setIsPaused(true);
    };

    // Resume tracking
    const resumeTracking = () => {
        setIsPaused(false);
    };

    // Stop and Save
    const stopAndSaveTracking = async (): Promise<OutdoorActivity | null> => {
        if (!isTracking) return null;

        // Stop foreground watcher
        if (foregroundSubRef.current) {
            foregroundSubRef.current.remove();
            foregroundSubRef.current = null;
        }

        // Stop background task
        if (Platform.OS !== 'web') {
            const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
            if (hasStarted) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => { });
            }
        }

        // Combine background and foreground route points
        const finalRoute = currentRoute.length > globalBgRoute.length ? currentRoute : globalBgRoute;
        const totalDist = getTotalRouteDistanceKm(finalRoute);
        const finalDuration = elapsedSeconds;

        const avgPace = totalDist > 0 ? (finalDuration / 60) / totalDist : 0;

        const newActivity: OutdoorActivity = {
            id: 'act_' + Date.now(),
            date: new Date().toISOString(),
            type: activeType,
            distanceKm: Number(totalDist.toFixed(2)),
            durationSeconds: finalDuration,
            avgPaceMinKm: Number(avgPace.toFixed(2)),
            coordinates: finalRoute
        };

        const updatedList = [newActivity, ...activities];
        await saveActivities(updatedList);

        // Reset state
        setIsTracking(false);
        setIsPaused(false);
        setElapsedSeconds(0);
        setDistanceKm(0);
        setCurrentRoute([]);
        globalBgRoute = [];

        return newActivity;
    };

    // Cancel tracking
    const cancelTracking = async () => {
        if (foregroundSubRef.current) {
            foregroundSubRef.current.remove();
            foregroundSubRef.current = null;
        }
        if (Platform.OS !== 'web') {
            const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
            if (hasStarted) {
                await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => { });
            }
        }
        setIsTracking(false);
        setIsPaused(false);
        setElapsedSeconds(0);
        setDistanceKm(0);
        setCurrentRoute([]);
        globalBgRoute = [];
    };

    // Delete activity
    const deleteActivity = async (id: string) => {
        const filtered = activities.filter(a => a.id !== id);
        await saveActivities(filtered);
    };

    const currentPaceMinKm = distanceKm > 0 ? (elapsedSeconds / 60) / distanceKm : 0;

    return (
        <OutdoorActivityContext.Provider
            value={{
                activities,
                isTracking,
                isPaused,
                activeType,
                elapsedSeconds,
                distanceKm,
                currentPaceMinKm,
                currentRoute,
                currentLocation,
                startTracking,
                pauseTracking,
                resumeTracking,
                stopAndSaveTracking,
                cancelTracking,
                deleteActivity,
                refreshActivities: loadActivities
            }}
        >
            {children}
        </OutdoorActivityContext.Provider>
    );
};

export const useOutdoorActivity = () => {
    const context = useContext(OutdoorActivityContext);
    if (!context) {
        throw new Error('useOutdoorActivity must be used within an OutdoorActivityProvider');
    }
    return context;
};
