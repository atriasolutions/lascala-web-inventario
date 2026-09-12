/**
 * Guía /ayuda: copy operativo + slots de video e imagen.
 * YouTube: pega el ID de 11 caracteres (youtube.com/watch?v=…) en HELP_YOUTUBE[slot].
 * Deja "PENDIENTE" o vacío hasta tener el video real.
 */

export const YT_PENDING = 'PENDIENTE';

export type HelpAudience = 'all' | 'owner' | 'lead';
export type HelpCalloutKind = 'tip' | 'ojo' | 'quien';
export type HelpRoleChip = 'owner' | 'lead' | 'seller';

export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'see'; items: string[] }
  | { type: 'steps'; title?: string; items: string[] }
  | { type: 'callout'; kind: HelpCalloutKind; text: string }
  | { type: 'roles'; who: HelpRoleChip[] }
  | { type: 'video'; slot: string; shoot: string }
  | { type: 'image'; slot: string; shoot: string };

export type HelpChapter = {
  id: string;
  navLabel: string;
  heading: string;
  audience: HelpAudience;
  blocks: HelpBlock[];
};

/** IDs de YouTube por slot. Cuando pegues el ID, aparece el iframe. */
export const HELP_YOUTUBE: Record<string, string> = {
  'overview.flujo': 'iuYdkK7MWTU',
  'dashboard.tablero': 'o4KaRAATZsw',
  'caja.cobrar': 'JmKGhlv7ego',
  'ingresos.recibir': 'xYx0EWB1028',
  'compras.documento': '33kIZqLtug8',
  'ventas.historial': 'Q36qK8-XIoM',
  'productos.ficha': 'T1fbZpFm7Go',
  'stock.vitrina': 'DevX1IL461g',
  'inventarios.toma': 'uc6kOHof5JE',
  'inventarios.conciliar': '67gJ_4I3-NI',
  'movimientos.lista': 'ZGDKZhjWmLs',
  'mermas.registrar': 'A9La7E3k4ZU',
  'mermas.ticket': '40Iqxp8hSmA',
  'gastos.nuevo': 'MsOo9HiiafY',
  'reportes.vistas': '2jAfo9cegHA',
  'ajustes.impresoras': '9X7eXwlPus0',
  'header.puesto': 'Iyi-t0fP1uk',
};

/** Capturas bajo `public/help/`. Si el archivo no existe, se muestra el slot con la consigna. */
export const HELP_IMAGES: Record<string, string> = {
  'overview.header': '/help/overview-header.png',
  'overview.ayuda': '/help/overview-ayuda.png',
  'dashboard.inicio': '/help/dashboard-inicio.jpg',
  'caja.pantalla': '/help/ventas-pos.jpg',
  'caja.ticket': '/help/ventas-comprobante.png',
  'ingresos.pendiente': '/help/ingresos-lista.jpg',
  'compras.lista': '/help/compras-lista.jpg',
  'ventas.filtros': '/help/historial-ventas.jpg',
  'productos.lista': '/help/productos-grid.jpg',
  'stock.lista': '/help/stock-lista.png',
  'inventarios.lista': '/help/inventarios-conteo.png',
  'inventarios.opciones': '/help/inventarios-conciliacion.png',
  'movimientos.fila': '/help/movimientos-lista.png',
  'mermas.tabs': '/help/mermas-registrar.png',
  'mermas.voucher': '/help/mermas-cambio.png',
  'gastos.form': '/help/gastos-lista.png',
  'reportes.pg': '/help/reportes-ventas.png',
  'ajustes.tabs': '/help/ajustes-impresoras.png',
  'header.campana': '/help/header-alertas.png',
};

export function isYoutubeReady(id: string | undefined): boolean {
  const t = (id || '').trim();
  if (!t || t.toUpperCase() === YT_PENDING) return false;
  return /^[\w-]{11}$/.test(t);
}

export function helpYoutubeId(slot: string): string {
  return HELP_YOUTUBE[slot] || YT_PENDING;
}

export function helpImageSrc(slot: string): string {
  return HELP_IMAGES[slot] || `/help/${slot.replace(/\./g, '-')}.png`;
}

