import { Redirect } from 'expo-router';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { ActivityIndicator, View } from 'react-native';

export default function IndexScreen() {
    const { isInitialized, currentUser } = useUser();
    const { colors } = useTheme();

    if (!isInitialized) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    if (currentUser) {
        return <Redirect href="/(tabs)" />;
    }

    return <Redirect href="/login" />;
}
