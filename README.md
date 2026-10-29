# Órbita · Misiones de preguntas

Juego de preguntas en vivo para la clase. Cada estudiante juega desde su celular o computador: cada respuesta correcta le da combustible, que puede guardar para subir en la clasificación o invertir en el hangar para ganar más rápido. El docente proyecta la ruta de planetas y la clasificación en vivo, y al final obtiene los resultados por estudiante y por pregunta.

## Cómo se juega

**Docente** (`docente.html`)

1. Crea un banco de preguntas o usa el de ejemplo. Puedes pegar muchas preguntas a la vez, una por línea:
   `Pregunta ; respuesta correcta ; incorrecta ; incorrecta ; incorrecta`
2. Pulsa **Jugar**, elige si la misión termina por tiempo o por meta de combustible, y **Abrir sala**.
3. Proyecta el código. Cuando estén todos, pulsa **Despegar**.
4. Al terminar, descarga el CSV con los resultados (se abre en Excel).

**Estudiantes** (`jugar.html`): escriben el código de 6 números y su nombre.

### Reglas

| Mejora | Qué hace | Niveles |
|---|---|---|
| 🔥 Motor | Combustible por acierto | +10 → +20 → +50 → +120 → +300 → +750 |
| 🚀 Propulsor | Multiplica lo que ganas | ×1 → ×1,5 → ×2 → ×3 → ×5 |
| 🛡️ Blindaje | Reduce lo que pierdes al fallar | 100 % → 60 % → 30 % → 0 % |

- Cada acierto seguido suma un 10 % extra, hasta un +50 %.
- Al fallar se pierde lo que da el motor (menos el blindaje), y se reinicia la racha.
- Los costos y valores están en `js/juego.js`, por si quieres ajustarlos.

## Probarlo en tu computador

Las páginas usan módulos de JavaScript, así que hay que abrirlas desde un servidor (no con doble clic):

```bash
python -m http.server 5500
```

Luego abre `http://localhost:5500/docente.html`. Para probar como estudiante, abre `jugar.html` en otra pestaña o en tu celular.

## Publicarlo para tu clase

Son archivos estáticos: súbelos tal cual a GitHub Pages, Netlify o Vercel. Los estudiantes solo necesitan el enlace a `jugar.html` (o a `index.html`).

## Cómo funciona por dentro

- **Tiempo real con Supabase Realtime** (canales de difusión y presencia). No se crean tablas ni se guardan datos en la base de datos. El proyecto configurado está en `config.js`; para usar otro, cambia la URL y la clave publicable (Project Settings → API).
- **El navegador del docente es la autoridad**: guarda las preguntas con sus respuestas correctas, calcula el combustible y valida las compras. Los estudiantes solo reciben el enunciado y las opciones, nunca la respuesta antes de contestar.
- **Si el docente recarga la página**, puede reanudar la misión: el estado se guarda en el navegador.
- **Si un estudiante recarga**, vuelve a entrar solo y conserva su progreso.
- Los bancos de preguntas se guardan en el navegador del docente. Usa **Exportar** para hacer una copia o llevarlos a otro equipo.

## Archivos

```
index.html        Portada: unirse o ir al centro de control
docente.html      Centro de control del docente
jugar.html        Pantalla del estudiante
config.js         Conexión a Supabase
js/juego.js       Reglas: mejoras, planetas, economía
js/red.js         Canal en tiempo real
js/docente.js     Lógica del docente (autoridad de la partida)
js/jugar.js       Lógica del estudiante
css/              Estilos
```
