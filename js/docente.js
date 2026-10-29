// Centro de control del docente. Este navegador es la autoridad de la partida:
// guarda las respuestas correctas, calcula el combustible y decide quién gana.
import {
  MEJORAS, LETRAS, PLANETAS, mejorasIniciales, gananciaAcierto, perdidaFallo, costoSiguienteNivel,
  planetaActual, posicionEnRuta, formatear, formatearTiempo, escapar, nuevoId, barajar,
} from './juego.js';
import { abrirSala } from './red.js';

const CLAVE_BANCOS = 'orbita.bancos';
const CLAVE_PARTIDA = 'orbita.partida';
const VISTAS = ['bancos', 'editor', 'configurar', 'sala', 'partida', 'resultados'];

const $ = (id) => document.getElementById(id);

function mostrar(vista) {
  for (const nombre of VISTAS) $(`vista-${nombre}`).classList.toggle('oculto', nombre !== vista);
  window.scrollTo(0, 0);
}

function leer(clave, porDefecto) {
  try {
    const texto = localStorage.getItem(clave);
    return texto ? JSON.parse(texto) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    if (valor === null) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    // Sin almacenamiento (modo privado): la partida sigue funcionando, solo no se puede reanudar.
  }
}

function descargar(nombreArchivo, contenido, tipo) {
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  enlace.download = nombreArchivo;
  enlace.click();
  setTimeout(() => URL.revokeObjectURL(enlace.href), 1000);
}

function nombreArchivo(texto) {
  return (texto || 'orbita').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').toLowerCase();
}

// ---------------------------------------------------------------------------
// Bancos de preguntas
// ---------------------------------------------------------------------------

function pregunta(texto, correcta, ...incorrectas) {
  return { id: nuevoId(), texto, opciones: [correcta, ...incorrectas], correcta: 0 };
}

function bancoEjemplo() {
  return {
    id: nuevoId(),
    titulo: 'Ejemplo · El sistema solar',
    preguntas: [
      pregunta('¿Cuál es el planeta más cercano al Sol?', 'Mercurio', 'Venus', 'Marte', 'Tierra'),
      pregunta('¿Cuál es el planeta más grande del sistema solar?', 'Júpiter', 'Saturno', 'Neptuno', 'Tierra'),
      pregunta('¿Qué planeta es conocido como «el planeta rojo»?', 'Marte', 'Venus', 'Júpiter', 'Mercurio'),
      pregunta('¿Cuántos planetas tiene el sistema solar?', '8', '9', '7', '10'),
      pregunta('¿Qué es la Luna para la Tierra?', 'Su satélite natural', 'Un planeta enano', 'Una estrella', 'Un asteroide'),
      pregunta('¿Qué planeta tiene los anillos más fáciles de ver?', 'Saturno', 'Marte', 'Mercurio', 'Venus'),
      pregunta('¿Cuánto tarda la Tierra en dar una vuelta alrededor del Sol?', 'Un año, unos 365 días', 'Un día', 'Un mes', 'Una semana'),
      pregunta('¿Qué tipo de objeto es el Sol?', 'Una estrella', 'Un planeta', 'Un satélite', 'Un cometa'),
      pregunta('Desde 2006, Plutón se clasifica como…', 'Planeta enano', 'Planeta gigante', 'Satélite', 'Estrella'),
      pregunta('¿Qué planeta tiene la superficie más caliente?', 'Venus', 'Mercurio', 'Marte', 'Júpiter'),
    ],
  };
}

let bancos = leer(CLAVE_BANCOS, null);
if (!Array.isArray(bancos)) {
  bancos = [bancoEjemplo()];
  escribir(CLAVE_BANCOS, bancos);
}

function guardarBancos() {
  escribir(CLAVE_BANCOS, bancos);
}

function renderBancos() {
  const lista = $('lista-bancos');
  if (!bancos.length) {
    lista.innerHTML = `<div class="panel vacio">Todavía no tienes bancos de preguntas.<br>Crea uno nuevo o importa un archivo.</div>`;
  } else {
    lista.innerHTML = bancos.map((banco) => `
      <article class="panel tarjeta-banco" data-id="${escapar(banco.id)}">
        <h3>${escapar(banco.titulo || 'Sin título')}</h3>
        <span class="etiqueta" style="align-self:flex-start">${banco.preguntas.length} ${banco.preguntas.length === 1 ? 'pregunta' : 'preguntas'}</span>
        <div class="acciones">
          <button class="boton combustible pequeno" data-accion="jugar" ${banco.preguntas.length ? '' : 'disabled'}>Jugar</button>
          <button class="boton secundario pequeno" data-accion="editar">Editar</button>
          <button class="boton secundario pequeno" data-accion="duplicar">Duplicar</button>
          <button class="boton peligro pequeno" data-accion="eliminar">Eliminar</button>
        </div>
      </article>`).join('');
  }
  renderAvisoReanudar();
}

