/** Grupos de variantes de piso (ordenados como cubo 3x3 para el flyout). */
export interface PisoGroup {
  name: string;
  variants: number[];
  /** auto-borde: 'cube' 3x3 por vecinos, 'row' tapas horizontales (1/izq,3/der),
   * 'pair' alterna por x, 'off' manual. */
  auto: 'cube' | 'row' | 'pair' | 'off';
}

export const PISO_GROUPS: PisoGroup[] = [
  { name: 'Piso', variants: [2, 1, 3, 9, 0, 40, 6, 61, 7], auto: 'cube' },
  { name: 'Ladrillos', variants: [116, 118], auto: 'pair' },
  { name: 'Piso Naranja', variants: [104, 105, 106, 126, 127, 128, 148, 149, 150], auto: 'cube' },
  { name: 'Piso Rojo', variants: [192, 193, 194, 214, 215, 216, 236, 237, 238], auto: 'cube' },
  { name: 'Plat. Roja', variants: [22, 23, 24], auto: 'row' },
  { name: 'Plat. Metal', variants: [110, 111, 112], auto: 'row' },
  { name: 'Plat. Naranja', variants: [198, 199, 200], auto: 'row' },
  { name: 'Plat. fina', variants: [49, 50, 51], auto: 'row' },
  { name: 'Plat. Cadena', variants: [71, 72, 73], auto: 'row' },
  { name: 'Agua', variants: [186, 187, 188, 208, 209, 210, 230, 231, 232], auto: 'cube' },
  { name: 'Cueva', variants: [10, 11, 12, 32, 33, 34, 54, 55, 56], auto: 'cube' },
  { name: 'Madera', variants: [98, 99, 100, 120, 121, 122, 142, 143, 144], auto: 'cube' },
  { name: 'Otros', variants: [132, 220, 225], auto: 'off' },
];
