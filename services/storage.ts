import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * A storage abstraction that uses expo-secure-store on mobile
 * and localStorage on Web.
 */
const Storage = {
    async setItem(key: string, value: string): Promise<void> {
        if (Platform.OS === 'web') {
            try {
                localStorage.setItem(key, value);
            } catch (e) {
                console.error('Error saving to localStorage', e);
            }
        } else {
            await SecureStore.setItemAsync(key, value);
        }
    },

    async getItem(key: string): Promise<string | null> {
        if (Platform.OS === 'web') {
            try {
                return localStorage.getItem(key);
            } catch (e) {
                console.error('Error reading from localStorage', e);
                return null;
            }
        } else {
            return await SecureStore.getItemAsync(key);
        }
    },

    async deleteItem(key: string): Promise<void> {
        if (Platform.OS === 'web') {
            try {
                localStorage.removeItem(key);
            } catch (e) {
                console.error('Error removing from localStorage', e);
            }
        } else {
            await SecureStore.deleteItemAsync(key);
        }
    }
};

export default Storage;
