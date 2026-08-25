import { createContext, useContext } from 'react';

/**
 * Títulos de shell por ruta (alineados con labels de AppShell).
 * Páginas de detalle pueden sobrescribir con useShellTitle().
 */
export const SHELL_TITLES = {
  vender: 'Ventas',
  ventas: 'Historial de ventas',
} as const;

/** Permite a páginas de detalle sobrescribir el h1 del shell (ej. Editar compra). */
export const ShellTitleContext = createContext<(title: string | null) => void>(() => {});

export function useShellTitle() {
  return useContext(ShellTitleContext);
}
