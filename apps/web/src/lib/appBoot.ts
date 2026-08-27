/**
 * Detecta cold start del JS (cerrar app / reopen PWA).
 * Se resetea al matar el proceso; sobrevive a navegación SPA dentro de la misma sesión.
 */
let coldBoot = true;

export function isColdBoot() {
  return coldBoot;
}

/** Llamar tras el primer paint autenticado (AppShell). */
export function endColdBoot() {
  coldBoot = false;
}
