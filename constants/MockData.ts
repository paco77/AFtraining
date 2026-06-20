// Exercises are now in ExerciseData.ts

export const MOCK_HISTORY = [
    { id: '1', date: '2026-02-14', duration: '45 min', name: 'Rutina Empuje A', month: 'Febrero' },
    { id: '2', date: '2026-02-12', duration: '60 min', name: 'Rutina Pierna B', month: 'Febrero' },
    { id: '3', date: '2026-01-28', duration: '50 min', name: 'Rutina Torso C', month: 'Enero' },
    { id: '4', date: '2026-01-25', duration: '55 min', name: 'Full Body', month: 'Enero' },
];

export const MOCK_WORKOUT = {
    name: 'Sesión de Hoy',
    exercises: [
        { id: '1', name: 'Press de Banca', sets: 4, reps: 10, weight: '60kg' },
        { id: '2', name: 'Aperturas', sets: 3, reps: 12, weight: '15kg' },
        { id: '3', name: 'Press Francés', sets: 3, reps: 10, weight: '25kg' },
    ]
};