$('lista-bancos').addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-accion]');
  if (!boton) return;
  const banco = bancos.find((b) => b.id === boton.closest('[data-id]').dataset.id);
  if (!banco) return;
  const accion = boton.dataset.accion;
  if (accion === 'jugar') abrirConfiguracion(banco);
  else if (accion === 'editar') abrirEditor(banco);
  else if (accion === 'duplicar') {
    const copia = structuredClone(banco);
    copia.id = nuevoId();
    copia.titulo = `${banco.titulo} (copia)`;
    copia.preguntas.forEach((p) => { p.id = nuevoId(); });
    bancos.splice(bancos.indexOf(banco) + 1, 0, copia);
    guardarBancos();
    renderBancos();
  } else if (accion === 'eliminar') {
    if (!confirm(`¿Eliminar «${banco.titulo}»? Esta acción no se puede deshacer.`)) return;
    bancos = bancos.filter((b) => b !== banco);
    guardarBancos();
    renderBancos();
  }
});

$('nuevo-banco').addEventListener('click', () => {
  abrirEditor({ id: nuevoId(), titulo: '', preguntas: [preguntaVacia()] }, true);
});

$('importar-archivo').addEventListener('change', async (evento) => {
  const archivo = evento.target.files[0];
  evento.target.value = '';
  if (!archivo) return;
  try {
    const datos = JSON.parse(await archivo.text());
    const importados = (Array.isArray(datos) ? datos : [datos]).map(bancoDesdeArchivo).filter(Boolean);
    if (!importados.length) throw new Error('sin bancos');
    bancos.push(...importados);
    guardarBancos();
    renderBancos();
    alert(`Importado: ${importados.map((b) => b.titulo).join(', ')}`);
  } catch {
    alert('No se pudo leer el archivo. Usa un archivo exportado desde Órbita.');
  }
});

