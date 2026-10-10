# MONC TICELLO | Bingo Casino

Bingo estilo casino en HTML, CSS y JavaScript. Sin compilación ni dependencias de JavaScript. Cartones de 5 × 5, 75 bolillas y centro libre.

## Probar en tu computador

```sh
python server.py
```

Abre `http://localhost:5500`. Este servidor permite entrar directamente a `http://localhost:5500/abc123`, incluyendo recargar la página. `python -m http.server` no soporta las rutas de salas.

La portada siempre pide el código de la sala. Si ya tienes cartón en ese navegador, lo recupera; si no, valida la sala y después pide tu nombre. Un enlace `/codigo` realiza esa comprobación automáticamente. Una sala inexistente muestra un error; las salas empezadas solo permiten volver a jugadores ya inscritos.

Sin Supabase, pulsa **Ingresar como organizador → Probar panel de demostración** para crear una sala local. La demo funciona entre pestañas del mismo navegador y no conecta teléfonos diferentes. Este acceso de prueba desaparece al configurar Supabase. También puedes abrir `index.html` directamente; en ese caso el enlace usa `?sala=CODIGO` por las limitaciones de `file://`.

## Conectar o actualizar Supabase

1. Crea un proyecto en Supabase si todavía no tienes uno.
2. En **SQL Editor**, ejecuta todo `supabase.sql`. Si ya ejecutaste la versión anterior, vuelve a ejecutar el archivo actualizado: agrega las columnas de rondas y premios sin borrar salas, jugadores ni cartones.
3. Al inicio de `app.js`, completa `SUPABASE_URL` con la URL del proyecto y `SUPABASE_ANON_KEY` con su clave pública **publishable** o **anon**. Nunca uses `service_role` ni una clave secreta.
4. En Supabase **Authentication → Users**, crea la cuenta del organizador con correo y contraseña y confirma su correo. Mantén habilitado el proveedor Email. No hay registro público de organizadores en la interfaz; puedes desactivar nuevos registros en Supabase si solo crearás cuentas desde el Dashboard.
5. Publica los archivos indicados abajo en un hosting estático con HTTPS, en la raíz del dominio.
6. Pulsa **Ingresar como organizador**, inicia sesión y crea una sala. **Invitar a jugar** genera `https://tu-dominio.cl/abc123`. Los jugadores no necesitan una cuenta de Supabase.

Aplica el SQL antes de publicar esta versión de la interfaz. Las pantallas se actualizan cada 2 segundos y no requieren habilitar Supabase Realtime. No se ha probado contra un proyecto Supabase real todavía.

## Acceso del organizador

