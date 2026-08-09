# Checklist QA — alcance ATR-DIAG-001 §7.2

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Registro de productos | OK | `/productos` + API |
| Ingreso de mercadería | OK | compras + recepción |
| Control de inventario | OK | balances por sucursal |
| Registro de ventas | OK | POS táctil |
| Actualización automática stock | OK | movimientos |
| Historial de movimientos | OK | `/inventario` |
| Control de usuarios | OK | `/admin` |
| Registro de mermas | OK | `/mermas` |
| Voucher de cambio | OK | se genera en venta si `allows_exchange` |
| Comprobante de venta (no tributario) | OK | `receipt_number` |
| Dashboard / indicadores | OK | ventas día/mes, rotación, alertas |
| Alertas stock bajo / sin movimiento | OK | `/api/inventory/alerts` |
| Códigos internos | OK | `LS-######` |
| Lector código de barras | OK | input POS (hardware simulado) |
| Multi-sucursal / multi-POS | OK | modelo + selectores |
| Impresión etiquetas física | Pendiente HW | vista imprimible etapa 1.1 |

## Usabilidad piso de venta

- [ ] Login brand-first con logo
- [ ] Botones ≥ 44px
- [ ] Flujo vender en ≤ 4 pasos
- [ ] Bandeja pendientes de foto usable en móvil
