export const CHART_COLORS = ['#E6007E', '#FF2D8A', '#B80065', '#D97AA8', '#7A1F49', '#F2A6C6'];

export function chartColor(index: number) {
  return CHART_COLORS[index % CHART_COLORS.length];
}
