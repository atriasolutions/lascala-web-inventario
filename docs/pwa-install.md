# Instalar L'Scala como app (PWA)

**Cliente:** Boutique L'Scala (Calama) · **Proveedor:** Atria Solutions SpA  
**Fase:** A — instalable + cache de assets (sin ventas offline aún). Plan completo: [`pwa-offline-pos.md`](./pwa-offline-pos.md).

Requisito: el sitio debe servirse por **HTTPS** (o `localhost` en desarrollo). En producción Calama usar el dominio con certificado.

Tras instalar, la app abre en **Caja** (`/vender`) a pantalla casi completa (`standalone`).

---

## Chrome / Edge (Windows o Mac)

1. Abre L'Scala en Chrome o Edge (sesión iniciada).
2. Si aparece el aviso **“Instala L'Scala en este equipo”** (bajo el banner de red / arriba del contenido), pulsa **Instalar** cuando el botón esté disponible.
3. Si el aviso guía al navegador (sin botón Instalar):
   - **Chrome:** ícono de instalar en la barra de dirección, o menú ⋮ → *Instalar L'Scala…* / *Instalar aplicación…*
   - **Edge:** menú … → *Aplicaciones* → *Instalar este sitio como una aplicación*
4. Confirma. Queda un acceso en el escritorio / Launchpad / menú Inicio.

Para quitar: en la ventana de la app → menú → *Desinstalar L'Scala*.

---

## Android (Chrome)

1. Abre el sitio en Chrome.
2. Menú ⋮ → **Instalar app** / **Agregar a la pantalla de inicio**.
3. Confirma. El ícono fucsia L'Scala queda en el launcher.

También puede mostrarse el banner de instalación dentro de la app (mismo texto que en escritorio).

---

## iPhone / iPad (Safari)

iOS no usa el mismo “Instalar” que Chrome; hay que agregar a inicio:

1. Abre L'Scala en **Safari** (no en Chrome iOS).
2. Toca **Compartir** (cuadrado con flecha).
3. Elige **Agregar a inicio** → **Agregar**.
4. Abre el ícono desde la pantalla de inicio (abre sin barra de Safari).

Limitación conocida: el Service Worker en iOS es más restrictivo; la Caja offline completa llega en Fases B/C. La instalación standalone sí mejora el uso en piso.

---

## Comprobar que quedó instalada

| Señal | OK |
|-------|----|
| Sin barra de URL del navegador | `display: standalone` |
| Abre directo en Caja | `start_url: /vender` |
| Color de barra / tema fucsia | `#E6007E` |
| Ícono marca L'Scala | `public/brand/pwa-192.png` / `512` |

En DevTools → *Application* → *Manifest* / *Service Workers* (Chrome): debe figurar el SW de Vite PWA tras un `build` + deploy (o `vite preview`).

---

## Desarrollo local

```bash
npm run -w @lscala/web build
npm run -w @lscala/web preview
```

Abre la URL de preview (suele ser `http://localhost:4173`). En localhost el navegador permite instalar aunque no sea HTTPS público.

**Importante:** en `npm run dev` (`http://localhost:5173`) el Service Worker de la PWA está **desactivado** a propósito (`devOptions.enabled: false`) para no romper el hot reload. Por eso Chrome **casi nunca** muestra el ícono de instalar ni dispara `beforeinstallprompt` en ese modo. Eso es normal; no es un fallo de producción.

Para probar instalación en local usa **build + preview** (arriba). En producción con HTTPS + SW activo, Chrome sí puede mostrar el ícono / menú Instalar cuando cumple los criterios (manifest + service worker).

El SW **no** se activa en `vite` dev por defecto (`devOptions.enabled: false`) para no ensuciar HMR.