El panel usa correo y contraseña con **Supabase Auth**. `auth.js` llama a sus endpoints de contraseña, validación de usuario, renovación de tokens y cierre de sesión. Las credenciales se envían a tu proyecto Supabase; la contraseña nunca se guarda. La sesión se conserva en este navegador y se renueva cuando hace falta. [Autenticación con contraseña](https://supabase.com/docs/guides/auth/passwords).

Cada sala tiene un `owner_id` asociado a la cuenta que la creó. El SQL exige `auth.uid()` para crear salas y verifica que el usuario sea su dueño antes de sortear, cambiar estilos o reiniciar. **Mis salas** lista exclusivamente las salas de esa cuenta, también al iniciar sesión desde otro dispositivo. Cerrar sesión bloquea el panel y conserva las sesiones de los jugadores.

Las salas creadas antes de esta actualización no se borran. Inicia sesión desde el navegador que las creó: la sala antigua recordada se vincula a esa cuenta usando su antiguo token privado. Después de vincularla, ese token deja de autorizar al anfitrión. Para otras salas antiguas que ya no estén guardadas en ese navegador, puedes asignar su `owner_id` desde el Dashboard de Supabase usando el UUID de tu usuario de Authentication; no compartas ese acceso administrativo.

## Premios y estilos

Elige un estilo al crear la sala o pulsa **Estilo de juego** antes de empezar:

| Estilo | Primer premio | Último premio |
| --- | --- | --- |
| Binguito → cartón completo | Una fila, columna o diagonal | Los 24 números |
| Solo cartón completo | Los 24 números | — |
| Cuatro esquinas → cartón completo | Las cuatro esquinas | Los 24 números |
| La X → cartón completo | Ambas diagonales | Los 24 números |

El botón del jugador cambia según el premio activo: **¡BINGUITO!**, **¡CUATRO ESQUINAS!**, **¡TENGO LA X!** o **¡BINGO COMPLETO!**. Se resalta cuando la figura está completa. El servidor verifica el reclamo, incluso si alguien modifica la interfaz.

Cuando se entrega un premio, se pausa el sorteo. Después del premio inicial, el anfitrión pulsa **Continuar a cartón completo**. Se conservan todas las bolillas y marcas. El mismo jugador puede ganar ambos premios. El primer reclamo válido gana cada etapa y los ganadores aparecen en ambas pantallas.

## Reiniciar sin perder jugadores

Pulsa **Reiniciar ronda · conservar cartones**. Puedes mantener el estilo o elegir otro para la próxima ronda. El diálogo explica qué se reinicia antes de aplicar el cambio.

- Se limpian las bolillas, las marcas y los premios de esa ronda; aumenta el número de ronda.
- Se conservan el código, el enlace, todos los jugadores y los números de cada cartón.
- Los teléfonos se actualizan solos. Nadie tiene que volver a registrarse.
- Quienes aún no entraron pueden inscribirse antes de la primera bolilla de la nueva ronda.
- **Crear una nueva sala** sigue disponible para una sala distinta; para otra ronda usa **Reiniciar**.

Los pedidos incluyen el número de ronda y la etapa del premio. El servidor rechaza sorteos, reclamos o reinicios atrasados de una ronda anterior. Las operaciones de sala están serializadas para evitar ganadores simultáneos o bolillas repetidas.

## Publicar las rutas `/codigo`

Publica `index.html`, `style.css`, `casino.css`, `game.js`, `auth.js` y `app.js`, la carpeta `assets/` con los dos logos, y la configuración del hosting que corresponda:

- Netlify / Cloudflare Pages: `_redirects`.
- Vercel: `vercel.json`.
- Apache con `mod_rewrite`: `.htaccess`.
- Otro servidor: configura una reescritura interna de `/codigo` a `/index.html`, conservando la URL y sirviendo los archivos estáticos normalmente.

Publica en la raíz del dominio. Los códigos tienen seis caracteres, aceptan mayúsculas o minúsculas y los enlaces nuevos se generan en minúscula. Los enlaces antiguos `?sala=CODIGO` continúan funcionando. No incluyas `.test-tools`, `tests` ni `server.py` en los archivos públicos de producción.

## Controles y sesiones

**Pantalla completa** abre una vista para proyectar con únicamente el tablero, la última bolilla, todas las bolillas sorteadas y el código de sala. No muestra navegación, cuentas, formularios ni lista de jugadores. El historial está ordenado de más reciente a más antiguo. La paleta usa verde casino, marfil y dorado, con números marcados en claro.

En esa vista, pulsa **Espacio** o toca la tarjeta de la última bolilla para sacar un número; **A** activa o pausa el automático; **Enter** continúa al siguiente premio cuando hay ganador. **Esc** o tocar el código de sala permite salir. Si el navegador no admite pantalla completa nativa, se usa la misma vista dentro de la ventana. Para otra ronda, sal y usa **Reiniciar ronda**.

Los archivos usan UTF-8 y el servidor local lo indica explícitamente en las cabeceras. Se incluye `.editorconfig` para conservar esa codificación al editar.

- Sorteo manual o automático cada 6,5 segundos aproximadamente. **Pausar** o cambiar de vista detiene el automático.
- Borde de ruleta rojo, negro y verde. El primer clic en **Sacar un número** inicia una simulación rápida que ilumina una sola bolilla aleatoria por vez, durante un instante visible, evitando repetir las últimas. El botón cambia a **Detener y elegir**; el segundo clic hace que la ruleta desacelere progresivamente hasta caer exactamente en el número sorteado. Después aparece la animación del elegido y permanece ahí hasta pulsar **Marcar y continuar**. Recién entonces queda marcada en el tablero y el cartón. Los candidatos no cuentan como bolillas sorteadas. Voz opcional y pantalla completa si el navegador lo permite.
- Las sesiones se guardan en este navegador. Al volver a una sala mediante su enlace, recuperas tu cartón. Se recuerdan las sesiones de varias salas.
- Los jugadores no necesitan correo ni contraseña. No borres los datos del navegador durante la partida: no hay recuperación del cartón si pierdes el token del jugador. Los nombres pueden repetirse. Los organizadores recuperan sus salas iniciando sesión en su cuenta.
- Las tablas tienen RLS y sin acceso directo de clientes públicos. `bingo_api` autoriza acciones, genera cartones y valida premios; no devuelve tokens ajenos. [Referencia de Supabase](https://supabase.com/docs/guides/database/functions).
- Hasta 200 jugadores por sala. El sistema está pensado para salas pequeñas; un servicio público masivo necesitaría límites de solicitudes y expiración de salas.

## Comprobaciones

Pruebas de figuras, premios por etapas, permisos, reclamos atrasados, reinicio conservando cartones, reconexión y 75 bolillas sin repetición:

```sh
python -m pip install --target .test-tools mini-racer pglast
python tests/check.py
```

También comprueban el inicio, la renovación y el cierre de sesión con respuestas simuladas de Auth; el ingreso por código y la recuperación de cartón con un DOM simulado; la sintaxis de JavaScript y PL/pgSQL; las referencias de la interfaz y las rutas HTTP. Estas herramientas solo se necesitan para desarrollar; no para jugar. Las pruebas no reemplazan una comprobación visual en navegador ni una prueba de conexión con tu proyecto Supabase.
