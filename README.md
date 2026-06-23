# Tareas — control y seguimiento del trabajo del equipo

App web para que un administrador cargue tareas y las asigne a empleados, con login
de Google restringido a una lista de correos autorizados. Cada tarea tiene tipo,
responsable, fecha de vencimiento, estado (Pendiente / En curso / Hecha) e historial
de observaciones.

Stack: Node.js + Express + Postgres + EJS. Pensada para desplegar en Render con GitHub.

---

## Cómo ponerla en marcha (paso a paso)

Son tres bloques: (A) Google, (B) GitHub, (C) Render. Hacelos en ese orden.

### A. Crear las credenciales de Google (login con Gmail)

1. Entrá a https://console.cloud.google.com y creá un proyecto (arriba a la izquierda, "Nuevo proyecto").
2. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth**.
   - Tipo de usuario: **Externo**.
   - Completá nombre de la app, tu correo de soporte y el correo del desarrollador.
   - En "Usuarios de prueba" agregá tu Gmail y el de tus empleados (mientras la app esté en modo prueba, solo esos correos pueden ingresar).
3. Menú → **APIs y servicios → Biblioteca**, buscá **Google Calendar API** y tocá **Habilitar**. Hacé lo mismo con **Google Drive API**.
4. Menú → **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
   - Tipo: **Aplicación web**.
   - En **URIs de redireccionamiento autorizados** agregá estas cuatro (las de localhost son para probar en tu compu; las de onrender, para producción — el nombre lo definís en Render, paso C):
     - `http://localhost:3000/auth/google/callback`
     - `http://localhost:3000/admin/calendar/callback`
     - `https://NOMBRE-DE-TU-APP.onrender.com/auth/google/callback`
     - `https://NOMBRE-DE-TU-APP.onrender.com/admin/calendar/callback`
5. Guardá el **Client ID** y el **Client Secret**. Los vas a necesitar.

### B. Subir el código a GitHub

1. Creá un repositorio nuevo en GitHub (vacío).
2. Desde la carpeta del proyecto:
   ```bash
   git init
   git add .
   git commit -m "Primera versión"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
   El archivo `.gitignore` ya evita subir `node_modules` y el `.env` con secretos.

### C. Desplegar en Render

**Opción rápida (con el blueprint incluido):**
1. En https://render.com → **New → Blueprint**, conectá tu cuenta de GitHub y elegí el repo.
2. Render lee `render.yaml` y propone crear la base de datos y el servicio web. Confirmá.
3. Cuando te lo pida (o luego en el servicio → **Environment**), completá las variables marcadas como secretas:
   - `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` (del paso A).
   - `ADMIN_EMAIL` → tu Gmail. Quien entre con ese correo será administrador.
   - `BASE_URL` → la URL pública de tu servicio, por ejemplo `https://tareas-app.onrender.com` (sin barra al final).
4. Guardá. Render vuelve a desplegar solo.

> `DATABASE_URL`, `SESSION_SECRET` y `NODE_ENV` se cargan automáticamente desde el blueprint.

**Si preferís hacerlo a mano** (sin blueprint): creá primero un **PostgreSQL** y después un **Web Service** apuntando al repo, con Build `npm install`, Start `npm start`, y cargá todas las variables de `.env.example` (usando la *Internal Database URL* del Postgres para `DATABASE_URL`).

### D. Primer ingreso

1. Abrí tu URL de Render y entrá con tu Gmail (el de `ADMIN_EMAIL`). Quedás como administrador.
2. Andá a **Equipo** y autorizá los correos de tus empleados.
3. Avisales que ingresen con Google. Una vez que entran por primera vez, ya podés asignarles tareas.
4. Para el calendario: entrá a **Calendario** y tocá **Conectar Google Calendar** (una sola vez). A partir de ahí, cada evento que crees se envía como invitación a los empleados elegidos.

---

## Cómo funciona el calendario

- En **Calendario** ves el mes del equipo. Como administrador podés crear eventos con fecha, horario (o "todo el día"), lugar e invitados.
- Al crear un evento, queda en la app (lo ven los invitados) y, si conectaste tu Google Calendar, también se crea allí e invita a los empleados: les llega a su propio Google Calendar y por mail.
- Si borrás un evento, también se borra de Google Calendar y se avisa a los invitados.
- Los empleados ven en su calendario solo los eventos a los que están invitados.

## Sectores y responsables

- En **Equipo** podés crear los sectores de tu negocio (Mantenimiento, Cocina, Recepción, etc.) y asignar a cada empleado a un sector.
- Cada tarea puede tener un **responsable** (una persona) y/o un **sector responsable**.
- Cada empleado ve en su lista **sus tareas personales más las de su sector**.
- El "sector" es distinto del "tipo de tarea": el tipo describe la clase de trabajo; el sector dice qué área es responsable.
- Cada tarea puede tener una **foto de referencia (opcional)** que muestra qué hay que hacer. Se sube al crear o editar la tarea y se guarda en Drive, igual que los adjuntos del buzón. En el listado, las tareas con foto muestran un 📷.
- Cada tarea puede llevar una **foto de referencia** (opcional) para mostrar qué hay que hacer. Se guarda en tu Drive igual que los adjuntos del Buzón, así que también necesita tu Google conectado.

## Buzón: avisos y solicitudes

- En **Buzón** conviven dos cosas. **Avisos**: los publica el administrador para todo el equipo (cronogramas en PDF, comunicados, días no laborables) y pueden llevar archivos adjuntos. **Solicitudes**: las cargan los empleados (licencia por enfermedad, vacaciones, etc.), con adjunto opcional como un certificado.
- El administrador ve todas las solicitudes y las marca como Pendiente, Aprobada o Rechazada, con un comentario.
- Se pueden adjuntar PDF, imágenes, Word y otros (hasta 5 por vez, 10 MB cada uno).
- Los **tipos de aviso y de solicitud** se configuran desde **Equipo**: podés agregar o quitar opciones cuando quieras.

## Cambiar el logo

El logo está en `src/public/logo.svg`. Para usar el tuyo, reemplazá ese archivo por tu imagen (idealmente otro `.svg` o un `.png` cuadrado) manteniendo el nombre `logo.svg`, o subí tu archivo y cambiá las referencias `/logo.svg` en `src/views/partials/head.ejs` y `src/views/login.ejs`.
- **Dónde se guardan los archivos:** en tu Google Drive, en una carpeta "App Tareas" que arma subcarpetas por mes automáticamente (ej: "2026-06 Junio"). En Drive los archivos quedan privados (solo los ves vos); los empleados los ven únicamente desde dentro de la app, según permisos. Necesitás conectar tu Google (mismo botón que el del calendario) para que la subida funcione.

---

## Probar en tu computadora (opcional)

Necesitás Node 18+ y un Postgres local (o uno en la nube).

```bash
npm install
cp .env.example .env      # completá los valores en .env
npm run dev               # arranca en http://localhost:3000
```

---

## Notas

- El plan **free** de Render duerme el servicio tras un rato de inactividad: la primera visita después de eso puede tardar unos segundos. Los nombres y límites de los planes pueden cambiar; revisá la opción vigente al crear la base.
- La app crea las tablas sola al arrancar (no hace falta correr migraciones).
- "Quitar" una autorización impide que esa persona vuelva a entrar, pero no borra sus tareas ni su historial.

## Pendiente para próximas etapas

- Objetivos con premios (objetivos puntuales definidos por el administrador).