function bancoDesdeArchivo(datos) {
  if (!datos || typeof datos.titulo !== 'string' || !Array.isArray(datos.preguntas)) return null;
  const preguntas = datos.preguntas
    .filter((p) => p && typeof p.texto === 'string' && Array.isArray(p.opciones))
    .map((p) => normalizarPregunta({
      id: nuevoId(),
      texto: p.texto,
      opciones: p.opciones.slice(0, 4).map(String),
      correcta: Number.isInteger(p.correcta) ? p.correcta : 0,
    }))
    .filter((p) => p.texto && p.opciones.length >= 2 && p.correcta >= 0);
  return { id: nuevoId(), titulo: datos.titulo.slice(0, 80), preguntas };
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

let borrador = null;
let borradorEsNuevo = false;

function preguntaVacia() {
  return { id: nuevoId(), texto: '', opciones: ['', '', '', ''], correcta: 0 };
}

function normalizarPregunta(p) {
  const llenas = p.opciones.map((texto, j) => ({ texto: (texto ?? '').trim(), j })).filter((o) => o.texto);
  return {
    id: p.id,
    texto: p.texto.trim(),
    opciones: llenas.map((o) => o.texto),
    correcta: llenas.findIndex((o) => o.j === p.correcta),
  };
}

function abrirEditor(banco, esNuevo = false) {
  borrador = structuredClone(banco);
  borrador.preguntas.forEach((p) => {
    while (p.opciones.length < 4) p.opciones.push('');
  });
  borradorEsNuevo = esNuevo;
  $('editor-errores').classList.add('oculto');
  $('lote-texto').value = '';
  renderEditor();
  mostrar('editor');
}

function renderEditor() {
  $('editor-titulo').value = borrador.titulo;
  $('editor-preguntas').innerHTML = borrador.preguntas.map((p, i) => `
    <div class="panel pregunta-editor" data-i="${i}">
      <div class="cabecera">
        <span class="numero">Pregunta ${i + 1}</span>
        <button class="boton peligro pequeno" data-accion="quitar" aria-label="Quitar pregunta ${i + 1}">Quitar</button>
      </div>
      <textarea data-campo="texto" rows="2" maxlength="300" placeholder="Escribe la pregunta" aria-label="Enunciado de la pregunta ${i + 1}">${escapar(p.texto)}</textarea>
      <div class="opciones-editor">
        ${[0, 1, 2, 3].map((j) => `
          <div class="opcion-editor ${p.correcta === j ? 'es-correcta' : ''}">
            <input type="radio" name="correcta-${escapar(p.id)}" data-campo="correcta" value="${j}" ${p.correcta === j ? 'checked' : ''} aria-label="Marcar la opción ${LETRAS[j]} como correcta">
            <span class="letra">${LETRAS[j]}</span>
            <input type="text" data-campo="opcion" data-j="${j}" maxlength="120" value="${escapar(p.opciones[j])}" placeholder="${j < 2 ? 'Opción' : 'Opción (opcional)'}" aria-label="Opción ${LETRAS[j]}">
          </div>`).join('')}
      </div>
    </div>`).join('');
}

$('editor-titulo').addEventListener('input', (e) => { borrador.titulo = e.target.value; });

$('editor-preguntas').addEventListener('input', (e) => {
  const tarjeta = e.target.closest('[data-i]');
  if (!tarjeta) return;
  const p = borrador.preguntas[Number(tarjeta.dataset.i)];
  if (e.target.dataset.campo === 'texto') p.texto = e.target.value;
  else if (e.target.dataset.campo === 'opcion') p.opciones[Number(e.target.dataset.j)] = e.target.value;
});

$('editor-preguntas').addEventListener('change', (e) => {
  if (e.target.dataset.campo !== 'correcta') return;
  const tarjeta = e.target.closest('[data-i]');
  borrador.preguntas[Number(tarjeta.dataset.i)].correcta = Number(e.target.value);
  tarjeta.querySelectorAll('.opcion-editor').forEach((el, j) => el.classList.toggle('es-correcta', j === Number(e.target.value)));
});

$('editor-preguntas').addEventListener('click', (e) => {
  const boton = e.target.closest('button[data-accion="quitar"]');
  if (!boton) return;
  borrador.preguntas.splice(Number(boton.closest('[data-i]').dataset.i), 1);
  renderEditor();
});

$('editor-agregar').addEventListener('click', () => {
  borrador.preguntas.push(preguntaVacia());
  renderEditor();
  const tarjetas = $('editor-preguntas').querySelectorAll('textarea');
  tarjetas[tarjetas.length - 1]?.focus();
});

$('lote-agregar').addEventListener('click', () => {
  const lineas = $('lote-texto').value.split('\n').map((l) => l.trim()).filter(Boolean);
  let ignoradas = 0;
  for (const linea of lineas) {
    const partes = linea.split(';').map((t) => t.trim()).filter(Boolean);
    if (partes.length < 3) {
      ignoradas++;
      continue;
    }
    const opciones = partes.slice(1, 5);
    while (opciones.length < 4) opciones.push('');
    borrador.preguntas.push({ id: nuevoId(), texto: partes[0], opciones, correcta: 0 });
  }
  // Quita la pregunta vacía con la que empieza un banco nuevo.
  borrador.preguntas = borrador.preguntas.filter((p, i, todas) => todas.length === 1 || p.texto.trim() || p.opciones.some((o) => o.trim()));
  $('lote-texto').value = '';
  renderEditor();
  if (ignoradas) alert(`${ignoradas} ${ignoradas === 1 ? 'línea no tenía' : 'líneas no tenían'} al menos una pregunta y dos opciones, y no se añadieron.`);
});

function validarBorrador() {
  const errores = [];
  if (!borrador.titulo.trim()) errores.push('Ponle un título al banco.');
  if (!borrador.preguntas.length) errores.push('Añade al menos una pregunta.');
  borrador.preguntas.forEach((p, i) => {
    if (!p.texto.trim()) errores.push(`Pregunta ${i + 1}: falta el enunciado.`);
    if (p.opciones.filter((o) => o.trim()).length < 2) errores.push(`Pregunta ${i + 1}: necesita al menos dos opciones.`);
    if (!p.opciones[p.correcta]?.trim()) errores.push(`Pregunta ${i + 1}: la opción marcada como correcta está vacía.`);
  });
  return errores;
}

function bancoNormalizado() {
  return { id: borrador.id, titulo: borrador.titulo.trim(), preguntas: borrador.preguntas.map(normalizarPregunta) };
}

$('editor-guardar').addEventListener('click', () => {
  const errores = validarBorrador();
  const caja = $('editor-errores');
  if (errores.length) {
    caja.innerHTML = `<strong>Revisa esto antes de guardar:</strong><ul>${errores.map((e) => `<li>${escapar(e)}</li>`).join('')}</ul>`;
    caja.classList.remove('oculto');
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const banco = bancoNormalizado();
  const indice = bancos.findIndex((b) => b.id === banco.id);
  if (indice >= 0) bancos[indice] = banco;
  else bancos.unshift(banco);
  guardarBancos();
  renderBancos();
  mostrar('bancos');
});

$('editor-exportar').addEventListener('click', () => {
  const banco = bancoNormalizado();
  const exportable = { titulo: banco.titulo, preguntas: banco.preguntas.map(({ texto, opciones, correcta }) => ({ texto, opciones, correcta })) };
  descargar(`${nombreArchivo(banco.titulo)}.json`, JSON.stringify(exportable, null, 2), 'application/json');
});

$('editor-volver').addEventListener('click', () => {
  if (borradorEsNuevo && !borrador.titulo.trim() && borrador.preguntas.every((p) => !p.texto.trim())) {
    mostrar('bancos');
    return;
  }
  if (confirm('¿Salir sin guardar los cambios?')) mostrar('bancos');
});

// ---------------------------------------------------------------------------
// Configuración de la partida
// ---------------------------------------------------------------------------

let bancoElegido = null;

function abrirConfiguracion(banco) {
  bancoElegido = banco;
  $('configurar-titulo').textContent = banco.titulo;
  $('configurar-resumen').textContent = `${banco.preguntas.length} preguntas. Cada estudiante las recibe en orden aleatorio y vuelven a salir cuando se acaban.`;
  mostrar('configurar');
}

document.querySelectorAll('input[name="modo"]').forEach((radio) => radio.addEventListener('change', () => {
  const modo = document.querySelector('input[name="modo"]:checked').value;
  $('campo-minutos').classList.toggle('oculto', modo !== 'tiempo');
  $('campo-meta').classList.toggle('oculto', modo !== 'meta');
}));

$('configurar-volver').addEventListener('click', () => mostrar('bancos'));

$('abrir-sala').addEventListener('click', () => {
  estado = {
    codigo: String(Math.floor(100000 + Math.random() * 900000)),
    fase: 'sala',
    titulo: bancoElegido.titulo,
    preguntas: bancoElegido.preguntas.map((p) => ({ ...p, id: p.id || nuevoId() })),
    ajustes: {
      modo: document.querySelector('input[name="modo"]:checked').value,
      minutos: Number($('minutos').value),
      meta: Number($('meta').value),
    },
    finEn: null,
    iniciadaEn: null,
    terminadaEn: null,
    jugadores: {},
    expulsados: [],
    estadisticas: {},
  };
  guardarPartida();
  conectar();
  mostrarFaseActual();
});

// ---------------------------------------------------------------------------
// Partida en vivo
// ---------------------------------------------------------------------------

let estado = null;
let red = null;
let enLinea = new Set();
let temporizador = null;
let ticks = 0;

function guardarPartida() {
  escribir(CLAVE_PARTIDA, estado);
}

let guardadoPendiente = null;
let renderPendiente = false;

// Llamar tras cualquier cambio de estado: guarda (con retraso) y vuelve a pintar la vista activa.
function cambio() {
  clearTimeout(guardadoPendiente);
  guardadoPendiente = setTimeout(guardarPartida, 400);
  if (renderPendiente) return;
  renderPendiente = true;
  // setTimeout y no requestAnimationFrame: este último se congela si el docente cambia de pestaña.
  setTimeout(() => {
    renderPendiente = false;
    if (!estado) return;
    if (estado.fase === 'sala') renderSala();
    else if (estado.fase === 'jugando') renderPartida();
  }, 100);
}

function conectar() {
  red?.cerrar();
  enLinea = new Set();
  red = abrirSala(estado.codigo, {
    clavePresencia: 'docente',
    alMensaje,
    alPresencia: (presencia) => {
      enLinea = new Set(Object.keys(presencia));
      cambio();
    },
    alEstado: (estadoCanal) => {
      const ok = estadoCanal === 'SUBSCRIBED';
      // Supabase solo envía la lista de conectados a quien también se anuncia en el canal.
      if (ok) red.anunciar({ rol: 'docente' });
      $('sala-estado').textContent = ok ? 'Sala abierta. Esperando tripulación…' : 'Sin conexión. Reintentando…';
      $('partida-conexion').textContent = ok ? 'En línea' : 'Reconectando…';
      $('partida-conexion').style.color = ok ? '' : 'var(--error)';
    },
  });
  clearInterval(temporizador);
  temporizador = setInterval(alTic, 500);
}

function mostrarFaseActual() {
  if (estado.fase === 'sala') {
    renderSala();
    mostrar('sala');
  } else if (estado.fase === 'jugando') {
    construirRuta();
    renderPartida();
    mostrar('partida');
  } else {
    renderResultados();
    mostrar('resultados');
  }
}

function infoFase() {
  return {
    fase: estado.fase,
    modo: estado.ajustes.modo,
    meta: estado.ajustes.meta,
    restante: estado.finEn ? estado.finEn - Date.now() : null,
  };
}

function vista(j) {
  return { nombre: j.nombre, combustible: j.combustible, mejoras: j.mejoras, racha: j.racha, aciertos: j.aciertos, fallos: j.fallos };
}

function clasificacion() {
  return Object.values(estado.jugadores).sort((a, b) => b.combustible - a.combustible || b.aciertos - a.aciertos || a.unidoEn - b.unidoEn);
}

function buscarPregunta(id) {
  return estado.preguntas.find((p) => p.id === id);
}

function alMensaje(m) {
  if (!estado || !m || typeof m !== 'object') return;
  if (m.tipo === 'unirse') return manejarUnion(m);
  const jugador = estado.jugadores[m.id];
  if (!jugador) return;
  if (estado.fase === 'terminada') return enviarFinal();
  if (m.tipo === 'siguiente') enviarPregunta(jugador);
  else if (m.tipo === 'responder') manejarRespuesta(jugador, m);
  else if (m.tipo === 'comprar') manejarCompra(jugador, m);
}

function limpiarNombre(nombre) {
  return String(nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 20) || 'Astronauta';
}

function nombreUnico(nombre) {
  const usados = new Set(Object.values(estado.jugadores).map((j) => j.nombre.toLowerCase()));
  if (!usados.has(nombre.toLowerCase())) return nombre;
  let n = 2;
  while (usados.has(`${nombre} ${n}`.toLowerCase())) n++;
  return `${nombre} ${n}`;
}

function manejarUnion(m) {
  const id = String(m.id ?? '').slice(0, 64);
  if (!id) return;
  if (estado.expulsados.includes(id)) {
    red.enviar('bienvenida', { para: id, ok: false, motivo: 'El docente te sacó de esta misión.' });
    return;
  }
  let jugador = estado.jugadores[id];
  if (!jugador) {
    if (estado.fase === 'terminada') {
      red.enviar('bienvenida', { para: id, ok: false, motivo: 'Esta misión ya terminó.' });
      return;
    }
    jugador = {
      id,
      nombre: nombreUnico(limpiarNombre(m.nombre)),
      combustible: 0,
      mejoras: mejorasIniciales(),
      racha: 0,
      aciertos: 0,
      fallos: 0,
      mazo: [],
      ultimaPregunta: null,
      actual: null,
      orden: null,
      ultimoResultado: null,
      ultimaCompra: null,
      unidoEn: Date.now(),
    };
    estado.jugadores[id] = jugador;
    cambio();
  }
  red.enviar('bienvenida', { para: id, ok: true, jugador: vista(jugador), ...infoFase() });
}

function enviarPregunta(jugador) {
  if (estado.fase !== 'jugando') return;
  if (!jugador.actual) {
    if (!jugador.mazo.length) {
      jugador.mazo = barajar(estado.preguntas.map((p) => p.id));
      // Evita que la misma pregunta salga dos veces seguidas al empezar una nueva vuelta.
      if (jugador.mazo.length > 1 && jugador.mazo[0] === jugador.ultimaPregunta) jugador.mazo.push(jugador.mazo.shift());
    }
    const siguiente = buscarPregunta(jugador.mazo.shift());
    jugador.actual = siguiente.id;
    jugador.ultimaPregunta = siguiente.id;
    jugador.orden = barajar(siguiente.opciones.map((_, k) => k));
    cambio();
  }
  const p = buscarPregunta(jugador.actual);
  red.enviar('pregunta', { para: jugador.id, qid: p.id, texto: p.texto, opciones: jugador.orden.map((k) => p.opciones[k]) });
}

function manejarRespuesta(jugador, m) {
  if (estado.fase !== 'jugando') return;
  // Si el resultado se perdió por el camino, el estudiante reenvía la misma respuesta.
  if (jugador.actual !== m.qid) {
    if (jugador.ultimoResultado?.qid === m.qid) red.enviar('resultado', jugador.ultimoResultado);
    return;
  }
  const p = buscarPregunta(m.qid);
  const acierto = jugador.orden[Number(m.eleccion)] === p.correcta;
  let variacion;
  if (acierto) {
    variacion = gananciaAcierto(jugador);
    jugador.racha++;
    jugador.aciertos++;
  } else {
    variacion = -Math.min(jugador.combustible, perdidaFallo(jugador));
    jugador.racha = 0;
    jugador.fallos++;
  }
  jugador.combustible += variacion;
  const estadistica = (estado.estadisticas[p.id] ??= { aciertos: 0, fallos: 0 });
  if (acierto) estadistica.aciertos++;
  else estadistica.fallos++;

  const resultado = {
    para: jugador.id,
    qid: p.id,
    acierto,
    variacion,
    indiceCorrecto: jugador.orden.indexOf(p.correcta),
    jugador: vista(jugador),
  };
  jugador.actual = null;
  jugador.orden = null;
  jugador.ultimoResultado = resultado;
  red.enviar('resultado', resultado);
  cambio();
  if (estado.ajustes.modo === 'meta' && jugador.combustible >= estado.ajustes.meta) terminar();
}

function manejarCompra(jugador, m) {
  if (estado.fase !== 'jugando' || !MEJORAS[m.mejora]) return;
  if (jugador.ultimaCompra?.nonce === m.nonce) {
    red.enviar('compra', jugador.ultimaCompra.respuesta);
    return;
  }
  const costo = costoSiguienteNivel(m.mejora, jugador.mejoras[m.mejora]);
  let ok = false;
  let motivo = '';
  if (costo === null) motivo = 'Esta mejora ya está al máximo.';
  else if (jugador.combustible < costo) motivo = 'No tienes suficiente combustible.';
  else {
    jugador.combustible -= costo;
    jugador.mejoras[m.mejora]++;
    ok = true;
  }
  const respuesta = { para: jugador.id, nonce: m.nonce, ok, motivo, mejora: m.mejora, jugador: vista(jugador) };
  jugador.ultimaCompra = { nonce: m.nonce, respuesta };
  red.enviar('compra', respuesta);
  cambio();
}

function enviarTablero() {
  const orden = clasificacion();
  red.enviar('tablero', {
    ...infoFase(),
    top: orden.slice(0, 5).map((j) => ({ nombre: j.nombre, combustible: j.combustible })),
    posiciones: Object.fromEntries(orden.map((j, i) => [j.id, i + 1])),
    total: orden.length,
  });
}

function enviarFinal() {
  const orden = clasificacion();
  red.enviar('fase', {
    fase: 'terminada',
    top: orden.slice(0, 3).map((j) => ({ nombre: j.nombre, combustible: j.combustible })),
    posiciones: Object.fromEntries(orden.map((j, i) => [j.id, i + 1])),
    total: orden.length,
  });
}

function alTic() {
  if (!estado) return;
  ticks++;
  if (estado.fase === 'jugando') {
    if (estado.finEn && Date.now() >= estado.finEn) {
      terminar();
      return;
    }
    renderReloj();
    if (ticks % 4 === 0) enviarTablero();
  }
}

$('despegar').addEventListener('click', () => {
  estado.fase = 'jugando';
  estado.iniciadaEn = Date.now();
  if (estado.ajustes.modo === 'tiempo') estado.finEn = Date.now() + estado.ajustes.minutos * 60_000;
  red.enviar('fase', infoFase());
  guardarPartida();
  mostrarFaseActual();
});

function terminar() {
  if (!estado || estado.fase === 'terminada') return;
  estado.fase = 'terminada';
  estado.terminadaEn = Date.now();
  for (const jugador of Object.values(estado.jugadores)) {
    jugador.actual = null;
    jugador.orden = null;
  }
  guardarPartida();
  // Se repite por si algún mensaje se pierde; los estudiantes ignoran los duplicados.
  enviarFinal();
  setTimeout(enviarFinal, 2000);
  setTimeout(enviarFinal, 5000);
  mostrarFaseActual();
}

$('terminar').addEventListener('click', () => {
  if (confirm('¿Terminar la misión ahora para toda la clase?')) terminar();
});

$('sala-cancelar').addEventListener('click', () => {
  if (Object.keys(estado.jugadores).length && !confirm('¿Cerrar la sala? Los estudiantes que ya entraron saldrán de la misión.')) return;
  red.enviar('fase', { fase: 'cancelada' });
  cerrarPartida();
});

$('nueva-partida').addEventListener('click', cerrarPartida);

function cerrarPartida() {
  clearInterval(temporizador);
  setTimeout(() => red?.cerrar(), 300);
  estado = null;
  escribir(CLAVE_PARTIDA, null);
  renderBancos();
  mostrar('bancos');
}

window.addEventListener('beforeunload', (evento) => {
  if (estado?.fase === 'jugando') evento.preventDefault();
});

// ---------------------------------------------------------------------------
// Vistas de la partida
// ---------------------------------------------------------------------------

function urlParaEstudiantes() {
  return new URL('jugar.html', location.href).href.replace(/^https?:\/\//, '');
}

function renderSala() {
  $('sala-codigo').textContent = estado.codigo;
  $('sala-url').textContent = urlParaEstudiantes();
  const jugadores = Object.values(estado.jugadores).sort((a, b) => a.unidoEn - b.unidoEn);
  $('sala-contador').textContent = jugadores.length;
  $('despegar').disabled = jugadores.length === 0;
  $('sala-jugadores').innerHTML = jugadores.length
    ? jugadores.map((j) => `
        <span class="chip aparecer ${enLinea.has(j.id) ? '' : 'fuera'}">
          ${escapar(j.nombre)}
          <button data-expulsar="${escapar(j.id)}" aria-label="Sacar a ${escapar(j.nombre)}" title="Sacar de la misión">✕</button>
        </span>`).join('')
    : '<p class="ayuda">Cuando tus estudiantes escriban el código, sus nombres aparecerán aquí.</p>';
}

$('sala-jugadores').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-expulsar]');
  if (!boton) return;
  const id = boton.dataset.expulsar;
  estado.expulsados.push(id);
  delete estado.jugadores[id];
  red.enviar('expulsado', { para: id });
  cambio();
});

