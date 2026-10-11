# Casino Club · Salas compartidas

Tres juegos para hasta 20 participantes por sala, con fichas virtuales. Las tragamonedas se retiraron.

## Activación requerida

Ejecutar `CasinoClub/supabase.sql` en el editor SQL del mismo proyecto Supabase de Bingo. Crea tablas `casino_*`, políticas de acceso y la función `casino_api`; no modifica datos de los otros juegos. La aplicación usa el acceso administrativo existente. Publicar los archivos junto con el resto del sitio mediante HTTPS.

El código del cliente por sí solo no activa salas. Antes de ejecutar la migración, el servidor responde que `casino_api` no existe y la aplicación muestra que falta activar el casino. La clave pública incluida en el sitio no permite aplicar migraciones.

## Uso

1. Administrador: iniciar sesión, crear sala y configurar las fichas iniciales. Abrir el tablero en otra ventana y copiar la invitación.
2. Participantes: abrir la invitación en el teléfono, poner su nombre y apostar durante la fase de apuestas.
3. Administrador: cerrar apuestas y comenzar. En blackjack, esperar decisiones privadas o plantar a un participante desconectado; luego resolver la banca. En ruleta, sortear el número. En craps, lanzar hasta ganar o perder la apuesta Pass Line.
4. Abrir una nueva ronda con el mismo juego o cambiar de mesa. El saldo se conserva entre juegos.

El panel entrega fondos a uno o a todos, suspende/reactiva participantes, cierra el ingreso de nuevos participantes, cancela devolviendo apuestas y muestra los últimos 60 movimientos. El tablero (`?sala=ABC123&vista=pantalla`) no tiene controles administrativos. En pantalla completa muestra únicamente la mesa, el código y el estado de cada jugador. Las cartas del participante solo se entregan a su token privado, incluso en las respuestas del tablero y del administrador.

## Reglas y persistencia

- Blackjack: seis barajas mezcladas por ronda, as flexible, banca se planta en todos los 17; blackjack 3:2. Sin división, doble ni seguro.
- Ruleta europea: 0–36, pleno 35:1 y exteriores 1:1. El cero pierde en exteriores.
- Craps: Pass Line, 7/11 gana al salir, 2/3/12 pierde; después se necesita el punto antes del 7. Todos comparten los dados. No se vuelve a cobrar al relanzar.

Las apuestas, cartas, sorteos y liquidaciones se calculan en PostgreSQL. Un bloqueo por sala serializa las operaciones; los identificadores de petición evitan dobles cobros ante reintentos. Cada ronda tiene un número para rechazar acciones atrasadas. Se consulta estado cada 1,4 segundos, por lo que no requiere habilitar Supabase Realtime. La recarga conserva la mano y las fichas. Guardar el mismo navegador es necesario para conservar el token de participante; el administrador puede suspender un lugar perdido y gestionar una nueva entrada.

## Verificación

`tests/schema-check.sql` prueba permisos, privacidad, fondos, apuestas e idempotencia dentro de una transacción que termina en rollback. Se ejecuta después de la migración, en una base de pruebas con al menos una cuenta de administrador.
`tests/rooms.html` verifica las tres vistas y las peticiones con un servidor simulado. No reemplaza una prueba de integración con la migración instalada. Abrirlo servido desde la raíz del proyecto.
# Ruleta americana: actualización

La ruleta incluye 38 casillas: 1–36, 0 y 00. Para activar el doble cero en las salas existentes, vuelve a ejecutar `CasinoClub/supabase.sql` en el editor SQL de Supabase antes de jugar. El código del cliente por sí solo no actualiza la función del servidor.

El servidor devuelve `00` como texto para distinguirlo de `0`. Ambos son verdes, pierden en apuestas exteriores y pagan 35:1 en pleno (devolución total: 36 veces la apuesta). La rueda y la bolita muestran el resultado recibido del servidor, sin realizar un sorteo adicional en el navegador.

# Craps: mesa y modalidades

Una apuesta por jugador y ronda: Pass Line, Don’t Pass (bar 12), Come, Don’t Come (bar 12), Field, Place 4/5/6/8/9/10 y Big 6/8. Come y Don’t Come elegidas antes de comenzar esperan al punto de mesa para activarse en la tirada siguiente. Cada apuesta se liquida una sola vez; la ronda termina cuando no quedan apuestas pendientes. No incluye Odds ni apuestas simultáneas.

Field paga 2:1 en 2 y 12, y 1:1 en los otros números ganadores. Place está inactiva en salida y paga 9:5 (4/10), 7:5 (5/9) o 7:6 (6/8). Place 6/8 requiere múltiplos de 30 fichas para conservar los pasos de diez y pagos exactos. Las apuestas ya liquidadas no se devuelven de nuevo al cancelar.

Aplicar `supabase.sql` para actualizar las reglas antes de usar las nuevas zonas. `tests/craps.sql` verifica la función de resolución sin modificar salas ni saldos. Referencia de reglas: https://www.playsmart.ca/table-games/craps/how-to-play/how-to-play-craps-details/

