# ADR-001: Multi-sucursal y multi-POS desde el día 1

## Estado

Aceptado — 2026-07-26

## Contexto

L'Scala opera hoy una tienda en Calama, pero el negocio puede crecer a varias sucursales, varios POS y varias vendedoras por tienda.

## Decisión

Modelar `organizations`, `branches`, `pos_terminals` y `user_branches` desde la primera migración. Stock y operaciones se scopan por `branch_id`. Etapa 1 se entrega con seed de una sucursal + un POS.

## Consecuencias

- Evita reescritura de schema al abrir un segundo local.
- UI etapa 1 puede ocultar selectores si hay un solo contexto.
- Transferencias entre sucursales: tipos de movimiento listos; UI completa fuera de etapa 1.