function construirRuta() {
  const ruta = $('ruta');
  ruta.innerHTML = '<div class="ruta-linea"></div>' + PLANETAS.map((p, i) => {
    const tamano = 14 + i * 2.2;
    const x = posicionEnRuta(p.meta) * 100;
    return `<div class="planeta" style="left:${x}%;width:${tamano}px;height:${tamano}px;background:${p.color}" title="${p.nombre} · ${formatear(p.meta)}"></div>
            <div class="planeta-nombre" style="left:${x}%">${p.nombre}</div>`;
  }).join('');
}

function iniciales(nombre) {
  const partes = nombre.split(' ').filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? partes[0]?.[1] ?? '')).toUpperCase();
}

const CARRILES = [-44, -70, 44, 70];

function renderPartida() {
  $('partida-codigo').textContent = estado.codigo;
  $('partida-meta').textContent = estado.ajustes.modo === 'meta'
    ? `Meta: ${formatear(estado.ajustes.meta)} de combustible`
    : `Misión de ${estado.ajustes.minutos} minutos`;
  renderReloj();

  const orden = clasificacion();
  const ruta = $('ruta');
  const vivas = new Set();
  orden.forEach((j, i) => {
    vivas.add(j.id);
    let nave = ruta.querySelector(`[data-nave="${CSS.escape(j.id)}"]`);
    if (!nave) {
      nave = document.createElement('div');
      nave.className = 'nave';
      nave.dataset.nave = j.id;
      ruta.appendChild(nave);
    }
    nave.textContent = iniciales(j.nombre);
    nave.title = `${j.nombre} · ${formatear(j.combustible)}`;
    nave.classList.toggle('lider', i === 0 && j.combustible > 0);
    nave.style.left = `${posicionEnRuta(j.combustible) * 100}%`;
    nave.style.top = `calc(50% + ${CARRILES[i % CARRILES.length]}px)`;
    nave.style.zIndex = String(100 - i);
  });
  ruta.querySelectorAll('[data-nave]').forEach((nave) => {
    if (!vivas.has(nave.dataset.nave)) nave.remove();
  });

  const visibles = orden.slice(0, 10);
  $('clasificacion').innerHTML = visibles.map((j, i) => `
    <li>
      <span class="puesto">${i + 1}</span>
      <span class="nombre"><span class="punto-conexion ${enLinea.has(j.id) ? '' : 'fuera'}"></span>${escapar(j.nombre)}
        <span class="sub">${planetaActual(j.combustible).nombre} · ${j.aciertos} aciertos</span></span>
      <span class="cifra-combustible">${formatear(j.combustible)}</span>
    </li>`).join('') + (orden.length > 10 ? `<li class="ayuda" style="display:block">y ${orden.length - 10} más…</li>` : '');

  const aciertos = orden.reduce((s, j) => s + j.aciertos, 0);
  const respuestas = aciertos + orden.reduce((s, j) => s + j.fallos, 0);
  $('cifra-jugadores').textContent = orden.length;
  $('cifra-respuestas').textContent = formatear(respuestas);
  $('cifra-aciertos').textContent = respuestas ? `${Math.round((aciertos / respuestas) * 100)} %` : '—';

  const dificiles = filasPreguntas().filter((f) => f.total >= 3).slice(0, 3);
  $('dificiles').innerHTML = dificiles.length
    ? dificiles.map((f) => `<li>${escapar(f.texto)}<span class="porcentaje">${f.porcentaje} %</span></li>`).join('')
    : '<li class="ayuda" style="list-style:none;margin-left:-20px">Aparecerán cuando haya suficientes respuestas.</li>';
}

