
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { Client } from '@/constants/UserTypes';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import Storage from '@/services/storage';
import * as ImagePicker from 'expo-image-picker';
import { Tabs, useRouter } from 'expo-router';
import {
  Apple,
  BookOpen,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Dumbbell,
  Footprints,
  History as HistoryIcon,
  Info,
  LogOut,
  Mail,
  PlayCircle,
  Settings,
  Timer,
  User as UserIcon,
  Users
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { plans, fetchPlans, activeSessionDay, finishWorkoutSession } = usePlans();
  const { currentUser, clients, logout } = useUser();
  const [showCoachInfo, setShowCoachInfo] = useState(false);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

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

  const content = (
    <ScrollView
      style={[styles.container, !bgImage && { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      {/* ── Greeting ────────────────────────────────────────── */}
      <View style={{ marginBottom: Spacing.lg, alignItems: 'center' }}>
        {currentUser?.profilePhotoUrl ? (
          <Image
            source={{ uri: currentUser.profilePhotoUrl }}
            style={styles.homeAvatar}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.homeLogoCircle, { backgroundColor: colors.primary }]}>
            <Text style={styles.homeLogoText}>AF</Text>
          </View>
        )}
        <Text style={[styles.greeting, { color: colors.textMuted, marginTop: 12, textAlign: 'center' }]}>
          ¡Hola, {currentUser?.name || (isCoach ? 'Coach' : 'Atleta')}!
        </Text>
      </View>

      {/* ── Coach Card (Clients Only) ───────────────────────── */}
      {isClient && (currentUser as Client)?.coach && (
        <View style={[styles.coachCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TouchableOpacity
            style={styles.coachCardHeader}
            onPress={() => setShowCoachInfo(!showCoachInfo)}
            activeOpacity={0.7}
          >
            <View style={[styles.coachIconCircle, { backgroundColor: colors.primary + '18' }]}>
              <Users size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.coachLabel, { color: colors.textMuted }]}>Tu Coach</Text>
              <Text style={[styles.coachName, { color: colors.text }]}>
                {(currentUser as Client).coach?.name}
              </Text>
            </View>
            {showCoachInfo ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {showCoachInfo && (
            <View style={styles.coachDetails}>
              <View style={styles.coachDivider} />
              <View style={styles.coachDetailItem}>
                <Mail size={16} color={colors.primary} />
                <Text style={[styles.coachDetailText, { color: colors.text }]}>
                  {(currentUser as Client).coach?.email}
                </Text>
              </View>
              <View style={styles.coachDetailItem}>
                <Info size={16} color={colors.primary} />
                <Text style={[styles.coachDetailText, { color: colors.text }]}>
                  Tu entrenador asignado para este programa.
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* ── Dashboard Coach ───────────────────────── */}
      {isCoach ? (
        <View style={[styles.coachDashboard, { paddingTop: 20 }]}>

          <Tabs.Screen options={{ headerShown: false }} />

          {/* Header Superior Personalizado */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl }}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={{ width: 160, height: 50, marginLeft: -12 }}
              resizeMode="contain"
            />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => logout()}>
                <LogOut size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                <Settings size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
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
              onPress={() => router.push('/(tabs)/nutrition')}
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

          <View style={styles.clientsList}>
            {clients.length === 0 ? (
              <Text style={{ color: colors.textMuted, textAlign: 'center' }}>No tienes clientes todavía.</Text>
            ) : (
              clients.map(client => {
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
                        <TouchableOpacity style={styles.evoActionBtn}>
                          <Text style={styles.evoActionBtnText}>ASIGNAR DIETA</Text>
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
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.stepsTargetNew}>META: 10,000</Text>
                <Text style={styles.stepsPercentNew}>72%</Text>
              </View>
            </View>
            <View style={styles.progressShellNew}>
              <View style={[styles.progressCoreNew, { width: '72%' }]} />
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
        <View style={[styles.clientDashboard, { paddingTop: 20 }]}>
          <Tabs.Screen options={{ headerShown: false }} />

          {/* Header Superior Personalizado */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.xl }}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={{ width: 160, height: 50, marginLeft: -12 }}
              resizeMode="contain"
            />
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <TouchableOpacity onPress={() => logout()}>
                <LogOut size={22} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/(tabs)/profile')}>
                <Settings size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Greeting & Profile Info */}
          <View style={{ alignItems: 'center', marginBottom: Spacing.xl, paddingHorizontal: Spacing.lg }}>
            {currentUser?.profilePhotoUrl ? (
              <Image source={{ uri: currentUser.profilePhotoUrl }} style={{ width: 80, height: 80, borderRadius: 40, marginBottom: 16, borderWidth: 2, borderColor: Colors.primary }} />
            ) : (
              <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontFamily: Fonts.headline, fontSize: 24, fontWeight: '900', color: '#000' }}>AF</Text>
              </View>
            )}
            <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 }}>ATLETA</Text>
            <Text style={{ color: Colors.text, fontSize: 24, fontWeight: '800', fontFamily: Fonts.headline, marginBottom: 6 }}>Hola, {currentUser?.name?.split(' ')[0]}</Text>

            {(currentUser as Client)?.coach && (
              <Text style={{ color: Colors.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 20 }}>
                Coach: {(currentUser as Client).coach?.name}
              </Text>
            )}
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
                { icon: Dumbbell, label: 'Elegir sesión de entrenanmiento', path: '/(tabs)/workout', color: '#2BB0FF' },
                { icon: Timer, label: 'Descanso', path: '/(tabs)/rest' },
                { icon: HistoryIcon, label: 'Historial', path: '/(tabs)/history' },
                { icon: Footprints, label: 'Pasos Diarios', path: '/(tabs)/steps' },
                { icon: BookOpen, label: 'Biblioteca de Ejercicios', path: '/(tabs)/exercises' },
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


          {/* Sesión de Hoy */}
          <TouchableOpacity style={styles.sessionCard} onPress={() => router.push('/(tabs)/workout')} activeOpacity={0.9}>
            <View style={[styles.sessionBg, { backgroundColor: Colors.surface, borderRadius: 16, borderColor: Colors.surface_lowest, borderWidth: 1 }]}>
              <View style={styles.sessionContent}>
                <View style={styles.sessionBadge}>
                  <Text style={styles.sessionBadgeText}>SESIÓN DE HOY</Text>
                </View>
                <View style={styles.sessionBottom}>

                  <View style={styles.sessionPlayBtnWrapper}>
                    <View style={styles.sessionPlayBtnInner}>
                      <PlayCircle size={32} color="#000" />
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </TouchableOpacity>



          <View style={{ height: 40 }} />
        </View>
      )}
    </ScrollView>
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
