
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Client } from '@/constants/UserTypes';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import Storage from '@/services/storage';
import * as ImagePicker from 'expo-image-picker';
import { Tabs, useRouter } from 'expo-router';
import { useOutdoorActivity } from '@/context/OutdoorActivityContext';
import Svg, { Path, Polyline as SvgPolyline } from 'react-native-svg';
import {
  Activity,
  Apple,
  Award,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Dumbbell,
  Footprints,
  Info,
  LogOut,
  Mail,
  Navigation,
  Play,
  PlayCircle,
  Search,
  Settings,
  User as UserIcon,
  Users,
  X,
  Zap
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { plans, fetchPlans, activeSessionDay, finishWorkoutSession, sessionStartTime } = usePlans();
  const { currentUser, clients, logout } = useUser();
  const { activities: outdoorActivities } = useOutdoorActivity();
  const [showCoachInfo, setShowCoachInfo] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const scrollViewRef = React.useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const insets = useSafeAreaInsets();

  const handleAccountMenu = () => {
    Alert.alert(
      currentUser?.name || 'Mi Cuenta',
      'Selecciona una opción:',
      [
        {
          text: 'Ver Mi Perfil',
          onPress: () => router.push('/(tabs)/profile')
        },
        {
          text: 'Cerrar Sesión',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Cerrar Sesión',
              '¿Está seguro que desea finalizar sesión?',
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sí, cerrar sesión', style: 'destructive', onPress: () => logout() }
              ]
            );
          }
        },
        {
          text: 'Cancelar',
          style: 'cancel'
        }
      ]
    );
  };

  useEffect(() => {
    const showSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      if (fetchPlans) await fetchPlans();
    } finally {
      setRefreshing(false);
    }
  }, [fetchPlans]);

  useEffect(() => {
    const loadBg = async () => {
      const saved = await Storage.getItem('home_bg_image');
      if (saved) setBgImage(saved);
    };
    loadBg();
  }, []);

  const changeBackground = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Se necesita permiso para acceder a la galería');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0].uri) {
      setBgImage(result.assets[0].uri);
      await Storage.setItem('home_bg_image', result.assets[0].uri);
    }
  };

  const isCoach = currentUser?.role === 'coach';
  const isClient = currentUser?.role === 'client';

  const activePlan = React.useMemo(() => {
    if (!currentUser) return null;
    // Un plan es personal si el usuario actual es el cliente asignado
    return plans.find(p => String(p.assignedClientId) === String(currentUser.id)) || null;
  }, [plans, currentUser?.id]);

  const totalExercises = activePlan
    ? activePlan.days.reduce((sum, d) => sum + d.exercises.length, 0)
    : 0;
  const loggedDays = activePlan?.logs?.length ?? 0;
  const totalSessions = activePlan?.logs?.reduce((sum, l) => sum + (l.sessions?.length ?? 0), 0) ?? 0;
  const totalDays = activePlan?.days.length ?? 0;

  const lastLog = activePlan?.logs && activePlan.logs.length > 0 ? activePlan.logs[activePlan.logs.length - 1] : null;
  const lastLogDay = lastLog ? activePlan?.days.find(d => d.dayNumber === lastLog.dayNumber) : null;

  const content = (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollViewRef}
        style={[styles.container, !bgImage && { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: (keyboardVisible ? 280 : 0) + Math.max(insets.bottom, 24) + 40 }
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Dashboard Coach ───────────────────────── */}
        {isCoach ? (
          <View style={[styles.coachDashboard, { paddingTop: Math.max(insets.top, 16) + 12 }]}>

            <Tabs.Screen options={{ headerShown: false }} />

            {/* Header Superior Personalizado */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl }}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 160, height: 50, marginLeft: -12 }}
                resizeMode="contain"
              />
              <TouchableOpacity
                onPress={handleAccountMenu}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                activeOpacity={0.7}
              >
                {currentUser?.profilePhotoUrl ? (
                  <Image
                    source={{ uri: currentUser.profilePhotoUrl }}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                ) : (
                  <UserIcon size={16} color={colors.primary} />
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Perfil / Cuenta</Text>
                <ChevronDown size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Coach Profile Info */}
            <View style={{ alignItems: 'center', marginBottom: Spacing.xl, paddingHorizontal: Spacing.lg }}>
              {currentUser?.profilePhotoUrl ? (
                <Image source={{ uri: currentUser.profilePhotoUrl }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16, borderWidth: 2, borderColor: Colors.primary }} />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontFamily: Fonts.headline, fontSize: 24, fontWeight: '900', color: '#000' }}>AF</Text>
                </View>
              )}
              <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 }}>HEAD COACH</Text>
              <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 6 }}>{currentUser?.name || 'Marcos Valente'}</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 }}>Especialista en Hipertrofia & Rendimiento Deportivo</Text>
            </View>

            {/* Herramientas Personales */}
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <Text style={{ fontFamily: Fonts.headline, fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center', letterSpacing: 0.5 }}>Herramientas Personales</Text>
            </View>

            <View style={{ paddingHorizontal: Spacing.lg }}>


              <TouchableOpacity
                style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 12 }}
                onPress={() => router.push('/(tabs)/plan')}
              >
                <ClipboardList size={28} color="#60A5FA" style={{ marginBottom: 12 }} />
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 4 }}>Planes de Entrenamiento</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>VER PLANES ACTIVOS Y DE TUS CLIENTES</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 12 }}
                onPress={() => router.push({ pathname: '/(tabs)/nutrition', params: { filter: 'me' } })}
              >
                <Apple size={28} color="#60A5FA" style={{ marginBottom: 12 }} />
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 4 }}>Plan de Alimentación</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>MACROS Y SUPLEMENTACIÓN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 24 }}
                onPress={() => router.push('/(tabs)/workout')}
              >
                <PlayCircle size={28} color="#60A5FA" style={{ marginBottom: 12 }} />
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 4 }}>Mi Entrenamiento</Text>
                <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>COMENZAR SESIÓN PERSONAL</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={{ backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 24 }}
              onPress={() => router.push('/(tabs)/exercises')}
            >
              <BookOpen size={28} color="#60A5FA" style={{ marginBottom: 12 }} />
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 4 }}>Biblioteca de Ejercicios</Text>
              <Text style={{ color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>EXPLORAR TODOS LOS EJERCICIOS</Text>
            </TouchableOpacity>

            <View style={styles.coachDividerLine} />

            {/* Gestión de Clientes */}
            <View style={[styles.sectionHeaderNew, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View>
                <Text style={styles.sectionTitleNew}>Gestión de Clientes</Text>
                <Text style={styles.sectionTitleSub}>{clients.length} ACTIVOS ESTA SEMANA</Text>
              </View>
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 }}
                onPress={() => router.push('/(tabs)/new-client')}
              >
                <Text style={{ fontFamily: Fonts.headline, fontSize: 12, fontWeight: '800', color: '#000' }}>+ AÑADIR</Text>
              </TouchableOpacity>
            </View>

            <View style={{ paddingHorizontal: Spacing.lg, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: colors.border }}>
                <Search size={18} color={colors.textMuted} />
                <TextInput
                  style={{ flex: 1, marginLeft: 8, color: colors.text, fontSize: 14 }}
                  placeholder="Buscar por nombre o usuario..."
                  placeholderTextColor={colors.textMuted}
                  value={clientSearchQuery}
                  onChangeText={setClientSearchQuery}
                  onFocus={() => {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 100);
                  }}
                />
                {clientSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setClientSearchQuery('')}>
                    <X size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            <View style={styles.clientsList}>
              {clients.length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: 'center' }}>No tienes clientes todavía.</Text>
              ) : clients.filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || (c.username && c.username.toLowerCase().includes(clientSearchQuery.toLowerCase()))).length === 0 ? (
                <Text style={{ color: colors.textMuted, textAlign: 'center' }}>No se encontraron clientes.</Text>
              ) : (
                clients.filter(c => c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) || (c.username && c.username.toLowerCase().includes(clientSearchQuery.toLowerCase()))).map(client => {
                  const isExpanded = expandedClientId === client.id;
                  return (
                    <View key={client.id} style={styles.clientAccordionCard}>
                      <TouchableOpacity
                        style={styles.clientAccordionHeader}
                        onPress={() => setExpandedClientId(isExpanded ? null : client.id)}
                      >
                        <View style={styles.clientAvatarDark}>
                          <UserIcon size={20} color={colors.textMuted} />
                        </View>
                        <View style={styles.clientAccordionInfo}>
                          <Text style={styles.clientAccordionName}>{client.name}</Text>
                          <Text style={styles.clientAccordionMeta}>{client.objectives || 'OBJETIVO PENDIENTE'}</Text>
                        </View>
                        {isExpanded ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.evoActionsRow}>
                          <TouchableOpacity
                            style={styles.evoActionBtn}
                            onPress={() => router.push({ pathname: '/(tabs)/plan', params: { clientId: client.id } })}
                          >
                            <Text style={styles.evoActionBtnText}>ASIGNAR RUTINA</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.evoActionBtn, { marginTop: 8, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
                            onPress={() => router.push({ pathname: '/client/[id]', params: { id: client.id } })}
                          >
                            <Text style={[styles.evoActionBtnText, { color: colors.text }]}>VER PERFIL Y PROGRESO</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            <View style={styles.coachDividerLine} />

            {/* Actividad Diaria */}
            <View style={styles.sectionHeaderNew}>
              <Text style={styles.sectionTitleNew}>Actividad Diaria</Text>
            </View>
            <TouchableOpacity
              style={[styles.stepsCardNew, { backgroundColor: colors.surface }]}
              onPress={() => router.push('/(tabs)/steps')}
              activeOpacity={0.8}
            >
              <View style={styles.stepsHeaderNew}>
                <View style={styles.stepsIconBgNew}>
                  <Footprints size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stepsLabelNew}>PASOS DIARIOS</Text>
                </View>
              </View>
            </TouchableOpacity>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                <Text style={styles.statBoxLabel}>TOTAL USUARIOS</Text>
                <Text style={[styles.statBoxValue, { color: colors.primary }]}>{clients.length}</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.surface }]}>
                <Text style={styles.statBoxLabel}>PLANES MENSUALES</Text>
                <Text style={[styles.statBoxValue, { color: colors.primary }]}>{plans.length}</Text>
              </View>
            </View>

          </View>
        ) : (
          <View style={[styles.clientDashboard, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
            <Tabs.Screen options={{ headerShown: false }} />

            {/* Header Superior Personalizado */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg }}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={{ width: 160, height: 50, marginLeft: -12 }}
                resizeMode="contain"
              />
              <TouchableOpacity
                onPress={handleAccountMenu}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: colors.surface,
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
                activeOpacity={0.7}
              >
                {currentUser?.profilePhotoUrl ? (
                  <Image
                    source={{ uri: currentUser.profilePhotoUrl }}
                    style={{ width: 22, height: 22, borderRadius: 11 }}
                  />
                ) : (
                  <UserIcon size={16} color={colors.primary} />
                )}
                <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>Perfil / Cuenta</Text>
                <ChevronDown size={14} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Greeting & Profile Info */}
            <View style={{ alignItems: 'center', marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg }}>
              {currentUser?.profilePhotoUrl ? (
                <Image source={{ uri: currentUser.profilePhotoUrl }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 14, borderWidth: 2, borderColor: Colors.primary }} />
              ) : (
                <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 14 }}>
                  <Text style={{ fontFamily: Fonts.headline, fontSize: 24, fontWeight: '900', color: '#000' }}>AF</Text>
                </View>
              )}
              <View style={{ backgroundColor: Colors.primary + '18', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 6 }}>
                <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 }}>ATLETA AF</Text>
              </View>
              <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 4 }}>
                Hola, {currentUser?.name?.split(' ')[0]}
              </Text>

              {/* ── Tarjeta Profesional del Coach Asignado ────────────── */}
              {(currentUser as Client)?.coach && (() => {
                const coachObj = (currentUser as Client).coach as any;
                const coachName = coachObj?.name || 'Tu Coach';
                const coachEmail = coachObj?.email || '';
                const coachFormation = coachObj?.formation || coachObj?.trainingInfo || 'Licenciado en Ciencias del Deporte, Especialista en Hipertrofia & Nutrición Deportiva';
                const coachExp = coachObj?.experienceYears ? `${coachObj.experienceYears} años de exp.` : 'Especialista Fitness';

                return (
                  <View style={{ width: '100%', marginTop: 14, backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}
                      onPress={() => setShowCoachInfo(!showCoachInfo)}
                      activeOpacity={0.8}
                    >
                      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primary + '18', borderWidth: 2, borderColor: Colors.primary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {coachObj?.profilePhotoUrl ? (
                          <Image
                            source={{ uri: coachObj.profilePhotoUrl }}
                            style={{ width: '100%', height: '100%', borderRadius: 26 }}
                          />
                        ) : (
                          <Users size={24} color={Colors.primary} />
                        )}
                      </View>

                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.primary }} />
                          <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }}>
                            TU COACH ASIGNADO
                          </Text>
                        </View>
                        <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800', fontFamily: Fonts.headline, marginTop: 2 }}>
                          {coachName}
                        </Text>
                        <Text style={{ color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
                          {coachFormation}
                        </Text>
                      </View>

                      <View style={{ backgroundColor: Colors.primary + '18', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
                        {showCoachInfo ? <ChevronUp size={18} color={Colors.primary} /> : <ChevronDown size={18} color={Colors.primary} />}
                      </View>
                    </TouchableOpacity>

                    {showCoachInfo && (
                      <View style={{ paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: Colors.border + '60' }}>
                        {/* Formación y Certificaciones */}
                        <View style={{ marginTop: 10, backgroundColor: Colors.background + 'A0', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: Colors.border + '50' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <BookOpen size={16} color={Colors.primary} />
                            <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                              Formación Académica & Certificaciones
                            </Text>
                          </View>
                          <Text style={{ color: Colors.text, fontSize: 13, lineHeight: 20, fontWeight: '500' }}>
                            {coachFormation}
                          </Text>
                        </View>

                        {/* Experiencia y Contacto */}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <View style={{ flex: 1, backgroundColor: Colors.background + 'A0', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border + '50', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Award size={16} color={Colors.primary} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>EXPERIENCIA</Text>
                              <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700', marginTop: 1 }}>{coachExp}</Text>
                            </View>
                          </View>

                          {coachEmail ? (
                            <View style={{ flex: 1, backgroundColor: Colors.background + 'A0', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: Colors.border + '50', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Mail size={16} color={Colors.primary} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ color: Colors.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>CONTACTO</Text>
                                <Text style={{ color: Colors.text, fontSize: 12, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>{coachEmail}</Text>
                              </View>
                            </View>
                          ) : null}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingHorizontal: 4 }}>
                          <Info size={14} color={Colors.textMuted} />
                          <Text style={{ color: Colors.textMuted, fontSize: 12, flex: 1, lineHeight: 16 }}>
                            Coach profesional a cargo de tus programas de entrenamiento y planes de alimentación.
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })()}
            </View>

            {/* Menú Principal */}
            <View style={{ marginTop: 8, marginBottom: 24, marginHorizontal: Spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontFamily: Fonts.headline, fontSize: 18, fontWeight: '700', color: Colors.text }}>Navegación</Text>
              </View>
              <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 8 }}>
                {[
                  { icon: CalendarDays, label: 'Mis Planes de entrenamiento', path: '/(tabs)/plan' },
                  { icon: Apple, label: 'Mis Planes de Alimentación', path: '/(tabs)/nutrition' },
                  { icon: Dumbbell, label: 'Elegir sesión de entrenamiento', path: '/(tabs)/workout', color: '#2BB0FF' },
                  // { icon: Navigation, label: 'Running & Caminata (Mapa GPS)', path: '/(tabs)/cardio', color: '#CCFF00' },
                  { icon: Footprints, label: 'Pasos Diarios', path: '/(tabs)/steps' },
                  { icon: UserIcon, label: 'Mi Perfil', path: '/(tabs)/profile' },
                ].map((item, idx, arr) => (
                  <TouchableOpacity
                    key={idx}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingVertical: 14,
                      paddingHorizontal: 8,
                      borderBottomWidth: idx === arr.length - 1 ? 0 : 1,
                      borderBottomColor: Colors.border + '40'
                    }}
                    onPress={() => {
                      if (item.icon === Dumbbell && activeSessionDay !== null) {
                        Alert.alert(
                          "Sesión activa",
                          "Tienes una sesión de entrenamiento iniciada. ¿Deseas terminarla para poder elegir otra?",
                          [
                            {
                              text: "No, continuar sesión",
                              onPress: () => router.push(item.path as any),
                              style: "cancel"
                            },
                            {
                              text: "Sí, terminar",
                              onPress: () => {
                                finishWorkoutSession();
                                router.push(item.path as any);
                              },
                              style: "destructive"
                            }
                          ]
                        );
                      } else {
                        router.push(item.path as any);
                      }
                    }}
                  >
                    <View style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      justifyContent: 'center',
                      alignItems: 'center',
                      marginRight: 16,
                      backgroundColor: (item.color || Colors.primary) + '15'
                    }}>
                      <item.icon size={20} color={item.color || Colors.primary} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '600', color: Colors.text }}>{item.label}</Text>
                    <ChevronRight size={16} color={Colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Tabla de Registro de Actividades GPS (Running / Caminata) */}
            {false && (
            <View style={{ marginBottom: 28, marginHorizontal: Spacing.lg }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Navigation size={20} color="#CCFF00" />
                  <Text style={{ fontFamily: Fonts.headline, fontSize: 18, fontWeight: '700', color: Colors.text }}>
                    Registro de Recorridos (GPS)
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    backgroundColor: '#CCFF0018',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#CCFF0035'
                  }}
                  onPress={() => router.push('/(tabs)/cardio')}
                >
                  <Play size={12} color="#CCFF00" fill="#CCFF00" />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#CCFF00' }}>NUEVO</Text>
                </TouchableOpacity>
              </View>

              {outdoorActivities.length > 0 ? (
                <View style={{ backgroundColor: Colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border }}>
                  {/* Table Header */}
                  <View style={{ flexDirection: 'row', backgroundColor: Colors.cardBg, paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <Text style={{ flex: 1.1, fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 }}>FECHA</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 }}>TIPO</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 }}>DISTANCIA</Text>
                    <Text style={{ flex: 1, fontSize: 11, fontWeight: '800', color: Colors.textMuted, letterSpacing: 0.5 }}>TIEMPO</Text>
                    <Text style={{ width: 44, fontSize: 11, fontWeight: '800', color: Colors.textMuted, textAlign: 'center', letterSpacing: 0.5 }}>MAPA</Text>
                  </View>

                  {/* Table Body Rows */}
                  {outdoorActivities.slice(0, 5).map((act, index) => {
                    const formattedDate = new Date(act.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                    const minutes = Math.floor(act.durationSeconds / 60);
                    const seconds = act.durationSeconds % 60;
                    const timeStr = `${minutes}m ${seconds}s`;

                    return (
                      <View
                        key={act.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 12,
                          paddingHorizontal: 12,
                          borderBottomWidth: index === Math.min(outdoorActivities.length, 5) - 1 ? 0 : 1,
                          borderBottomColor: Colors.border + '40'
                        }}
                      >
                        {/* Fecha */}
                        <Text style={{ flex: 1.1, fontSize: 12, fontWeight: '700', color: Colors.text }}>
                          {formattedDate}
                        </Text>

                        {/* Tipo */}
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          {act.type === 'Running' && <Footprints size={12} color="#CCFF00" />}
                          {act.type === 'Caminata' && <Activity size={12} color="#38BDF8" />}
                          {act.type === 'Ciclismo' && <Zap size={12} color="#F59E0B" />}
                          <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.text }}>{act.type}</Text>
                        </View>

                        {/* Distancia */}
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: '#CCFF00' }}>
                          {act.distanceKm} <Text style={{ fontSize: 10, color: Colors.textMuted }}>km</Text>
                        </Text>

                        {/* Tiempo */}
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: Colors.text }}>
                          {timeStr}
                        </Text>

                        {/* Recorrido / Mapa (Mini preview SVG) */}
                        <View style={{ width: 44, alignItems: 'center' }}>
                          <View style={{ width: 36, height: 26, borderRadius: 6, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#334155' }}>
                            <Svg width="30" height="20" viewBox="0 0 30 20">
                              {act.coordinates && act.coordinates.length >= 2 ? (
                                <SvgPolyline
                                  points={act.coordinates.map((p, idx) => {
                                    const x = Math.min(26, Math.max(4, (idx / act.coordinates.length) * 26));
                                    const y = Math.min(16, Math.max(4, 10 + Math.sin(idx) * 6));
                                    return `${x},${y}`;
                                  }).join(' ')}
                                  fill="none"
                                  stroke="#CCFF00"
                                  strokeWidth="2"
                                />
                              ) : (
                                <Path d="M 4 10 Q 15 2 26 10" fill="none" stroke="#CCFF00" strokeWidth="2" />
                              )}
                            </Svg>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ backgroundColor: Colors.surface, borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, gap: 8 }}>
                  <Navigation size={24} color={Colors.textMuted} />
                  <Text style={{ color: Colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                    Aún no has registrado sesiones de Running o Caminata.
                  </Text>
                  <TouchableOpacity
                    style={{ backgroundColor: '#CCFF00', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, marginTop: 4 }}
                    onPress={() => router.push('/(tabs)/cardio')}
                  >
                    <Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>INICIAR PRIMER RECORRIDO</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            )}


            {/* Sesión de Hoy o Última Sesión */}
            {/*activeSessionDay !== null ? (
            <TouchableOpacity style={styles.sessionCard} onPress={() => router.push('/(tabs)/workout')} activeOpacity={0.9}>
              <View style={[styles.sessionBg, { backgroundColor: Colors.surface, borderRadius: 16, borderColor: Colors.surface_lowest, borderWidth: 1 }]}>
                <View style={styles.sessionContent}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <View style={styles.sessionBadge}>
                      <Text style={styles.sessionBadgeText}>SESIÓN ACTIVA</Text>
                    </View>
                    <GlobalSessionTimer sessionStartTime={sessionStartTime} />
                  </View>
                  <View style={styles.sessionBottom}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitleClient}>Continuar Entrenamiento</Text>
                      <Text style={styles.sessionSubTitleClient}>Día {activeSessionDay}</Text>
                    </View>
                    <View style={styles.sessionPlayBtnWrapper}>
                      <View style={styles.sessionPlayBtnInner}>
                        <PlayCircle size={32} color="#000" />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ) : lastLog ? (
            <TouchableOpacity style={styles.sessionCard} onPress={() => router.push('/(tabs)/history')} activeOpacity={0.9}>
              <View style={[styles.sessionBg, { backgroundColor: Colors.surface, borderRadius: 16, borderColor: Colors.surface_lowest, borderWidth: 1 }]}>
                <View style={styles.sessionContent}>
                  <View style={[styles.sessionBadge, { backgroundColor: Colors.textMuted + '30' }]}>
                    <Text style={[styles.sessionBadgeText, { color: Colors.textMuted }]}>ÚLTIMA SESIÓN</Text>
                  </View>
                  <View style={styles.sessionBottom}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitleClient}>{lastLogDay?.label || `Día ${lastLog.dayNumber}`}</Text>
                      <Text style={styles.sessionSubTitleClient}>
                        {lastLogDay?.muscleGroups?.join(' • ') || 'Entrenamiento completado'}
                      </Text>
                    </View>
                    <View style={[styles.sessionPlayBtnWrapper, { backgroundColor: Colors.surface_lowest }]}>
                      <View style={[styles.sessionPlayBtnInner, { backgroundColor: Colors.border }]}>
                        <HistoryIcon size={24} color={Colors.textMuted} style={{ padding: 4 }} />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.sessionCard} onPress={() => router.push('/(tabs)/workout')} activeOpacity={0.9}>
              <View style={[styles.sessionBg, { backgroundColor: Colors.surface, borderRadius: 16, borderColor: Colors.surface_lowest, borderWidth: 1 }]}>
                <View style={styles.sessionContent}>
                  <View style={styles.sessionBadge}>
                    <Text style={styles.sessionBadgeText}>SESIÓN DE HOY</Text>
                  </View>
                  <View style={styles.sessionBottom}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sessionTitleClient}>Comenzar Entrenamiento</Text>
                      <Text style={styles.sessionSubTitleClient}>Elige tu rutina de hoy</Text>
                    </View>
                    <View style={styles.sessionPlayBtnWrapper}>
                      <View style={styles.sessionPlayBtnInner}>
                        <PlayCircle size={32} color="#000" />
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          )*/}



            <View style={{ height: 40 }} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );

  return content;
}



const styles = StyleSheet.create({
  clientDashboard: { flex: 1 },
  clientTopHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.lg },
  coachAvatarSmall: { width: 40, height: 40, borderRadius: 20 },
  clientHeaderTitles: { flex: 1, marginLeft: 12 },
  clientTopLogo: { fontFamily: Fonts.headline, fontSize: 16, fontWeight: '800', color: Colors.text },
  clientTopSubtitle: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },
  clientGreetingBlock: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  clientGreetingHi: { fontSize: 24, color: Colors.textMuted },
  clientGreetingName: { color: Colors.text, fontWeight: '700' },
  clientGreetingCoach: { fontSize: 14, color: Colors.primary, marginTop: 4 },
  sessionCard: { marginHorizontal: Spacing.lg, marginTop: Spacing.sm },
  sessionBg: { overflow: 'hidden' },
  sessionContent: { padding: Spacing.md },
  sessionBadge: { backgroundColor: Colors.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 12 },
  sessionBadgeText: { color: '#000', fontSize: 10, fontWeight: '800' },
  sessionBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sessionTitleClient: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  sessionSubTitleClient: { color: Colors.textMuted, fontSize: 13, marginTop: 4 },
  sessionPlayBtnWrapper: { backgroundColor: Colors.primary + '20', borderRadius: 24, padding: 4 },
  sessionPlayBtnInner: { backgroundColor: Colors.primary, borderRadius: 20 },
  coachDividerLine: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.lg, marginHorizontal: Spacing.lg },
  sectionHeaderNew: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  sectionTitleNew: { color: Colors.text, fontSize: 18, fontWeight: '700', fontFamily: Fonts.headline },
  stepsCardNew: { marginHorizontal: Spacing.lg, borderRadius: 16, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border },
  stepsHeaderNew: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  stepsIconBgNew: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + '20', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  stepsLabelNew: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  stepsValueNew: { color: Colors.text, fontSize: 24, fontWeight: '800' },
  stepsTargetNew: { color: Colors.textMuted, fontSize: 10, fontWeight: '600', marginBottom: 4 },
  stepsPercentNew: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  progressShellNew: { height: 8, backgroundColor: Colors.border, borderRadius: 4, overflow: 'hidden' },
  progressCoreNew: { height: '100%', backgroundColor: Colors.primary, borderRadius: 4 },
  statsGrid: { flexDirection: 'row', gap: 12, marginHorizontal: Spacing.lg, marginTop: Spacing.lg },
  statBox: { flex: 1, padding: Spacing.md, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  statBoxLabel: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  statBoxValue: { fontSize: 28, fontWeight: '800' },
  clientAccordionCard: { backgroundColor: Colors.surface, borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  clientAccordionHeader: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md },
  clientAvatarDark: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  clientAccordionInfo: { flex: 1 },
  clientAccordionName: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  clientAccordionMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  evoActionsRow: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  evoActionBtn: { backgroundColor: Colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center', marginBottom: 8 },
  evoActionBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
  dashboardContainer: { flex: 1, backgroundColor: Colors.background },
  topHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  coachAvatar: { width: 50, height: 50, borderRadius: 25 },
  headerTitles: { flex: 1, marginLeft: 12 },
  topLogo: { fontFamily: Fonts.headline, fontSize: 20, fontWeight: '800', color: Colors.text },
  topSubtitle: { fontSize: 11, color: Colors.textMuted, letterSpacing: 1, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  iconBtn: { padding: 4 },
  greetingBlock: { paddingHorizontal: Spacing.lg, marginTop: Spacing.xs, marginBottom: Spacing.md },
  greetingHi: { fontSize: 28, color: Colors.textMuted },
  greetingName: { color: Colors.text, fontWeight: '700' },
  bgSelector: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 8 },
  bgSelectorText: { color: Colors.primary, fontSize: 12, fontWeight: '600' },
  clientsSection: { marginHorizontal: Spacing.lg, flex: 1 },
});