function renderReloj() {
  const reloj = $('partida-reloj');
  if (estado.finEn) {
    const restante = estado.finEn - Date.now();
    reloj.textContent = formatearTiempo(restante);
    reloj.classList.toggle('urgente', restante < 30_000);
  } else {
    reloj.textContent = formatearTiempo(Date.now() - estado.iniciadaEn);
    reloj.classList.remove('urgente');
  }
}

function filasPreguntas() {
  return estado.preguntas.map((p) => {
    const e = estado.estadisticas[p.id] ?? { aciertos: 0, fallos: 0 };
    const total = e.aciertos + e.fallos;
    return { texto: p.texto, correcta: p.opciones[p.correcta], total, aciertos: e.aciertos, porcentaje: total ? Math.round((e.aciertos / total) * 100) : null };
  }).sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101));
}

function renderResultados() {
  const orden = clasificacion();
  const medallas = ['🥇', '🥈', '🥉'];
  $('podio').innerHTML = orden.length
    ? orden.slice(0, 3).map((j, i) => `
        <div class="escalon p${i + 1} aparecer" style="animation-delay:${(2 - i) * 120}ms">
          <div class="medalla">${medallas[i]}</div>
          <div class="nombre">${escapar(j.nombre)}</div>
          <div class="cifra-combustible">${formatear(j.combustible)}</div>
          <div class="ayuda">${planetaActual(j.combustible).nombre}</div>
        </div>`).join('')
    : '<p class="ayuda">Nadie se unió a esta misión.</p>';

  $('tabla-estudiantes').innerHTML = `
    <thead><tr><th>#</th><th>Nombre</th><th class="num">Combustible</th><th class="num">Aciertos</th><th class="num">Fallos</th><th class="num">% aciertos</th></tr></thead>
    <tbody>${orden.map((j, i) => {
      const total = j.aciertos + j.fallos;
      return `<tr><td>${i + 1}</td><td>${escapar(j.nombre)}</td><td class="num">${formatear(j.combustible)}</td><td class="num">${j.aciertos}</td><td class="num">${j.fallos}</td><td class="num">${total ? Math.round((j.aciertos / total) * 100) + ' %' : '—'}</td></tr>`;
    }).join('')}</tbody>`;

  $('tabla-preguntas').innerHTML = `
    <thead><tr><th>Pregunta</th><th class="num">Respuestas</th><th class="num">% aciertos</th></tr></thead>
    <tbody>${filasPreguntas().map((f) => `
      <tr><td>${escapar(f.texto)}<br><span class="ayuda">Correcta: ${escapar(f.correcta)}</span></td><td class="num">${f.total}</td><td class="num">${f.porcentaje === null ? '—' : f.porcentaje + ' %'}</td></tr>`).join('')}</tbody>`;
}

