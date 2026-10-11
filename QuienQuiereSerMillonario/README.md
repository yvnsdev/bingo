# MONC TICELLO | ¿Quién conoce más a Monserrat?

Juego grupal de preguntas para una pantalla principal y participantes conectados desde sus teléfonos. Todos votan A–D; el conductor revela la respuesta, muestra porcentajes y avanza la clasificación.

## Puesta en marcha

1. Ejecuta `supabase.sql` en el mismo proyecto Supabase usado por Bingo. Solo crea tablas y la función `millionaire_*`.
2. Conserva en `app.js` la misma URL y clave pública de Supabase que usa Bingo.
3. Inicia `python server.py` y abre `http://localhost:5600`.
4. Entra al panel con una cuenta de administrador existente, abre **Banco de preguntas**, agrega contenido y crea una sala.
5. Proyecta el panel con **Pantalla completa** y comparte el código de seis caracteres.

Las preguntas solo se administran con una sesión válida de Supabase Auth. Los jugadores no necesitan cuenta; guardan un token local para recuperar su lugar al recargar. La función SQL valida permisos, estados, votos, respuestas correctas, puntajes y el uso único de los comodines.

## Comodines

- **50:50:** elimina dos alternativas incorrectas para todos.
- **Llamada:** marca una pausa visible para que el conductor permita una consulta.
- **Público:** muestra la distribución de votos reunidos hasta ese momento.
- **Experto:** presenta la pista escrita por el administrador al crear la pregunta.

## Modo demostración

Si se vacían `SUPABASE_URL` y `SUPABASE_ANON_KEY`, aparece un acceso de demostración. Usa almacenamiento local e incluye seis preguntas de ejemplo; sirve para revisar la experiencia en un solo navegador, no para conectar teléfonos diferentes.
