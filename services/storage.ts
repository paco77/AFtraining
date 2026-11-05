import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Storage abstraction that uses AsyncStorage on native mobile (no 2KB limit, robust across restarts)
 * and localStorage on Web.
 */
const Storage = {
    async setItem(key: string, value: string): Promise<void> {
        try {
            if (Platform.OS === 'web') {
                localStorage.setItem(key, value);
            } else {
                await AsyncStorage.setItem(key, value);
            }
        } catch (e) {
            console.error(`[Storage] Error setting ${key}:`, e);
        }
    },

    async getItem(key: string): Promise<string | null> {
        try {
            if (Platform.OS === 'web') {
                return localStorage.getItem(key);
            } else {
                return await AsyncStorage.getItem(key);
            }
        } catch (e) {
            console.error(`[Storage] Error getting ${key}:`, e);
            return null;
        }
    },

    async deleteItem(key: string): Promise<void> {
        try {
            if (Platform.OS === 'web') {
                localStorage.removeItem(key);
            } else {
                await AsyncStorage.removeItem(key);
            }
        } catch (e) {
            console.error(`[Storage] Error deleting ${key}:`, e);
        }
    }
};

export default Storage;