$('descargar-csv').addEventListener('click', () => {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const filas = [
    [`Misión: ${estado.titulo}`, new Date(estado.iniciadaEn ?? Date.now()).toLocaleString('es')],
    [],
    ['Puesto', 'Nombre', 'Combustible', 'Aciertos', 'Fallos', '% aciertos'],
    ...clasificacion().map((j, i) => {
      const total = j.aciertos + j.fallos;
      return [i + 1, j.nombre, j.combustible, j.aciertos, j.fallos, total ? Math.round((j.aciertos / total) * 100) : ''];
    }),
    [],
    ['Pregunta', 'Respuesta correcta', 'Respuestas', 'Aciertos', '% aciertos'],
    ...filasPreguntas().map((f) => [f.texto, f.correcta, f.total, f.aciertos, f.porcentaje ?? '']),
  ];
  // Punto y coma y BOM para que Excel en español lo abra con columnas y tildes correctas.
  const csv = '﻿' + filas.map((fila) => fila.map(celda).join(';')).join('\r\n');
  descargar(`resultados-${nombreArchivo(estado.titulo)}.csv`, csv, 'text/csv;charset=utf-8');
});

// ---------------------------------------------------------------------------
// Reanudar una partida guardada en este navegador
// ---------------------------------------------------------------------------

