/** Grupos de variantes de piso (ordenados como cubo 3x3 para el flyout). */
export interface PisoGroup { name: string; variants: number[]; }

export const PISO_GROUPS: PisoGroup[] = [
  { name: 'Piso', variants: [2, 1, 3, 9, 0, 40, 6, 61, 7] },
  { name: 'Ladrillos', variants: [116, 118] },
  { name: 'Piso Naranja', variants: [104, 105, 106, 126, 127, 128, 148, 149, 150] },
  { name: 'Piso Rojo', variants: [192, 193, 194, 214, 215, 216, 236, 237, 238] },
  { name: 'Plat. Roja', variants: [22, 23, 24] },
  { name: 'Plat. Metal', variants: [110, 111, 112] },
  { name: 'Plat. Naranja', variants: [198, 199, 200] },
  { name: 'Plat. fina', variants: [49, 50, 51] },
  { name: 'Plat. Cadena', variants: [71, 72, 73] },
  { name: 'Agua', variants: [186, 187, 188, 208, 209, 210, 230, 231, 232] },
  { name: 'Cueva', variants: [10, 11, 12, 32, 33, 34, 54, 55, 56] },
  { name: 'Madera', variants: [98, 99, 100, 120, 121, 122, 142, 143, 144] },
  { name: 'Otros', variants: [132, 220, 225] },
];
