# Asistente de IA de Sentia — Guía de despliegue (sin terminal)

Todo se hace desde paneles web. No necesitas Node, npm ni línea de comandos.

**Arquitectura:** el navegador **nunca** habla con Gemini. Habla con TU backend
(Cloudflare Worker ahora; PHP cuando migres a Hostinger), y el backend guarda la
API key como secreto y llama a Gemini.

```
Visitante → chat.js (widget) → TU backend (key oculta, rate limit, CORS, crisis) → Gemini
```

---

## ⚠️ Antes de nada: tu API key

- La key se pega **solo** en el panel de Cloudflare (o en `config.php` en Hostinger).
- **Nunca** la pegues en el HTML/JS, en un chat, email o repositorio.
- Si alguna vez la has compartido en texto plano (aunque fuera una vez), **regenérala**
  antes de seguir: entra en <https://aistudio.google.com/apikey>, borra la key antigua
  y crea una nueva.

---

## Paso 1 · Desplegar el Worker en Cloudflare (gratis, sin tarjeta)

### 1a · Crear la cuenta de Cloudflare (si no tienes una)

No hace falta tener nada previo — se crea gratis en 1 minuto, sin tarjeta:

1. Ve a <https://dash.cloudflare.com/sign-up>.
2. Rellena email y contraseña → **Create Account**.
3. Confirma el email que te llega (clic en el enlace de verificación).
4. Ya estás dentro del **dashboard** de Cloudflare — es el panel donde haremos todo.

### 1b · Crear el Worker

1. En el menú lateral izquierdo, busca **Workers & Pages** y haz clic.
2. Botón **Create** (arriba a la derecha) → **Create Worker**.
3. Dale un nombre, p. ej. `sentia-chat` → **Deploy** (despliega una plantilla de ejemplo, es normal).
4. Ahora pulsa **Edit code** (o "Continue to project" → "Edit code").
5. Verás un editor con código de ejemplo: selecciona todo (Ctrl+A) y bórralo.
6. Pega el contenido completo de
   [`backend/cloudflare-worker/worker.js`](backend/cloudflare-worker/worker.js) de tu proyecto.
7. Revisa que la línea `ALLOWED_ORIGINS` ya tiene `https://hectormelgar22.github.io`
   (tu web) — así viene preparado en el archivo, no hace falta tocarlo.
8. Pulsa **Deploy** (arriba a la derecha del editor).

### 1c · Añadir la API key como secreto

1. Vuelve a la página del Worker → pestaña **Settings → Variables and Secrets**.
2. **Add** → Type: **Secret** → Name: `GEMINI_API_KEY` → Value: tu key → **Deploy**.

### 1d · Crear el KV para el rate limiting

1. Menú lateral: **Storage & Databases → KV → Create namespace** → nómbralo `sentia-rate-limit`.
2. Vuelve al Worker → **Settings → Bindings → Add → KV namespace**:
   - Variable name: `RATE_LIMIT` (exactamente así)
   - KV namespace: `sentia-rate-limit`
3. **Deploy**.

### 1e · Copia la URL del Worker

Aparece en la página del Worker, tipo `https://sentia-chat.TU-CUENTA.workers.dev`.
La necesitas en el paso 3.

---

## Paso 2 · Publicar la web en tu GitHub Pages (ya tienes el repo)

Tu repositorio es **`hectormelgar22/hectormelgar22.github.io`** — este tipo de repo
(con tu usuario + `.github.io` como nombre) es especial: GitHub Pages lo publica
automáticamente en la raíz, en **`https://hectormelgar22.github.io/`** (sin
subcarpeta, sin activar nada en Settings → Pages).

1. Entra en <https://github.com/hectormelgar22/hectormelgar22.github.io>.
2. **Add file → Upload files** → arrastra TODOS los archivos de la carpeta del
   proyecto: `index.html`, `styles.css`, `main.js`, `chat.js`, `.htaccess`, y las
   carpetas `lib/` y `assets/` completas (arrástralas tal cual, GitHub respeta la
   estructura de carpetas). La carpeta `backend/` no hace falta subirla, y
   `config.php` nunca se sube (no existe todavía en tu proyecto, así que no hay
   riesgo).
3. Abajo, **Commit changes** (déjalo directo a la rama `main`).
4. Espera 1-2 minutos y entra en <https://hectormelgar22.github.io/> — ya debería
   verse tu web.

> Si ya tenías algo publicado ahí antes, este paso lo sustituye. Si tienes dudas
> sobre si hay contenido previo en ese repo, dímelo antes de subir nada.

---

## Paso 3 · Conectar el widget

1. Abre [`chat.js`](chat.js) y edita **una sola línea**:
   ```js
   var CHAT_BACKEND = "https://sentia-chat.TU-CUENTA.workers.dev";
   ```
   (tu URL real del paso 1e)
2. Sube el `chat.js` actualizado al repo (o edítalo directamente desde GitHub: abre
   el archivo → lápiz ✏️ **Edit this file** → pega el cambio → **Commit changes**).
3. Abre <https://hectormelgar22.github.io/>, pulsa la burbuja verde y pregunta algo. ✅

---

## Migración a Hostinger (el día que cierres cliente)

1. Sube toda la web por el gestor de archivos de Hostinger a `public_html/`.
2. Crea la carpeta `public_html/api/` y sube dentro:
   - `backend/php/chat.php`
   - `backend/php/.htaccess`
   - `backend/php/config.example.php` renombrado a **`config.php`**, con tu key dentro
     (o mejor: define `GEMINI_API_KEY` como variable de entorno en el panel si tu plan lo permite, y borra config.php).
3. Edita en `chat.php` la lista `$ALLOWED_ORIGINS` con tu dominio definitivo.
4. En `chat.js` cambia la misma línea de siempre:
   ```js
   var CHAT_BACKEND = "https://tudominio.com/api/chat.php";
   ```
5. Listo. El comportamiento (límites, crisis, tono, CORS) es idéntico al Worker.
6. Cuando el Worker ya no se use, bórralo desde el panel de Cloudflare.

---

## Qué hace el backend (ambas versiones)

| Protección | Detalle |
|---|---|
| API key oculta | Solo vive como secreto de Cloudflare / config.php protegido por .htaccess |
| CORS | Solo responde a los orígenes de `ALLOWED_ORIGINS` |
| Rate limiting | 8 mensajes/min y 60/día por IP (editable arriba del archivo) |
| Crisis | Si el mensaje contiene señales de suicidio/autolesión, responde con el 024, 112 y 717 003 717 **sin llamar al modelo** |
| Guardarraíles | El system prompt prohíbe diagnósticos, plazos de recuperación, y medicación; tono cálido y breve; deriva a la primera consulta gratuita |
| Límites de entrada | Mensajes de máx. 1.000 caracteres, historial de máx. 8 turnos |

## Cuota gratuita de Gemini

El plan gratuito de `gemini-2.5-flash` da un número limitado de peticiones/día.
Con el límite de 60 mensajes/día por IP es difícil agotarla con tráfico normal,
pero si el chat crece, puedes bajar `RATE_PER_DAY` o activar facturación en Google
AI Studio (el modelo flash es muy barato).
