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
  'overview.flujo': YT_PENDING,
  'overview.pwa': YT_PENDING,
  'dashboard.tablero': YT_PENDING,
  'caja.cobrar': YT_PENDING,
  'caja.offline': YT_PENDING,
  'ingresos.recibir': YT_PENDING,
  'compras.documento': YT_PENDING,
  'ventas.historial': YT_PENDING,
  'productos.ficha': YT_PENDING,
  'stock.vitrina': YT_PENDING,
  'inventarios.toma': YT_PENDING,
  'inventarios.conciliar': YT_PENDING,
  'movimientos.lista': YT_PENDING,
  'mermas.registrar': YT_PENDING,
  'mermas.ticket': YT_PENDING,
  'gastos.nuevo': YT_PENDING,
  'reportes.vistas': YT_PENDING,
  'ajustes.impresoras': YT_PENDING,
  'header.puesto': YT_PENDING,
};

/** Capturas bajo `public/help/`. Si el archivo no existe, se muestra el slot con la consigna. */
export const HELP_IMAGES: Record<string, string> = {
  'overview.header': '/help/overview-header.png',
  'overview.ayuda': '/help/overview-ayuda.png',
  'dashboard.atajos': '/help/dashboard-atajos.png',
  'caja.pantalla': '/help/caja-pantalla.png',
  'caja.ticket': '/help/caja-ticket.png',
  'ingresos.pendiente': '/help/ingresos-pendiente.png',
  'compras.lista': '/help/compras-lista.png',
  'ventas.filtros': '/help/ventas-filtros.png',
  'productos.lista': '/help/productos-lista.png',
  'stock.lista': '/help/stock-lista.png',
  'inventarios.lista': '/help/inventarios-lista.png',
  'inventarios.opciones': '/help/inventarios-opciones.png',
  'movimientos.fila': '/help/movimientos-fila.png',
  'mermas.tabs': '/help/mermas-tabs.png',
  'mermas.voucher': '/help/mermas-voucher.png',
  'gastos.form': '/help/gastos-form.png',
  'reportes.pg': '/help/reportes-pg.png',
  'ajustes.tabs': '/help/ajustes-tabs.png',
  'header.campana': '/help/header-campana.png',
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
          'A la izquierda: Ventas, Ingresos, Mermas y el resto según tu rol',
          'En cada pantalla: el trabajo del día, no un título repetido (ese ya está arriba)',
        ],
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
        shoot: 'Video: mostrar el menú (Ingresos → Stock → Ventas) y decir en voz alta que el stock es de la sucursal activa.',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'El Precio costo vive en Ingresos (en la línea del documento). No lo inventes en la ficha de Productos.',
      },
      {
        type: 'image',
        slot: 'overview.header',
        shoot: 'Foto: el header completo, con sucursal y caja visibles, sin datos personales de más.',
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
      {
        type: 'p',
        text: 'Si instalas la app en el celular de caja (PWA), puedes cobrar un rato sin red: la venta queda en este equipo y se envía al reconectar. El resto de módulos pide conexión.',
      },
      {
        type: 'video',
        slot: 'overview.pwa',
        shoot: 'Video: banner de sin conexión en Caja, armar un ticket corto y Finalizar (venta queda pendiente en el equipo).',
      },
      {
        type: 'p',
        text: 'El botón ? del header activa el modo ayuda: el cursor cambia y puedes pinchar menús o botones para leer qué hacen, sin entrar a la pantalla. Esc o otra vez el ? para salir.',
      },
      {
        type: 'image',
        slot: 'overview.ayuda',
        shoot: 'Foto: el botón ? del header encendido y el aviso “Modo ayuda” debajo del header, sin tapar sucursal ni caja.',
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
        text: 'Es el tablero del día para Administrador/a: cómo va la sucursal activa, no para cobrar. El cobro es en Ventas.',
      },
      { type: 'roles', who: ['owner'] },
      {
        type: 'see',
        items: [
          'Ventas del día y del mes de la sucursal activa',
          'Atajos a Ventas, Ingresos, Gastos y Compras',
          'Alertas que conviene mirar (stock bajo, poca rotación, vouchers)',
        ],
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Vendedor/a y Encargado/a no ven este menú: entran directo a Ventas u operación de piso.',
      },
      {
        type: 'image',
        slot: 'dashboard.atajos',
        shoot: 'Foto: la franja de atajos (Ventas / Ingresos / Gastos / Compras) con los recuadros de ventas del día y del mes.',
      },
      {
        type: 'p',
        text: 'Si cambias la sucursal arriba, el tablero cambia con ella. No mezcles sucursales al leer números.',
      },
      {
        type: 'video',
        slot: 'dashboard.tablero',
        shoot: 'Video: abrir Dashboard, cambiar sucursal en el header y mostrar que los montos del día se actualizan.',
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
        shoot: 'Foto: Ventas con una o dos prendas en el ticket, sucursal y caja visibles arriba. Sin montos inventados de más: una venta de ejemplo anónima.',
      },
      {
        type: 'steps',
        title: 'Cobrar una prenda',
        items: [
          'Revisa que la sucursal y la caja del header sean las de este puesto.',
          'Pistolea el código de la etiqueta (o Buscar por nombre / código).',
          'Revisa talla, color y precio. Suma otra prenda si hace falta.',
          'Pulsa Finalizar, confirma, y espera el comprobante si hay impresora.',
        ],
      },
      {
        type: 'video',
        slot: 'caja.cobrar',
        shoot: 'Video: pistolear una prenda en Caja hasta Finalizar (incluido el confirm). No hace falta mostrar datos de cliente.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'El comprobante puede traer un voucher de cambio. Ese número no es la boleta: sirve después en Mermas → Cambio.',
      },
      {
        type: 'image',
        slot: 'caja.ticket',
        shoot: 'Foto: comprobante impreso o vista de impresión, señalando el número de voucher de cambio (no el folio de boleta).',
      },
      {
        type: 'p',
        text: 'Sin internet puedes seguir cobrando si este equipo ya cargó el catálogo una vez. Las ventas quedan aquí y se envían al reconectar.',
      },
      {
        type: 'video',
        slot: 'caja.offline',
        shoot: 'Video: Caja con aviso de sin conexión, Finalizar, y el mensaje de venta guardada en el equipo.',
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
        shoot: 'Foto: lista de Ingresos con el chip Pendiente activo y al menos un documento por recibir.',
      },
      {
        type: 'steps',
        title: 'Receptar',
        items: [
          'Entra a Ingresos y deja el chip en Pendiente (es el trabajo del día).',
          'Abre el documento. Revisa prenda, talla y cantidad.',
          'Confirma lo que llegó. El Precio costo ya viene de la compra: no lo cambies “a ojo” en la ficha.',
          'Al confirmar, el stock queda en esta sucursal y aparece en Movimientos.',
        ],
      },
      {
        type: 'video',
        slot: 'ingresos.recibir',
        shoot: 'Video: abrir un ingreso pendiente, confirmar una línea y volver a la lista (el documento avanza de estado).',
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
        ],
      },
      {
        type: 'image',
        slot: 'compras.lista',
        shoot: 'Foto: listado de Compras con Nueva compra visible y un documento en estado pendiente.',
      },
      {
        type: 'steps',
        title: 'Registrar una compra',
        items: [
          'Nueva compra, sucursal activa ya viene del header.',
          'Agrega líneas: prenda, cantidad y Precio costo.',
          'Guarda. Aún no hay stock en vitrina.',
          'Avisa a piso que recepten en Ingresos.',
        ],
      },
      {
        type: 'video',
        slot: 'compras.documento',
        shoot: 'Video: Nueva compra, una línea con Precio costo, guardar, y decir que falta Ingresos para que entre a stock.',
      },
      {
        type: 'callout',
        kind: 'ojo',
        text: 'Nueva compra no pone unidades en sala. Sin recepción confirmada, Caja no debería vender esa mercadería.',
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
          'Lista de tickets (fecha, caja, vendedora, total)',
          'Filtros por fecha o texto',
          'Detalle para reimprimir o ubicar un voucher de cambio',
        ],
      },
      {
        type: 'image',
        slot: 'ventas.filtros',
        shoot: 'Foto: Historial de ventas con filtros y unas pocas filas. Recorta nombres si no aportan.',
      },
      {
        type: 'p',
        text: 'Si la clienta vuelve con un cambio, el número que necesitas está en el voucher impreso con la venta, no en la boleta fiscal. Desde acá puedes reencontrar el ticket.',
      },
      {
        type: 'video',
        slot: 'ventas.historial',
        shoot: 'Video: abrir un ticket del historial y señalar dónde aparece el voucher de cambio (si la venta lo trajo).',
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
        text: 'El catálogo: nombre, foto, código de la etiqueta, categoría y si permite cambio. Nueva prenda crea la ficha; no carga stock ni Precio costo.',
      },
      { type: 'roles', who: ['owner', 'lead', 'seller'] },
      {
        type: 'see',
        items: [
          'Búsqueda y filtros',
          'Nueva prenda',
          'En la ficha: foto, código y si es vestido de fiesta',
        ],
      },
      {
        type: 'image',
        slot: 'productos.lista',
        shoot: 'Foto: listado de Productos con Nueva prenda y una ficha abierta (sin precios de costo a la vista si no aplica).',
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
        shoot: 'Video: abrir una ficha y mostrar que el campo de precio de venta está bloqueado (sesión vendedora) o editable (encargada).',
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
          'Búsqueda, stock bajo',
          'Enlace a Movimientos y, si tu rol lo permite, Ajustar',
        ],
      },
      {
        type: 'image',
        slot: 'stock.lista',
        shoot: 'Foto: Stock con el nombre de la sucursal activa en el intro, KPIs de unidades/valor y la lista.',
      },
      {
        type: 'callout',
        kind: 'quien',
        text: 'Vendedor/a consulta y vende. Encargado/a y Administrador/a pueden ajustar cantidades: el ajuste deja movimiento con tu usuario.',
      },
      {
        type: 'video',
        slot: 'stock.vitrina',
        shoot: 'Video: buscar una prenda en Stock y abrir Movimientos (sin inventar un ajuste si no toca).',
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
        shoot: 'Foto: listado de Inventarios con Nueva toma y una toma en curso o por conciliar (se ve el número de la toma, no un folio de demo).',
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
        shoot: 'Video: Nueva toma, pistolear dos prendas y mostrar el conteo. No hace falta aplicar si no quieren mover stock de demo.',
      },
      { type: 'h', text: 'Si no cuadra' },
      {
        type: 'p',
        text: 'En cada diferencia eliges una de tres: Conservar inventario (te quedas con lo contado), Conservar stock anterior (no cambias el sistema) o Ajustar cantidad (escribes las unidades finales).',
      },
      {
        type: 'image',
        slot: 'inventarios.opciones',
        shoot: 'Foto: detalle de una toma en conciliación, con las tres opciones visibles en una línea que no cuadra.',
      },
      {
        type: 'video',
        slot: 'inventarios.conciliar',
        shoot: 'Video: señalar las tres opciones y el botón Aplicar conciliación (sin aplicarlo si no corresponde).',
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
          'Filtros por fecha y tipo',
          'Cada fila: prenda, cantidad, quién y hora',
          'Si no hay nada: un atajo a Stock (vitrina), no a una toma física',
        ],
      },
      {
        type: 'image',
        slot: 'movimientos.fila',
        shoot: 'Foto: lista de Movimientos con unas filas de venta e ingreso. Recorta si sale un nombre que no haga falta.',
      },
      {
        type: 'video',
        slot: 'movimientos.lista',
        shoot: 'Video: filtrar por un tipo (por ejemplo venta) y abrir o señalar una fila.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'No se “carga” un movimiento a mano como en una planilla. Si falta una fila, falta la operación de origen (venta, ingreso, merma o ajuste).',
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
      {
        type: 'image',
        slot: 'mermas.tabs',
        shoot: 'Foto: Mermas con las dos pestañas y el botón Registrar merma o Atender ticket.',
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
        type: 'video',
        slot: 'mermas.registrar',
        shoot: 'Video: Registrar merma, pistolear, elegir Pérdida y llegar al confirm (puedes cancelar al final).',
      },
      { type: 'h', text: 'Cambio: voucher, no boleta' },
      {
        type: 'p',
        text: 'El ticket de cambio es el voucher que salió con la venta (un voucher por prenda). No es el folio de la boleta. Atender ticket pide ese número.',
      },
      {
        type: 'image',
        slot: 'mermas.voucher',
        shoot: 'Foto: modal Atender ticket con el campo del número de voucher, o un comprobante donde se ve el voucher (no la boleta).',
      },
      {
        type: 'steps',
        title: 'Atender un cambio',
        items: [
          'Atender ticket e ingresa el número del voucher (el del comprobante de cambio).',
          'Revisa la prenda original.',
          'Destino: volver a vitrina, pérdida o proveedor.',
          'Si hay prenda nueva, pistolea la que se lleva la clienta.',
        ],
      },
      {
        type: 'video',
        slot: 'mermas.ticket',
        shoot: 'Video: Atender ticket, buscar por el número del voucher y mostrar los destinos (vitrina / pérdida / proveedor).',
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
        items: ['Nuevo gasto', 'Lista y totales con filtros', 'Categoría, monto y fecha'],
      },
      {
        type: 'image',
        slot: 'gastos.form',
        shoot: 'Foto: modal o ficha de Nuevo gasto (categoría y monto), sucursal activa arriba.',
      },
      {
        type: 'video',
        slot: 'gastos.nuevo',
        shoot: 'Video: Nuevo gasto, completar lo mínimo y guardar (o cancelar si no quieres dejar un gasto de prueba).',
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
          'Descargar Excel',
        ],
      },
      {
        type: 'p',
        text: 'Pérdida/Ganancia no es el estado de resultados de la tienda: es el resultado de cada toma aplicada (faltante, sobrante y neto a precio de venta). Elige la toma por su número, no por un nombre de archivo.',
      },
      {
        type: 'image',
        slot: 'reportes.pg',
        shoot: 'Foto: pestaña Pérdida/Ganancia con el período y una toma (se lee el número de la toma).',
      },
      {
        type: 'video',
        slot: 'reportes.vistas',
        shoot: 'Video: cambiar de Ventas a Pérdida/Ganancia y pulsar Descargar Excel (puedes cancelar la descarga).',
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
        shoot: 'Foto: Ajustes en Impresoras (sesión no admin) o con las cuatro pestañas (sesión Administrador/a).',
      },
      {
        type: 'video',
        slot: 'ajustes.impresoras',
        shoot: 'Video: abrir Impresoras y señalar las dos tarjetas (etiquetas vs comprobantes) sin cambiar la configuración de piso si ya está bien.',
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
        type: 'video',
        slot: 'header.puesto',
        shoot: 'Video: abrir la píldora de caja y elegir otra caja de la misma sucursal (vuelve a la de piso al terminar).',
      },
      {
        type: 'image',
        slot: 'header.campana',
        shoot: 'Foto: campana abierta con una alerta de ejemplo (stock bajo o voucher), sin pinchar un dato sensible.',
      },
      {
        type: 'p',
        text: 'Mi cuenta: tu nombre y contraseña. El rol no se cambia desde ahí. El ? es el modo ayuda: pincha controles para leer qué hacen; Esc para salir.',
      },
      {
        type: 'callout',
        kind: 'tip',
        text: 'Antes de la primera venta del turno, mira sucursal y caja. Un clic aquí evita cuadrar mal el cierre.',
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
