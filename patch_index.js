const fs = require('fs');
let f = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');

// Imports
f = f.replace(/import \{ borderRadius, Spacing, Typography \} from '@\/constants\/theme';/, "import { Colors, Fonts, borderRadius, Spacing, Typography } from '@/constants/theme';");

// Surface & Colors 
f = f.replace(/backgroundColor:\s*['"]#0F172A['"]/g, 'backgroundColor: Colors.surface');
f = f.replace(/backgroundColor:\s*['"]#1E293B['"]/g, 'backgroundColor: Colors.surface_container_low');
f = f.replace(/backgroundColor:\s*['"]#0[B|a][1|0][1|0][2|a]0['"]/gi, 'backgroundColor: Colors.background');
f = f.replace(/color:\s*['"]#[Ff]{3,6}['"]/g, 'color: Colors.text');
f = f.replace(/color:\s*['"]#[A|9][1|4][A|A][1|3][A|B][A|8]['"]/gi, 'color: Colors.textMuted');
f = f.replace(/color:\s*['"]#2BB0FF['"]/gi, 'color: Colors.primary');
f = f.replace(/backgroundColor:\s*['"]rgba\(43, 176, 255, 0\.[1-2]\)['"]/g, 'backgroundColor: Colors.primary_container');

// No border rule
f = f.replace(/borderWidth:\s*1/g, 'borderWidth: 0');
f = f.replace(/borderBottomWidth:\s*1/g, 'borderBottomWidth: 0');
f = f.replace(/borderColor:\s*['"][^'"]+['"]/g, 'borderColor: Colors.surface_lowest'); // safely nullify

// Fonts logic
// We avoid replacing every single fontSize so we don't break logic, but we inject fontFamily for big titles
f = f.replace(/fontSize:\s*(2[0-9]|3[0-9])/g, 'fontFamily: Fonts.display, fontSize: $1');
f = f.replace(/fontSize:\s*(1[4-9])/g, 'fontFamily: Fonts.headline, fontSize: $1');
f = f.replace(/fontSize:\s*(1[0-3])/g, 'fontFamily: Fonts.body, fontSize: $1');

// Spanish Vocabulary
f = f.replace(/>Tu Progreso</g, '>Rendimiento<');
f = f.replace(/>Performance</g, '>Rendimiento<');
f = f.replace(/>Start</g, '>Comenzar<');

fs.writeFileSync('app/(tabs)/index.tsx', f);
console.log('index.tsx patched successfully.');