function renderAvisoReanudar() {
  const aviso = $('aviso-reanudar');
  const guardada = estado ? null : leer(CLAVE_PARTIDA, null);
  if (!guardada) {
    aviso.classList.add('oculto');
    return;
  }
  const n = Object.keys(guardada.jugadores ?? {}).length;
  const descripcion = guardada.fase === 'terminada'
    ? `Resultados de la última misión: «${escapar(guardada.titulo)}» (${n} estudiantes).`
    : `Tienes una misión abierta: «${escapar(guardada.titulo)}», código <strong>${escapar(guardada.codigo)}</strong>, ${n} estudiantes.`;
  aviso.innerHTML = `<span>${descripcion}</span>
    <span class="fila">
      <button class="boton pequeno" id="reanudar">${guardada.fase === 'terminada' ? 'Ver resultados' : 'Reanudar'}</button>
      <button class="boton secundario pequeno" id="descartar">Descartar</button>
    </span>`;
  aviso.classList.remove('oculto');
  $('reanudar').addEventListener('click', () => {
    estado = guardada;
    if (estado.fase !== 'terminada') conectar();
    mostrarFaseActual();
  });
  $('descartar').addEventListener('click', () => {
    if (!confirm('¿Descartar esta misión guardada?')) return;
    escribir(CLAVE_PARTIDA, null);
    renderAvisoReanudar();
  });
}

renderBancos();
mostrar('bancos');
