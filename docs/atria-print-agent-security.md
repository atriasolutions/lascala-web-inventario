# Atria Print Agent — Seguridad

**Fase:** 2 — diseño  
**Alcance:** Agent local en PC de boutique / dev. App L'Scala **solo local** (sin usuarios productivos en cloud).  
**Código relacionado:** `atria-print-agent/src/security/token.ts`, `src/config/`, `src/logging/logger.ts`

---

## 1. Modelo de amenaza (resumen)

| Amenaza | Mitigación |
|---------|------------|
| Otro proceso en la misma máquina envía jobs de impresión | Bind solo loopback + token compartido |
| Página web maliciosa en el navegador llama al Agent | CORS restrictivo + token (origen ≠ L'Scala no debe conocer el secret) |
| Exfiltración de datos de venta vía logs | No loguear cuerpos de jobs ni PII; redactar secrets |
| Bind a la LAN por error de config | Hardening: forzar `127.0.0.1` en load (scaffold ya lo hace) |

No es un servicio internet-facing. No hay TLS en loopback (aceptable en este contexto).

---

## 2. Identidad del Agent (`agentId`)

- UUID v4 generado en el primer arranque.
- Persistido en `config.json` (user-data).
- **No es PII**; sirve para soporte (“¿qué instalación responde?”) y telemetría futura opcional.
- Visible en `GET /health` → campo `agentId`.
- No sustituye al token de autorización.

---

## 3. Token / secret local

| Aspecto | Decisión |
|---------|----------|
| Header | `X-Atria-Print-Token` |
| Almacenamiento Agent | `printToken` en `config.json` (permisos archivo `0600` en Unix) |
| Almacenamiento SPA | Preferencia local / archivo de pairing (definir en cutover Fase 6; p.ej. `localStorage` o prompt único al primer connect) |
| Dev | `printToken: null` → middleware deja pasar (facilita `npm run dev`) |
| Prod boutique | Token generado en install o primer arranque; SPA debe configurarlo (flujo UX en Fase 6) |

Comportamiento (scaffold `requirePrintToken`):

- Si `printToken` es `null` → no exige header.
- Si está definido y el header no coincide → `401` `{ error: "UNAUTHORIZED", message: "..." }`.
- **`GET /health`:** se recomienda **sin** token (probe de “¿está corriendo?”).
- **`GET /printers` y `POST /print/*`:** protegidos cuando hay token.

Generación sugerida (implementación posterior): `crypto.randomBytes(32).toString('base64url')`.

---

## 4. CORS y orígenes permitidos

Solo orígenes de desarrollo / SPA local conocidos. Ejemplos:

```ts
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // Vite default
  'http://127.0.0.1:5173',
  // Añadir puerto preview / build local si aplica, p.ej. 4173
];
```

Reglas:

- Responder `Access-Control-Allow-Origin` solo si `Origin` ∈ allowlist (no `*`).
- Permitir header `X-Atria-Print-Token`, `Content-Type`.
- Métodos: `GET`, `POST`, `OPTIONS`.
- Requests sin `Origin` (curl, health local) OK en loopback.

Si la SPA se sirve desde otro puerto en el futuro, actualizar allowlist y documentar en este archivo.

---

## 5. Superficie de red

```text
Escucha: 127.0.0.1:9876
Prohibido por defecto: 0.0.0.0, ::, interfaces LAN
```

Cualquier override de `host` en config debe tratarse como **no soportado** en producto boutique (o requerir flag explícito de desarrollo).

---

## 6. Qué no loguear

El logger del scaffold ya redacta claves que matchean `/token|password|secret|authorization|private.?key/i` y trunca strings largos.

**Prohibido en logs:**

- Valor completo de `X-Atria-Print-Token` / `printToken`
- Cuerpo completo de `POST /print/raw` (TSPL puede incluir códigos de producto; además es verboso)
- HTML de comprobantes (datos de venta, RUT, nombres)
- Certificados o claves QZ (el Agent no debe manejarlos)
- Tokens JWT de L'Scala (el Agent no los recibe)

**Permitido:**

- `agentId`, versión, platform, puerto
- Nombre de impresora, `jobId`, duración, código de error
- Longitud de payload (`dataLength`) sin contenido
- Stack traces de errores internos **sin** request body

Ruta de logs: `<user-data>/logs/agent-YYYY-MM-DD.log` (ver `paths.ts`).

---

## 7. Archivos sensibles en disco

| Archivo | Contenido | Protección |
|---------|-----------|------------|
| `config.json` | `agentId`, `printToken`, host/port | `0600` al escribir; no versionar |
| Logs | Operación | Sin secrets; rotación simple por día (MVP) |

No copiar `config.json` a repositorios ni a tickets de soporte sin redactar el token.

---

## 8. Relación con QZ signing

El esquema de cert/firma QZ (`qz-signing/`, `jsrsasign`) **no** se porta al Agent. El trust model es: proceso local + loopback + token compartido con la SPA.

---

## 9. Checklist de implementación (Fases 3+)

- [ ] CORS allowlist efectiva en Express
- [ ] `requirePrintToken` en `/printers` y `/print/*`
- [ ] `/health` sin token
- [ ] Host forzado a `127.0.0.1`
- [ ] Logs sin body de print
- [ ] Documentar en UI cómo pegar/rotar el token (Fase 6)

---

## Relacionados

- [`atria-print-agent-architecture.md`](./atria-print-agent-architecture.md)
- [`atria-print-agent-development.md`](./atria-print-agent-development.md)
- [`atria-print-agent-installation.md`](./atria-print-agent-installation.md)
