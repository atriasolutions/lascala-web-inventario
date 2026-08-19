/** Paleta de series: fucsia de marca + acentos distinguibles (no todo rosa). */
export const CHART_COLORS = [
  '#E6007E',
  '#2A1A22',
  '#C9A227',
  '#1F7A4C',
  '#3D5A80',
  '#B00040',
  '#E07A3D',
  '#6B4C9A',
  '#0B6E99',
  '#5C7A6E',
];

export function chartColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}
