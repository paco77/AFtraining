import { Colors, Fonts, Spacing } from '@/constants/theme';
import { useOutdoorActivity } from '@/context/OutdoorActivityContext';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import {
    Activity,
    ArrowLeft,
    CheckCircle2,
    Compass,
    Footprints,
    MapPin,
    Navigation,
    Pause,
    Play,
    RotateCcw,
    Square,
    Zap
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Svg, { Circle, Path, Polyline as SvgPolyline } from 'react-native-svg';

// Dynamically import react-native-maps on native platforms to prevent web issues
let MapView: any = null;
let Polyline: any = null;
let Marker: any = null;
let UrlTile: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
    try {
        const Maps = require('react-native-maps');
        MapView = Maps.default;
        Polyline = Maps.Polyline;
        Marker = Maps.Marker;
        UrlTile = Maps.UrlTile;
        PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
    } catch (e) {
        console.log('react-native-maps load warning:', e);
    }
}

const { width, height } = Dimensions.get('window');

export default function CardioScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const {
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
        cancelTracking
    } = useOutdoorActivity();

    const [selectedType, setSelectedType] = useState<'Running' | 'Caminata' | 'Ciclismo'>('Running');
    const [isSaving, setIsSaving] = useState(false);
    const mapRef = useRef<any>(null);

    // Format time (HH:MM:SS)
    const formatTime = (totalSec: number) => {
        const hrs = Math.floor(totalSec / 3600);
        const mins = Math.floor((totalSec % 3600) / 60);
        const secs = totalSec % 60;
        if (hrs > 0) {
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Format pace (min/km)
    const formatPace = (pace: number) => {
        if (!pace || !isFinite(pace) || pace <= 0 || pace > 60) return `--'--"` ;
        const mins = Math.floor(pace);
        const secs = Math.round((pace - mins) * 60);
        return `${mins}'${secs.toString().padStart(2, '0')}"`;
    };

    // Animate map camera to location
    useEffect(() => {
        if (mapRef.current && currentLocation && Platform.OS !== 'web') {
            mapRef.current.animateToRegion({
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
            }, 1000);
        }
    }, [currentLocation]);

    const handleStart = async () => {
        const started = await startTracking(selectedType);
        if (!started) {
            Alert.alert('Ubicación requerida', 'Debes otorgar permisos de ubicación para registrar tu actividad.');
        }
    };

    const handleFinish = async () => {
        Alert.alert(
            'Finalizar Recorrido',
            '¿Deseas guardar esta sesión de entrenamiento?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Sí, Guardar',
                    onPress: async () => {
                        setIsSaving(true);
                        const saved = await stopAndSaveTracking();
                        setIsSaving(false);
                        if (saved) {
                            Alert.alert('¡Actividad Guardada!', `Has recorrido ${saved.distanceKm} km en ${formatTime(saved.durationSeconds)}.`);
                        }
                    }
                }
            ]
        );
    };

    const handleCancel = () => {
        Alert.alert(
            'Descartar Actividad',
            '¿Estás seguro de cancelar? Se perderán las métricas de esta sesión.',
            [
                { text: 'No, continuar', style: 'cancel' },
                { text: 'Sí, descartar', style: 'destructive', onPress: () => cancelTracking() }
            ]
        );
    };

    const initialRegion = currentLocation ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.006,
        longitudeDelta: 0.006,
    } : {
        latitude: 19.4326,
        longitude: -99.1332,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Top Bar Header */}
            <View style={[styles.headerBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>GPS Running & Caminata</Text>
                    {isTracking && (
                        <View style={styles.bgBadge}>
                            <View style={styles.pulseDot} />
                            <Text style={styles.bgBadgeText}>Seguimiento Activo en 2º Plano</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Map Container */}
            <View style={styles.mapWrapper}>
                {Platform.OS !== 'web' && MapView ? (
                    <MapView
                        ref={mapRef}
                        style={styles.map}
                        initialRegion={initialRegion}
                        showsUserLocation
                        followsUserLocation
                        showsMyLocationButton
                        showsCompass
                        mapType="standard"
                    >
                        {/* {UrlTile && (
                            <UrlTile
                                urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                                maximumZ={19}
                                flipY={false}
                            />
                        )} */}
                        {currentRoute.length >= 2 && (
                            <Polyline
                                coordinates={currentRoute}
                                strokeColor="#CCFF00"
                                strokeWidth={6}
                            />
                        )}
                        {currentLocation && (
                            <Marker coordinate={currentLocation}>
                                <View style={styles.markerContainer}>
                                    <View style={styles.markerInner} />
                                </View>
                            </Marker>
                        )}
                    </MapView>
                ) : (
                    // Fallback visual interactive map preview for Web / Simulator
                    <View style={[styles.webMapFallback, { backgroundColor: '#1E293B' }]}>
                        <Svg width="100%" height="100%" viewBox="0 0 400 300">
                            {/* Grid Lines */}
                            <Path d="M0 50 H400 M0 100 H400 M0 150 H400 M0 200 H400 M0 250 H400" stroke="#334155" strokeWidth="1" />
                            <Path d="M50 0 V300 M100 0 V300 M150 0 V300 M200 0 V300 M250 0 V300 M300 0 V300 M350 0 V300" stroke="#334155" strokeWidth="1" />
                            
                            {/* Simulated or Actual Route SVG Line */}
                            {currentRoute.length >= 2 ? (
                                <SvgPolyline
                                    points={currentRoute.map((p, i) => `${(p.longitude % 1) * 10000 + 200},${(p.latitude % 1) * 10000 + 150}`).join(' ')}
                                    fill="none"
                                    stroke="#CCFF00"
                                    strokeWidth="5"
                                    strokeLinecap="round"
                                />
                            ) : (
                                <Path d="M 50,150 Q 150,50 250,180 T 350,100" fill="none" stroke="#CCFF00" strokeWidth="4" strokeDasharray="6,6" />
                            )}
                            <Circle cx="250" cy="180" r="10" fill="#CCFF00" fillOpacity="0.3" />
                            <Circle cx="250" cy="180" r="5" fill="#CCFF00" />
                        </Svg>

                        <View style={styles.webMapOverlayInfo}>
                            <Navigation size={18} color="#CCFF00" />
                            <Text style={styles.webMapOverlayText}>
                                {currentLocation ? `GPS: ${currentLocation.latitude.toFixed(4)}, ${currentLocation.longitude.toFixed(4)}` : 'Buscando señal GPS...'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Activity Mode Selector (when not tracking) */}
                {!isTracking && (
                    <View style={styles.typeSelectorFloating}>
                        {(['Running', 'Caminata', 'Ciclismo'] as const).map(type => {
                            const active = selectedType === type;
                            return (
                                <TouchableOpacity
                                    key={type}
                                    style={[
                                        styles.typeChip,
                                        active ? { backgroundColor: '#CCFF00', borderColor: '#CCFF00' } : { backgroundColor: 'rgba(15, 23, 42, 0.85)', borderColor: '#334155' }
                                    ]}
                                    onPress={() => setSelectedType(type)}
                                >
                                    {type === 'Running' && <Footprints size={16} color={active ? '#000' : '#FFF'} />}
                                    {type === 'Caminata' && <Activity size={16} color={active ? '#000' : '#FFF'} />}
                                    {type === 'Ciclismo' && <Zap size={16} color={active ? '#000' : '#FFF'} />}
                                    <Text style={[styles.typeChipText, { color: active ? '#000' : '#FFF' }]}>{type}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                )}
            </View>

            {/* Metrics HUD & Controls */}
            <View style={[styles.hudCard, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
                {/* Main Metrics Row */}
                <View style={styles.metricsRow}>
                    <View style={styles.metricBlockMain}>
                        <Text style={styles.metricLabel}>DISTANCIA</Text>
                        <Text style={[styles.metricValueMain, { color: colors.text }]}>
                            {distanceKm.toFixed(2)}
                            <Text style={styles.metricUnit}> KM</Text>
                        </Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.metricBlockSecondary}>
                        <Text style={styles.metricLabel}>TIEMPO</Text>
                        <Text style={[styles.metricValueSec, { color: colors.text }]}>{formatTime(elapsedSeconds)}</Text>
                    </View>

                    <View style={styles.metricDivider} />

                    <View style={styles.metricBlockSecondary}>
                        <Text style={styles.metricLabel}>RITMO MEDIO</Text>
                        <Text style={[styles.metricValueSec, { color: colors.text }]}>{formatPace(currentPaceMinKm)}</Text>
                    </View>
                </View>

                {/* Control Action Buttons */}
                <View style={styles.controlsRow}>
                    {!isTracking ? (
                        <TouchableOpacity
                            style={[styles.mainActionBtn, { backgroundColor: '#CCFF00' }]}
                            onPress={handleStart}
                            activeOpacity={0.85}
                        >
                            <Play size={24} color="#000" fill="#000" />
                            <Text style={styles.mainActionText}>INICIAR RECORRIDO</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.trackingControlsGroup}>
                            <TouchableOpacity
                                style={[styles.circleControlBtn, { backgroundColor: isPaused ? '#CCFF00' : '#F59E0B' }]}
                                onPress={isPaused ? resumeTracking : pauseTracking}
                            >
                                {isPaused ? <Play size={22} color="#000" fill="#000" /> : <Pause size={22} color="#FFF" fill="#FFF" />}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.saveActionBtn, { backgroundColor: '#10B981' }]}
                                onPress={handleFinish}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <CheckCircle2 size={20} color="#FFF" />
                                        <Text style={styles.saveActionText}>FINALIZAR</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.circleControlBtn, { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderWidth: 1, borderColor: '#EF4444' }]}
                                onPress={handleCancel}
                            >
                                <Square size={18} color="#EF4444" fill="#EF4444" />
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 54 : 36,
        paddingBottom: 14,
        borderBottomWidth: 1,
    },
    backBtn: {
        padding: 6,
        marginRight: 10,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
    },
    bgBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginTop: 2,
    },
    pulseDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#CCFF00',
    },
    bgBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#CCFF00',
    },
    mapWrapper: {
        flex: 1,
        position: 'relative',
    },
    map: {
        width: '100%',
        height: '100%',
    },
    webMapFallback: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    webMapOverlayInfo: {
        position: 'absolute',
        top: 16,
        backgroundColor: 'rgba(15, 23, 42, 0.9)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: '#334155',
    },
    webMapOverlayText: {
        color: '#FFF',
        fontSize: 12,
        fontWeight: '600',
    },
    markerContainer: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(204, 255, 0, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    markerInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#CCFF00',
        borderWidth: 2,
        borderColor: '#000',
    },
    typeSelectorFloating: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    typeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
    },
    typeChipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    hudCard: {
        borderTopWidth: 1,
        paddingHorizontal: Spacing.lg,
        paddingTop: 18,
        paddingBottom: Platform.OS === 'ios' ? 34 : 20,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        marginTop: -16,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
    },
    metricsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    metricBlockMain: {
        flex: 1.2,
        alignItems: 'flex-start',
    },
    metricBlockSecondary: {
        flex: 1,
        alignItems: 'center',
    },
    metricDivider: {
        width: 1,
        height: 36,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: Colors.textMuted,
        letterSpacing: 1,
        marginBottom: 4,
    },
    metricValueMain: {
        fontSize: 32,
        fontWeight: '900',
        fontFamily: Fonts.headline,
    },
    metricUnit: {
        fontSize: 14,
        fontWeight: '700',
        color: '#CCFF00',
    },
    metricValueSec: {
        fontSize: 20,
        fontWeight: '800',
    },
    controlsRow: {
        marginTop: 4,
    },
    mainActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        borderRadius: 16,
    },
    mainActionText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
    trackingControlsGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
    },
    circleControlBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
    },
    saveActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 52,
        borderRadius: 26,
    },
    saveActionText: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 1,
    },
});
