import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlans } from '@/context/PlanContext';
import { Fonts } from '@/constants/theme';
import {
  Apple,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  History as HistoryIcon,
  Home,
  LogOut,
  Menu,
  Moon,
  Sun,
  Timer,
  User as UserIcon,
  Users,
  X
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function TabLayout() {
  const { mode, toggle, colors } = useTheme();
  const { currentUser, isInitialized, logout } = useUser();
  const insets = useSafeAreaInsets();
  const { activeSessionDay } = usePlans();
  const [menuVisible, setMenuVisible] = useState(false);
  const router = useRouter();

  if (!isInitialized) return null;
  if (!currentUser) return <Redirect href="/login" />;

  const isCoach = currentUser?.role === 'coach';
  const isSessionActive = activeSessionDay !== null;

  const navigateTo = (path: string) => {
    setMenuVisible(false);
    router.push(path as any);
  };

  const NavItem = ({ icon: Icon, label, path, color }: { icon: any, label: string, path: string, color?: string }) => (
    <TouchableOpacity
      style={[styles.menuItem, { borderBottomColor: colors.border + '40' }]}
      onPress={() => navigateTo(path)}
    >
      <View style={[styles.menuIconBg, { backgroundColor: (color || colors.primary) + '12' }]}>
        <Icon size={20} color={color || colors.primary} />
      </View>
      <Text style={[styles.menuLabel, { color: colors.text }]}>{label}</Text>
      <ChevronRight size={16} color={colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <>
      <Tabs
        sceneContainerStyle={{ paddingBottom: insets.bottom }}
        screenOptions={{
          headerTitle: () => (
            <View style={{ alignItems: 'center' }}>
              {currentUser?.profilePhotoUrl ? (
                <Image
                  source={{ uri: currentUser.profilePhotoUrl }}
                  style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.primary + '30' }}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.logoCircle, { backgroundColor: colors.primary, width: 32, height: 32 }]}>
                  <Text style={[styles.logoText, { fontSize: 14 }]}>AF</Text>
                </View>
              )}
            </View>
          ),
          headerShown: true,
          headerStyle: {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            ...Platform.select({
              ios: { shadowColor: 'transparent' },
              web: { boxShadow: 'none' },
              default: { elevation: 0 }
            })
          },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          headerLeft: () => (
            isCoach ? null :
              <TouchableOpacity
                style={[styles.headerBtn, { marginLeft: 16, backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
                onPress={() => setMenuVisible(true)}
              >
                <Menu size={20} color={colors.primary} />
              </TouchableOpacity>
          ),
          headerRight: () => null,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { display: 'none' },
        }}>
        <Tabs.Screen name="index" options={{ 
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />
        }} />
        <Tabs.Screen name="plan" options={{ 
          title: isCoach ? 'Mis Planes' : 'Mi Plan',
          tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} />
        }} />
        <Tabs.Screen name="nutrition" options={{ 
          title: isCoach ? 'Nutrición' : 'Mi Dieta',
          tabBarIcon: ({ color, size }) => <Apple size={size} color={color} />
        }} />
        <Tabs.Screen name="workout" options={{ 
          title: 'Entrenar',
          href: isCoach ? null : '/(tabs)/workout',
          tabBarIcon: ({ color, size }) => <Dumbbell size={size} color={color} />
        }} />
        <Tabs.Screen name="rest" options={{ 
          title: 'Descanso',
          href: null
        }} />
        <Tabs.Screen name="history" options={{ 
          title: 'Historial',
          href: null
        }} />
        <Tabs.Screen name="exercises" options={{ 
          title: 'Biblioteca',
          href: null
        }} />
        <Tabs.Screen name="clients" options={{ 
          title: 'Clientes', 
          href: isCoach ? '/(tabs)/clients' : null,
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />
        }} />
        <Tabs.Screen name="profile" options={{ 
          title: 'Mi Perfil', 
          headerLeft: () => null,
          tabBarIcon: ({ color, size }) => <UserIcon size={size} color={color} />
        }} />
      </Tabs>

      <Modal
        visible={menuVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setMenuVisible(false)}
        >
          <View style={[styles.menuContainer, { backgroundColor: colors.background }]}>
            <View style={[styles.menuHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={styles.menuHeaderMain}
                onPress={() => navigateTo('/(tabs)/profile')}
                activeOpacity={0.7}
              >
                {currentUser?.profilePhotoUrl ? (
                  <Image
                    source={{ uri: currentUser.profilePhotoUrl }}
                    style={styles.menuAvatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.logoCircleLarge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.logoTextLarge}>AF</Text>
                  </View>
                )}
                <View style={{ alignItems: 'center', marginTop: 12 }}>
                  <Text style={[styles.menuUser, { color: colors.text }]}>{currentUser?.name}</Text>
                  <Text style={[styles.menuRole, { color: colors.textMuted }]}>
                    {isCoach ? 'Entrenador' : 'Atleta'}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuCloseBtn}
                onPress={() => setMenuVisible(false)}
              >
                <X size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.menuList} showsVerticalScrollIndicator={false}>
              <NavItem icon={Home} label="Inicio" path="/(tabs)" />

              {isCoach ? (
                <>
                  <NavItem icon={ClipboardList} label="Mis Planes de entrenamiento" path="/(tabs)/plan" />
                  <NavItem icon={Apple} label="Mis Planes de Alimentación" path="/(tabs)/nutrition" />
                  <NavItem icon={Users} label="Mis Clientes" path="/(tabs)/clients" />
                </>
              ) : (
                <>
                  <NavItem icon={CalendarDays} label="Mis Planes de entrenamiento" path="/(tabs)/plan" />
                  <NavItem icon={Apple} label="Mis Planes de Alimentación" path="/(tabs)/nutrition" />
                  <NavItem icon={Dumbbell} label="Elegir sesión de entrenamiento" path="/(tabs)/workout" color={colors.accent} />
                  <NavItem icon={Timer} label="Descanso" path="/(tabs)/rest" />
                  <NavItem icon={HistoryIcon} label="Historial" path="/(tabs)/history" />
                </>
              )}

              <NavItem icon={BookOpen} label="Biblioteca de Ejercicios" path="/(tabs)/exercises" />
              <NavItem icon={UserIcon} label="Mi Perfil" path="/(tabs)/profile" />

              <View style={{ height: 40 }} />
            </ScrollView>

            <TouchableOpacity
              style={[styles.menuFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}
              onPress={logout}
            >
              <LogOut size={20} color={colors.danger} />
              <Text style={[styles.menuLogoutText, { color: colors.danger }]}>Cerrar Sesión</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}
const styles = StyleSheet.create({
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  menuContainer: {
    width: '85%',
    height: '100%',
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  menuHeader: {
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 70 : 50,
    borderBottomWidth: 1,
    alignItems: 'center',
  },
  menuHeaderMain: {
    alignItems: 'center',
  },
  menuCloseBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    right: 20,
    padding: 8,
  },
  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoCircleLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    color: '#000',
    fontSize: 18,
    fontWeight: '900',
  },
  logoTextLarge: {
    color: '#000',
    fontSize: 28,
    fontWeight: '900',
  },
  menuAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(204, 255, 0, 0.3)',
  },
  menuUser: {
    fontSize: 18,
    fontWeight: '800',
  },
  menuRole: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  menuList: {
    flex: 1,
    padding: 20,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  menuIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  menuFooter: {
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
  },
  menuLogoutText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
