/** Textos cortos del modo inspector (?). Keys = `data-help`. */

export const HELP_TIPS: Record<string, string> = {
  'nav.dashboard':
    'Resumen del día y del mes de la sucursal activa: ventas, alertas y atajos. Solo lo ve Administrador/a.',
  'nav.caja':
    'Ventas: pistolea o busca la prenda, cobra y deja el movimiento en esta sucursal y esta caja.',
  'nav.ingresos':
    'Recepción a piso: confirma mercadería de una compra. Recién ahí entra al stock de la sucursal.',
  'nav.compras':
    'Documentos de compra (factura o sin doc) con Precio costo en cada línea. Solo Administrador/a.',
  'nav.ventas':
    'Historial de tickets cobrados en la sucursal activa. No sirve para registrar una venta nueva: eso es Ventas.',
  'nav.productos':
    'Catálogo: ficha, foto, código LS… y tipología. El Precio costo no se inventa acá; vive en Ingresos.',
  'nav.stock':
    'Stock de vitrina de la sucursal activa: cuántas unidades hay y a cuánto suman a precio de venta.',
  'nav.inventarios':
    'Toma física: cuentas lo que hay en sala y después concilias con el sistema. No es lo mismo que Stock.',
  'nav.movimientos':
    'Trazabilidad: cada venta, ingreso, merma o ajuste deja quién, cuándo y cómo cambió el stock.',
  'nav.mermas':
    'Bajas (pérdida o proveedor) y tickets de cambio VC…. Vestidos de fiesta suelen ir sin cambio.',
  'nav.gastos':
    'Gastos de la sucursal (arriendo, sueldos, servicios). No mueve stock. Solo Administrador/a.',
  'nav.reportes':
    'Vistas de control y Excel: ventas, stock, ingresos, gastos, mermas y Pérdida/Ganancia de tomas.',
  'nav.ajustes':
    'Impresoras de este computador (Atria Print Agent). Administrador/a también gestiona usuarios, sucursales y cajas.',
  'nav.ayuda':
    'Guía de la app: cómo funciona el piso y cada módulo, con espacio para videos e imágenes.',
  'nav.mas':
    'Más pantallas (Productos, Inventarios, Movimientos…) y tu cuenta en el celular.',
  'header.sucursal':
    'Sucursal activa: stock, ventas e ingresos se ven y se registran acá. Administrador/a puede cambiarla.',
  'header.caja':
    'Caja / POS de esta sucursal. Las ventas quedan asociadas a esta caja y a quien está cobrando.',
  'header.campana':
    'Alertas de la tienda: stock bajo, poca rotación o tickets de cambio pendientes.',
  'header.usuaria':
    'Tu nombre y rol (Administrador/a, Encargado/a o Vendedor/a). Desde acá abres Mi cuenta o sales.',
  'header.ayudaModo':
    'Activa el modo ayuda: el cursor cambia y puedes pinchar menús o botones para ver qué hacen.',
  'cta.caja.finalizar':
    'Cierra la venta: descuenta stock, imprime el comprobante si hay impresora y deja el ticket. Sin red, se guarda en este equipo.',
  'cta.caja.buscar':
    'Si no tienes pistola, busca por nombre o código y suma la prenda al ticket.',
  'cta.stock.movimientos':
    'Abre el historial de movimientos de la sucursal para ver de dónde salió o entró cada unidad.',
  'cta.stock.ajustar':
    'Ajuste de unidades en esta sucursal. Encargado/a o Administrador/a: deja movimiento auditable.',
  'cta.inventarios.nueva':
    'Empieza una toma INV…: pistoleas o cargas cantidades y después cierras para conciliar.',
  'cta.inventarios.aplicar':
    'Aplica la conciliación: Conservar inventario, Conservar stock anterior o Ajustar cantidad.',
  'cta.mermas.registrar':
    'Da de baja una prenda (Pérdida o Devolver al proveedor). Baja stock y deja trazabilidad.',
  'cta.mermas.ticket':
    'Atiende un voucher VC… de cambio o devolución: elige vitrina, pérdida o proveedor.',
  'cta.ingresos.pendiente':
    'Lista solo compras aún no receptadas del todo. Al confirmar líneas, el stock entra a esta sucursal.',
  'cta.ingresos.filtros':
    'Filtra por fechas, estado o texto. El chip Pendiente es el día a día de recepción.',
  'cta.productos.nueva':
    'Crea la ficha (nombre, foto, código). El costo real se carga al ingresar mercadería.',
  'cta.compras.nueva':
    'Registra el documento de compra con Precio costo por línea. Después se recepta en Ingresos.',
  'cta.gastos.nuevo':
    'Anota un gasto operativo de la sucursal. No toca el inventario.',
  'cta.dashboard.ventas':
    'Atajo a Ventas para cobrar. El resumen de ventas del día está arriba, de esta sucursal.',
  'cta.reportes.excel':
    'Descarga la vista actual (período y sucursal activa) en Excel.',
};

export function helpTipFor(key: string): string {
  return HELP_TIPS[key] || 'Este control forma parte de la operación; no hay texto extra todavía.';
}