export function audienceNote(audience: HelpAudience): string | null {
  if (audience === 'owner') return 'Visible para Administrador/a';
  if (audience === 'lead') return 'Acciones de Encargado/a o Administrador/a';
  return null;
}

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    id: 'overview',
    navLabel: 'Panorama',
    heading: 'Cómo funciona en general',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Esta guía es para el piso: cobrar, recibir mercadería y dejar el stock cuadrado. No hace falta saber de sistemas. Lo que ves y registras es siempre de la sucursal activa y, al vender, de la caja que aparece arriba.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Arriba: sucursal, caja, campana de alertas, tu nombre y el botón ?',
          'A la izquierda (computador): Ventas, Ingresos, Mermas y el resto según tu rol',
          'En el celular: barra inferior distinta si eres Administrador/a o piso (vendedor/a · encargado/a)',
          'En cada pantalla: el trabajo del día, no un título repetido (ese ya está arriba)',
        ],
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Si la sesión caduca, vuelves al login con el aviso «Tu sesión expiró. Ingresa de nuevo.» No pierdes el trabajo ya guardado en el servidor; solo tienes que entrar otra vez.',
      },
      { type: 'h', text: 'El camino de una prenda' },
      {
        type: 'steps',
        title: 'De la compra a la vitrina',
        items: [
          'Administrador/a registra el documento en Compras, con Precio costo en cada línea.',
          'En Ingresos alguien de piso confirma la recepción. Recién ahí hay stock en la sucursal activa.',
          'En Ventas pistoleas y cobras: se descuenta de esa sucursal y queda la vendedora y la caja.',
          'Si se pierde, se va a proveedor o hay un cambio, se registra en Mermas. Todo deja movimiento.',
        ],
      },
      {
        type: 'video',
        slot: 'overview.flujo',
        shoot: 'Recorrido: menú e inventario por sucursal',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'El Precio costo vive en Ingresos (en la línea del documento). No lo inventes en la ficha de Productos.',
      },
      {
        type: 'image',
        slot: 'overview.header',
        shoot: 'Foto: header con Sucursal y Caja/POS visibles; chip de usuaria con nombre y rol (sin email ni datos de más).',
      },
      {
        type: 'p',
        text: 'La pistola lee el código de la etiqueta. En un cambio, el ticket de voucher no es la boleta: es el comprobante de cambio que se imprime con la venta.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Si no tienes pistola, en Ventas usa Buscar. El código se escribe o se elige de la lista.',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Los vestidos de fiesta, por defecto, van sin cambio ni devolución. La ficha lo marca; no prometas un cambio en sala si la prenda no lo permite.',
      },
      { type: 'h', text: 'Listas, filtros y scroll' },
      {
        type: 'p',
        text: 'Las listas largas (Productos, Stock, Movimientos, Historial, Ingresos, Compras, Gastos, Mermas…) cargan de a poco al bajar. Los filtros y el orden se aplican en el servidor: lo que ves ya viene filtrado de la sucursal activa.',
      },
      {
        type: 'see',
        items: [
          'Productos: categoría, marca, stock bajo, sin foto, devolución, control de stock',
          'Stock: categoría, stock bajo, foto, con/sin control, con/sin unidades',
          'Movimientos: tipo, fechas, usuaria, producto, marca',
          'Historial de ventas: fechas y búsqueda; en el detalle ves medio de pago y descuentos',
          'Ingresos / Compras: estado, fechas y texto (chip Pendiente es el día a día)',
          'Gastos (admin): fechas y categoría',
          'Mermas: fechas, prenda, motivo, usuaria; vouchers por número, venta y estado',
          'Reportes (admin): período y, en Ventas, chips Efectivo / Tarjeta',
        ],
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Compras, Gastos, Reportes y Dashboard solo los ve Administrador/a. Encargado/a y Vendedor/a trabajan el piso (Ventas, Ingresos, Stock, etc.). Lo que aparece en el menú y en la barra del celular depende del rol.',
      },
      {
        type: 'p',
        text: 'El botón ? del header activa el modo ayuda: el cursor cambia y puedes pinchar menús o botones para leer qué hacen, sin entrar a la pantalla. Esc o otra vez el ? para salir.',
      },
      {
        type: 'image',
        slot: 'overview.ayuda',
        shoot: 'Foto: botón ? encendido (fucsia) y franja “Modo ayuda” debajo del header, sin tapar Sucursal ni Caja.',
      },
    ],
  },
  {
    id: 'dashboard',
    navLabel: 'Dashboard',
    heading: 'Dashboard',
    audience: 'owner',
    blocks: [
      {
        type: 'p',
        text: 'Es el Inicio de Administrador/a: cómo va la sucursal activa hoy y en el mes. No sirve para cobrar: el cobro es en Ventas.',
      },
      { type: 'roles', who: ['owner'] },
      {
        type: 'see',
        items: [
          'Saludo y «Hoy en» la sucursal del header',
          'Ventas del día y del mes (toda la sucursal)',
          'Atajo rápido (p. ej. Compras)',
          'Caja del mes: ventas frente a salidas (gastos y reinversión)',
          'Gastos a revisar',
          'Resumen «Números de la sucursal» (todas las cajas)',
        ],
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Vendedor/a y Encargado/a no ven este menú: entran directo a Ventas u operación de piso.',
      },
      {
        type: 'image',
        slot: 'dashboard.inicio',
        shoot: 'Foto: Inicio con saludo, ventas del día/mes, atajo Compras, ventas frente a salidas y gastos a revisar.',
      },
      {
        type: 'p',
        text: 'Arriba eliges Sucursal (y Caja/POS). Los montos del tablero son de esa sucursal: si cambias la sucursal, cambian los números. No mezcles sucursales al leer el día.',
      },
      {
        type: 'p',
        text: 'En «Ventas frente a salidas» ves ventas del mes contra gastos de operación y reinversión en mercadería (compras). El neto indica si la caja del mes va positiva o no. «Gastos a revisar» resume operación y compras; desde ahí puedes ir a registrar o ver gastos.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Las compras cuentan como reinversión en mercadería, aparte de los gastos de operación. El cobro del día a día sigue en Ventas.',
      },
      {
        type: 'video',
        slot: 'dashboard.tablero',
        shoot: 'Video 1 — recorrido del Dashboard',
      },
    ],
  },
  {
    id: 'caja',
    navLabel: 'Ventas',
    heading: 'Ventas',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Acá se cobra en sala. Cada ticket descuenta stock de la sucursal activa y queda asociado a la caja del header y a quien está en sesión.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Campo para pistolear o escribir el código de la prenda',
          'Botón Buscar si no hay pistola',
          'Lista del ticket a la derecha (o abajo en el celular) y Finalizar',
        ],
      },
      {
        type: 'image',
        slot: 'caja.pantalla',
        shoot: 'Ventas — pistoleo, carrito y descuentos',
      },
      {
        type: 'steps',
        title: 'Cobrar una prenda',
        items: [
          'Revisa que la sucursal y la caja del header sean las de este puesto.',
          'Pistolea el código de la etiqueta (o Buscar por nombre / código).',
          'Revisa talla, color y precio. Suma otra prenda si hace falta.',
          'Si hay promo: descuento por ítem en la línea y/o Desc. venta al finalizar (5–30%).',
          'Pulsa Finalizar: elige Efectivo o Tarjeta, confirma, y espera el comprobante si hay impresora.',
        ],
      },
      { type: 'h', text: 'Descuentos' },
      {
        type: 'p',
        text: 'Puedes marcar un % en cada prenda del ticket y, al finalizar, un Desc. venta de toda la venta. Se combinan: primero el de la línea y después el global. Los montos descontados se redondean a múltiplos de $500 (plata limpia en sala).',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'El descuento se ve en el comprobante y en el Historial (por línea y, si hubo, Descuento venta entre Subtotal y Total).',
      },
      { type: 'h', text: 'Medio de pago y efectivo' },
      {
        type: 'p',
        text: 'En Finalizar eliges Efectivo o Tarjeta. Con Efectivo aparece «Con cuánto paga»: mientras escribes te dice si faltan pesos o cuánto es el vuelto. Confirmar e imprimir solo se habilita cuando el monto alcanza el total (pago exacto o con vuelto).',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Con Tarjeta no pides vuelto: el bloque de efectivo se oculta. El medio de pago queda en el ticket y en el Historial.',
      },
      {
        type: 'video',
        slot: 'caja.cobrar',
        shoot: 'Video 1 — recorrido de Ventas',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'El comprobante puede traer un voucher de cambio. Ese número no es la boleta: sirve después en Mermas → Cambio.',
      },
      {
        type: 'image',
        slot: 'caja.ticket',
        shoot: 'Comprobante de venta y tickets de cambio/devolución',
      },
      {
        type: 'p',
        text: 'Sin internet puedes seguir cobrando si este equipo ya cargó el catálogo una vez. Las ventas quedan aquí y se envían al reconectar.',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Si cierras sesión con ventas pendientes, se quedan en este equipo hasta que vuelvas a entrar. No borres datos del celular/caja.',
      },
    ],
  },
  {
    id: 'ingresos',
    navLabel: 'Ingresos',
    heading: 'Ingresos',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Acá la mercadería entra a la sucursal activa. Hasta que no confirmas la recepción, esa prenda no está para vender.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Chip Pendiente: lo que aún no se receptó del todo',
          'Lista de documentos de la sucursal activa',
          'Al abrir uno: líneas para confirmar cantidades',
        ],
      },
      {
        type: 'image',
        slot: 'ingresos.pendiente',
        shoot: 'Ingresos — mercadería a stock por sucursal',
      },
      {
        type: 'steps',
        title: 'Receptar',
        items: [
          'Entra a Ingresos y deja el chip en Pendiente (es el trabajo del día).',
          'Abre el documento. Revisa prenda, talla y cantidad.',
          'Pistolea o usa Sin código de barras si la prenda no tiene etiqueta aún.',
          'Confirma lo que llegó. El Precio costo ya viene de la compra: no lo cambies “a ojo” en la ficha.',
          'Al confirmar, el stock queda en esta sucursal y aparece en Movimientos.',
        ],
      },
      {
        type: 'p',
        text: 'En Sin código de barras (o al crear ficha desde un código nuevo) eliges Marca con el mismo buscador que el proveedor: puedes reutilizar una o crear otra. Las marcas se guardan en mayúsculas.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Filtros de la lista: fechas, estado y texto. El chip Pendiente (incluye parciales) es el día a día de recepción.',
      },
      {
        type: 'video',
        slot: 'ingresos.recibir',
        shoot: 'Video 1 — Ingresos',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'El Precio costo es de la línea de ingreso, no un campo suelto de Productos. Si no cuadra el costo, se corrige en el documento, no inventando un número en el catálogo.',
      },
    ],
  },
  {
    id: 'compras',
    navLabel: 'Compras',
    heading: 'Compras',
    audience: 'owner',
    blocks: [
      {
        type: 'p',
        text: 'Solo Administrador/a. Acá nace el documento (con factura o sin doc) y el Precio costo por prenda. El piso después lo recepta en Ingresos.',
      },
      { type: 'roles', who: ['owner'] },
      {
        type: 'see',
        items: [
          'Lista de documentos de la sucursal activa',
          'Botón Nueva compra',
          'Estado: pendiente de recepción, parcial o recibido',
          'Pendiente: Editar o eliminar (ícono basura)',
        ],
      },
      {
        type: 'image',
        slot: 'compras.lista',
        shoot: 'Compras — documentos por sucursal',
      },
      {
        type: 'steps',
        title: 'Registrar una compra',
        items: [
          'Nueva compra, sucursal activa ya viene del header.',
          'Agrega líneas: prenda, cantidad y Precio costo (UND).',
          'Guarda. Aún no hay stock en vitrina.',
          'Avisa a piso que recepten en Ingresos.',
        ],
      },
      {
        type: 'video',
        slot: 'compras.documento',
        shoot: 'Video 1 — Compras',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Nueva compra no pone unidades en sala. Sin recepción confirmada, Caja no debería vender esa mercadería.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'En la lista puedes filtrar por estado y fechas (como Ingresos). El proveedor se elige o crea con el buscador de proveedores.',
      },
    ],
  },
  {
    id: 'ventas',
    navLabel: 'Historial de ventas',
    heading: 'Historial de ventas',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Acá miras lo ya cobrado en la sucursal activa. No sirve para registrar una venta nueva: eso es Ventas.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Lista de tickets (fecha, caja, vendedora, total, medio de pago)',
          'Filtros por fecha o texto',
          'Detalle: descuentos, Subtotal / Descuento venta / Total, reimpresión y vouchers',
        ],
      },
      {
        type: 'image',
        slot: 'ventas.filtros',
        shoot: 'Historial de ventas — comprobantes de la sucursal',
      },
      {
        type: 'p',
        text: 'Al abrir un ticket ves Efectivo o Tarjeta, los descuentos por prenda y, si hubo, el Descuento venta entre Subtotal y Total. Desde ahí puedes reimprimir el comprobante (y tickets de cambio si aún aplican).',
      },
      {
        type: 'p',
        text: 'Si la clienta vuelve con un cambio, el número que necesitas está en el voucher impreso con la venta, no en la boleta fiscal. Desde acá puedes reencontrar el ticket.',
      },
      {
        type: 'video',
        slot: 'ventas.historial',
        shoot: 'Video 1 — Historial de ventas',
      },
    ],
  },
  {
    id: 'productos',
    navLabel: 'Productos',
    heading: 'Productos',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'El catálogo: nombre, foto, código de la etiqueta, categoría, marca y si permite cambio. Nueva prenda crea la ficha; no carga stock ni Precio costo.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Búsqueda y hoja de filtros (categoría, marca, stock bajo, sin foto…)',
          'Nueva prenda',
          'En la ficha: foto, código, marca y si es vestido de fiesta',
        ],
      },
      {
        type: 'image',
        slot: 'productos.lista',
        shoot: 'Productos — catálogo y filtros',
      },
      { type: 'h', text: 'Marca' },
      {
        type: 'p',
        text: 'En la ficha eliges Marca con un buscador (como el de proveedor en Compras): puedes reutilizar una o crear otra. Se guardan en mayúsculas. También filtras el catálogo por marca.',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'El precio de venta lo editan Encargado/a o Administrador/a. Vendedor/a ve el precio y cobra; no lo cambia en la ficha.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'El precio sugerido ronda el doble del Precio costo (el de Ingresos). Si hay que corregirlo, lo hace quien tiene rol de Encargado/a o Administrador/a.',
      },
      {
        type: 'video',
        slot: 'productos.ficha',
        shoot: 'Video 1 — Productos',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Vestido de fiesta: la ficha suele ir sin cambio. Avísale a la clienta en sala; no improvises una excepción en Ventas.',
      },
    ],
  },
  {
    id: 'stock',
    navLabel: 'Stock',
    heading: 'Stock',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Es la vitrina de la sucursal activa: cuántas unidades hay y a cuánto suman a precio de venta. No es una toma física (eso es Inventarios).',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Unidades y valor de sala',
          'Búsqueda y filtros (categoría, stock bajo, foto, control de stock…)',
          'Enlace a Movimientos y, si tu rol lo permite, Ajustar',
        ],
      },
      {
        type: 'image',
        slot: 'stock.lista',
        shoot: 'Stock — disponibilidad de la sucursal activa',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Vendedor/a consulta y vende. Encargado/a y Administrador/a pueden ajustar cantidades: el ajuste deja movimiento con tu usuario.',
      },
      {
        type: 'video',
        slot: 'stock.vitrina',
        shoot: 'Video 1 — Stock',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Si la lista está vacía, primero tiene que haber un Ingreso confirmado a esta sucursal. Stock no “crea” mercadería.',
      },
    ],
  },
  {
    id: 'inventarios',
    navLabel: 'Inventarios',
    heading: 'Inventarios',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Toma física: cuentas lo que hay en sala y después concilias con lo que el sistema cree. Stock muestra la vitrina del sistema; Inventarios es el conteo real.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Nueva toma',
          'Lista con el número de cada toma y su estado (en curso, por conciliar, aplicada)',
          'Al abrir: pistoleo / cantidades y, al cerrar, las tres opciones de conciliación',
        ],
      },
      {
        type: 'image',
        slot: 'inventarios.lista',
        shoot: 'Inventarios — conteo en curso',
      },
      {
        type: 'steps',
        title: 'Hacer una toma',
        items: [
          'Nueva toma en la sucursal activa.',
          'Pistolea o carga lo que hay en vitrina.',
          'Cierra el conteo. Pasa a conciliar las diferencias.',
          'Encargado/a o Administrador/a aplica (o anula si se equivocaron de toma).',
        ],
      },
      {
        type: 'video',
        slot: 'inventarios.toma',
        shoot: 'Video 1 — Inventarios (conteo)',
      },
      { type: 'h', text: 'Si no cuadra' },
      {
        type: 'p',
        text: 'En cada diferencia eliges una de tres: Conservar inventario (te quedas con lo contado), Conservar stock anterior (no cambias el sistema) o Ajustar cantidad (escribes las unidades finales).',
      },
      {
        type: 'image',
        slot: 'inventarios.opciones',
        shoot: 'Inventarios — conciliar diferencias',
      },
      {
        type: 'video',
        slot: 'inventarios.conciliar',
        shoot: 'Video 2 — Inventarios (conciliación)',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Contar puede cualquiera de piso. Aplicar o anular la toma: Encargado/a o Administrador/a.',
      },
    ],
  },
  {
    id: 'movimientos',
    navLabel: 'Movimientos',
    heading: 'Movimientos',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'La bitácora de la sucursal activa: quién, cuándo y cómo cambió el stock. Las filas aparecen solas cuando operas en Ventas, Ingresos, Mermas o un ajuste.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Filtros: tipo, fechas, usuaria, producto y marca',
          'Cada fila: prenda, marca si hay, cantidad, quién y hora',
          'Si no hay nada: un atajo a Stock (vitrina), no a una toma física',
        ],
      },
      {
        type: 'image',
        slot: 'movimientos.fila',
        shoot: 'Movimientos — entradas y salidas de la sucursal',
      },
      {
        type: 'video',
        slot: 'movimientos.lista',
        shoot: 'Video 1 — Movimientos',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'No se “carga” un movimiento a mano como en una planilla. Si falta una fila, falta la operación de origen (venta, ingreso, merma o ajuste). La marca se filtra igual que en Productos.',
      },
    ],
  },
  {
    id: 'mermas',
    navLabel: 'Mermas y cambios',
    heading: 'Mermas y cambios',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Dos trabajos en la misma pantalla: dar de baja una prenda (Merma) y atender un cambio (ticket de voucher). No uses esta pantalla para cobrar una venta nueva.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Pestaña Merma y pestaña Cambio / devolución',
          'Registrar merma o Atender ticket',
          'Historial con scroll, como el resto de listas de piso',
        ],
      },
      { type: 'h', text: 'Merma' },
      {
        type: 'steps',
        title: 'Dar de baja',
        items: [
          'Registrar merma. Pistolea el código de la prenda (la foto sale al confirmarla, no antes).',
          'Elige Pérdida (no vuelve a sala) o Devolver al proveedor.',
          'Confirma. Baja stock y queda trazabilidad.',
        ],
      },
      {
        type: 'image',
        slot: 'mermas.tabs',
        shoot: 'Mermas — registrar merma',
      },
      {
        type: 'video',
        slot: 'mermas.registrar',
        shoot: 'Video 1 — Mermas y cambios',
      },
      { type: 'h', text: 'Cambio: voucher, no boleta' },
      {
        type: 'p',
        text: 'El ticket de cambio es el voucher que salió con la venta (un voucher por prenda). No es el folio de la boleta. Atender ticket pide ese número.',
      },
      {
        type: 'image',
        slot: 'mermas.voucher',
        shoot: 'Mermas — atender ticket de cambio/devolución',
      },
      {
        type: 'steps',
        title: 'Atender un cambio',
        items: [
          'Atender ticket e ingresa el número del voucher (el del comprobante de cambio).',
          'Revisa la prenda original y cuántas unidades quedan del ticket.',
          'Elige Cambio (prenda nueva al mismo precio, incluso 1:1) o Devolución en efectivo.',
          'Si hay varias unidades, puedes atender solo una parte (cantidad parcial).',
          'Destino de la prenda que vuelve: vitrina, pérdida o proveedor.',
          'Si es cambio, pistolea la prenda que se lleva la clienta.',
        ],
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Cambio 1:1: misma referencia u otra talla al mismo precio de venta. Devolución en efectivo deja un gasto automático en categoría Devoluciones (aparece en Gastos / Reportes).',
      },
      {
        type: 'video',
        slot: 'mermas.ticket',
        shoot: 'Video 2 — Mermas y cambios',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Vestidos de fiesta: por defecto sin cambio. Si la ficha no permite cambio, no forces el flujo: explícalo en sala.',
      },
    ],
  },
  {
    id: 'gastos',
    navLabel: 'Gastos',
    heading: 'Gastos',
    audience: 'owner',
    blocks: [
      {
        type: 'p',
        text: 'Solo Administrador/a. Arriendo, sueldos, servicios u otros de la sucursal activa. No mueve stock; sí entra a Reportes.',
      },
      { type: 'roles', who: ['owner'] },
      {
        type: 'see',
        items: ['Nuevo gasto', 'Lista y totales con filtros de fecha/categoría', 'Categoría, monto y fecha'],
      },
      {
        type: 'p',
        text: 'Las devoluciones en efectivo desde Mermas también crean un gasto en categoría Devoluciones: no lo registres dos veces a mano.',
      },
      {
        type: 'image',
        slot: 'gastos.form',
        shoot: 'Gastos — operativos de la sucursal',
      },
      {
        type: 'video',
        slot: 'gastos.nuevo',
        shoot: 'Video 1 — Gastos',
      },
    ],
  },
  {
    id: 'reportes',
    navLabel: 'Reportes',
    heading: 'Reportes',
    audience: 'owner',
    blocks: [
      {
        type: 'p',
        text: 'Solo Administrador/a. Control de la sucursal activa por período (fechas de Chile). Cada pestaña es una vista; Descargar Excel exporta esa vista y el rango.',
      },
      { type: 'roles', who: ['owner'] },
      {
        type: 'see',
        items: [
          'Pestañas: Ventas, Stock, Ingresos, Gastos, Mermas, Pérdida/Ganancia',
          'Chips de período (este mes, este año, mes, año, rango)',
          'En Ventas: chips Efectivo / Tarjeta (además del período)',
          'Descargar Excel',
        ],
      },
      {
        type: 'p',
        text: 'Pérdida/Ganancia no es el estado de resultados de la tienda: es el resultado de cada toma aplicada (faltante, sobrante y neto a precio de venta). Elige la toma por su número, no por un nombre de archivo.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'El filtro Efectivo / Tarjeta aplica a la vista Ventas del reporte (y al Excel de esa vista). El resto de pestañas usa el período y la sucursal activa.',
      },
      {
        type: 'image',
        slot: 'reportes.pg',
        shoot: 'Reportes — ventas del período',
      },
      {
        type: 'video',
        slot: 'reportes.vistas',
        shoot: 'Video 1 — Reportes',
      },
    ],
  },
  {
    id: 'ajustes',
    navLabel: 'Ajustes',
    heading: 'Ajustes',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'Impresoras las ve quien entra a Ajustes (todos los roles). Usuarios, sucursales y cajas: solo Administrador/a.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Impresoras de este computador (etiquetas y comprobantes)',
          'Si eres Administrador/a: pestañas Usuarios, Sucursales y Cajas',
        ],
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Deja el programa de impresión (Atria Print Agent) abierto en este computador. Etiquetas 50×25 y comprobantes 80 mm: no elijas la misma impresora para las dos.',
      },
      {
        type: 'image',
        slot: 'ajustes.tabs',
        shoot: 'Ajustes — impresoras USB de este computador',
      },
      {
        type: 'video',
        slot: 'ajustes.impresoras',
        shoot: 'Video 1 — Ajustes',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Crear usuarios, asignar rol (Administrador/a, Encargado/a, Vendedor/a) y qué cajas puede usar: solo Administrador/a.',
      },
    ],
  },
  {
    id: 'header',
    navLabel: 'Header',
    heading: 'Header (sucursal, caja y usuario)',
    audience: 'all',
    blocks: [
      {
        type: 'p',
        text: 'La barra de arriba es el puesto de trabajo. Si la sucursal o la caja están mal, el stock y las ventas quedan en el lugar equivocado.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Sucursal y caja',
          'Campana de alertas',
          'Tu nombre (Mi cuenta / Cerrar sesión) y el botón ?',
        ],
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Administrador/a puede cambiar sucursal y caja (solo las asignadas). Encargado/a y Vendedor/a ven la sucursal fija y eligen caja.',
      },
      {
        type: 'image',
        slot: 'header.campana',
        shoot: 'Header — alertas de la tienda',
      },
      {
        type: 'video',
        slot: 'header.puesto',
        shoot: 'Video 1 — Header',
      },
      {
        type: 'p',
        text: 'Mi cuenta: tu nombre y contraseña. El rol no se cambia desde ahí. El ? es el modo ayuda: pincha controles para leer qué hacen; Esc para salir.',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Administrador/a puede activar alertas push en este dispositivo (banner o Ajustes → Alertas) para recibir avisos aunque no tenga la app abierta. Encargado/a y Vendedor/a usan la campana dentro de la sesión.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Antes de la primera venta del turno, mira sucursal y caja. Un clic aquí evita cuadrar mal el cierre. Si ves el aviso de sesión expirada, vuelve a ingresar.',
      },
    ],
  },
];

export function helpChapterById(id: string | undefined): HelpChapter {
  return HELP_CHAPTERS.find((c) => c.id === id) || HELP_CHAPTERS[0];
}

export function isHelpChapterId(id: string | undefined): boolean {
  return Boolean(id && HELP_CHAPTERS.some((c) => c.id === id));
}
