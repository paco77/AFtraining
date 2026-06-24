import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Colors, Fonts, Spacing, borderRadius } from '@/constants/theme';
import { Footprints, Plus } from 'lucide-react-native';
import { getUserStepLogs, saveUserSteps } from '@/services/api';
import { Picker } from '@react-native-picker/picker';

export default function StepsScreen() {
    const [steps, setSteps] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);

    // Generar opciones de fecha (últimos 7 días)
    const dateOptions = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateString = d.toISOString().split('T')[0];
        let label = dateString;
        if (i === 0) label = `Hoy (${dateString})`;
        else if (i === 1) label = `Ayer (${dateString})`;
        return { label, value: dateString };
    });

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const logs = await getUserStepLogs();
            setHistory(logs);
        } catch (error) {
            Alert.alert('Error', 'No se pudo cargar el historial de pasos.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddSteps = async () => {
        if (!steps || isNaN(Number(steps))) {
            Alert.alert('Error', 'Ingresa una cantidad válida de pasos.');
            return;
        }

        try {
            setSaving(true);
            await saveUserSteps(Number(steps), selectedDate);
            setSteps('');
            Alert.alert('Éxito', `Pasos guardados correctamente para ${selectedDate}.`);
            await fetchHistory(); // Recargar historial
        } catch (error) {
            Alert.alert('Error', 'Ocurrió un problema al guardar los pasos.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.header}>
                <View style={styles.iconBg}>
                    <Footprints size={32} color={Colors.primary} />
                </View>
                <Text style={styles.title}>Pasos Diarios</Text>
                <Text style={styles.subtitle}>Registra tu actividad diaria manualmente</Text>
            </View>

            <View style={styles.card}>
                <Text style={styles.label}>Nuevos Pasos:</Text>
                
                <View style={styles.pickerContainer}>
                    <Picker
                        selectedValue={selectedDate}
                        onValueChange={(itemValue) => setSelectedDate(itemValue)}
                        style={styles.picker}
                    >
                        {dateOptions.map((opt) => (
                            <Picker.Item key={opt.value} label={opt.label} value={opt.value} color="#000000" />
                        ))}
                    </Picker>
                </View>

                <View style={styles.inputRow}>
                    <TextInput
                        style={styles.input}
                        placeholder="Ej: 5000"
                        placeholderTextColor={Colors.textMuted}
                        keyboardType="decimal-pad"
                        value={steps}
                        onChangeText={setSteps}
                        editable={!saving}
                    />
                    <TouchableOpacity style={[styles.addBtn, saving && { opacity: 0.7 }]} onPress={handleAddSteps} disabled={saving}>
                        {saving ? <ActivityIndicator color="#000" /> : <Plus size={24} color="#000" />}
                    </TouchableOpacity>
                </View>
            </View>

            <Text style={styles.historyTitle}>Historial Reciente</Text>
            
            {loading ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
            ) : history.length === 0 ? (
                <Text style={{ color: Colors.textMuted, textAlign: 'center', marginTop: 20 }}>No hay pasos registrados aún.</Text>
            ) : (
                history.map((item) => (
                    <TouchableOpacity 
                        key={item.id} 
                        style={styles.historyItem}
                        onPress={() => {
                            setSelectedDate(item.date);
                            setSteps(item.steps ? item.steps.toString() : '');
                            scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                        }}
                    >
                        <View>
                            <Text style={styles.historyDate}>{item.date}</Text>
                            <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 4 }}>Toca para editar</Text>
                        </View>
                        <Text style={styles.historyValue}>{item.steps?.toLocaleString()} pasos</Text>
                    </TouchableOpacity>
                ))
            )}
            
            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        padding: Spacing.lg,
    },
    header: {
        alignItems: 'center',
        marginVertical: 24,
    },
    iconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.primary + '15',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    card: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 30,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
        marginBottom: 12,
    },
    pickerContainer: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: borderRadius.md,
        marginBottom: 16,
        overflow: 'hidden',
    },
    picker: {
        color: '#000000',
        height: 50,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 12,
    },
    input: {
        flex: 1,
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: borderRadius.md,
        paddingHorizontal: 16,
        color: Colors.text,
        fontSize: 16,
    },
    addBtn: {
        backgroundColor: Colors.primary,
        width: 50,
        borderRadius: borderRadius.md,
        justifyContent: 'center',
        alignItems: 'center',
    },
    historyTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 16,
    },
    historyItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: Colors.cardBg,
        padding: 16,
        borderRadius: borderRadius.md,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    historyDate: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.text,
    },
    historyValue: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.primary,
    }
});
