// Pantalla del estudiante. No conoce las respuestas correctas: envía su elección
// al navegador del docente y muestra lo que este le devuelve.
import {
  MEJORAS, LETRAS, RACHA_MAXIMA, gananciaAcierto, perdidaFallo, costoSiguienteNivel, planetaActual, siguientePlaneta,
  formatear, formatearTiempo, escapar, nuevoId,
} from './juego.js';
import { abrirSala } from './red.js';

const $ = (id) => document.getElementById(id);
const PANTALLAS = ['unirse', 'espera', 'juego', 'fin'];
const ESPERA_REINTENTO = 4000;

function mostrar(pantalla) {
  for (const nombre of PANTALLAS) $(`pantalla-${nombre}`).classList.toggle('oculto', nombre !== pantalla);
  window.scrollTo(0, 0);
}

function leer(clave) {
  try { return JSON.parse(localStorage.getItem(clave)); } catch { return null; }
}

function escribir(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
}

let codigo = '';
let yo = null; // { id, nombre }
let red = null;
let fase = 'unirse';
let jugador = null;
let pregunta = null;
let pidiendo = false;
let respuestaPendiente = null;
let compraPendiente = null;
let finLocal = null;
let modo = 'tiempo';
let meta = 0;
let puesto = null;
let total = null;
let reintentosUnion = null;
let temporizadorReintento = null;

// ---------------------------------------------------------------------------
// Unirse
// ---------------------------------------------------------------------------

const parametros = new URLSearchParams(location.search);
const codigoUrl = (parametros.get('sala') ?? '').replace(/\D/g, '').slice(0, 6);
$('unirse-codigo').value = codigoUrl;
const guardado = codigoUrl ? leer(`orbita.yo.${codigoUrl}`) : null;
if (guardado?.nombre) $('unirse-nombre').value = guardado.nombre;
($('unirse-codigo').value ? $('unirse-nombre') : $('unirse-codigo')).focus();

function mostrarErrorUnion(texto) {
  const caja = $('unirse-error');
  caja.textContent = texto;
  caja.classList.toggle('oculto', !texto);
  $('unirse-boton').disabled = false;
  $('unirse-boton').textContent = 'Unirme';
}

$('form-unirse').addEventListener('submit', (evento) => {
  evento.preventDefault();
  const valorCodigo = $('unirse-codigo').value.replace(/\D/g, '');
  const nombre = $('unirse-nombre').value.replace(/\s+/g, ' ').trim();
  if (valorCodigo.length !== 6) return mostrarErrorUnion('El código tiene 6 números.');
  if (!nombre) return mostrarErrorUnion('Escribe tu nombre.');
  unirse(valorCodigo, nombre);
});

function unirse(valorCodigo, nombre) {
  mostrarErrorUnion('');
  $('unirse-boton').disabled = true;
  $('unirse-boton').textContent = 'Buscando la misión…';
  codigo = valorCodigo;
  const anterior = leer(`orbita.yo.${codigo}`);
  // Si vuelve a entrar con el mismo nombre (p. ej. tras recargar), recupera su progreso.
  yo = { id: anterior && anterior.nombre === nombre ? anterior.id : nuevoId(), nombre };
  escribir(`orbita.yo.${codigo}`, yo);
  history.replaceState(null, '', `?sala=${codigo}`);

  red?.cerrar();
  try {
    red = abrirSala(codigo, { clavePresencia: yo.id, alMensaje, alEstado });
  } catch (error) {
    mostrarErrorUnion(error.message);
    return;
  }
  reintentosUnion = 0;
}

function alEstado(estadoCanal) {
  if (estadoCanal !== 'SUBSCRIBED') return;
  red.anunciar({ nombre: yo.nombre });
  if (fase === 'unirse') enviarUnion();
  else if (fase === 'jugando' && !pregunta && !respuestaPendiente) pedirPregunta();
}

function enviarUnion() {
  if (fase !== 'unirse' || reintentosUnion === null) return;
  if (reintentosUnion >= 5) {
    reintentosUnion = null;
    red.cerrar();
    red = null;
    mostrarErrorUnion('No encontramos esa misión. Revisa el código y que tu docente tenga la sala abierta.');
    return;
  }
  reintentosUnion++;
  red.enviar('unirse', { id: yo.id, nombre: yo.nombre });
  setTimeout(enviarUnion, 2500);
}

// ---------------------------------------------------------------------------
// Mensajes del docente
// ---------------------------------------------------------------------------

function alMensaje(m) {
  if (!m || typeof m !== 'object') return;
  if (m.para && m.para !== yo.id) return;
  switch (m.tipo) {
    case 'bienvenida': return alBienvenida(m);
    case 'fase': return aplicarFase(m);
    case 'tablero': return alTablero(m);
    case 'pregunta': return alPregunta(m);
    case 'resultado': return alResultado(m);
    case 'compra': return alCompra(m);
    case 'expulsado': return salir('Tu docente te sacó de esta misión.');
  }
}

function alBienvenida(m) {
  if (fase !== 'unirse') return;
  reintentosUnion = null;
  if (!m.ok) {
    red.cerrar();
    red = null;
    mostrarErrorUnion(m.motivo || 'No pudiste entrar en la misión.');
    return;
  }
  jugador = m.jugador;
  yo.nombre = jugador.nombre;
  $('espera-nombre').textContent = jugador.nombre;
  $('espera-codigo').textContent = codigo;
  fase = 'espera';
  mostrar('espera');
  aplicarFase(m);
}

function aplicarFase(m) {
  if (fase === 'unirse' || fase === 'fin') return;
  if (m.restante != null) finLocal = Date.now() + m.restante;
  if (m.modo) modo = m.modo;
  if (m.meta) meta = m.meta;
  if (m.fase === 'jugando' && fase !== 'jugando') {
    fase = 'jugando';
    mostrar('juego');
    renderTablero();
    pedirPregunta();
  } else if (m.fase === 'terminada') {
    mostrarFin(m);
  } else if (m.fase === 'cancelada') {
    salir('Tu docente cerró la sala.');
  }
}

function alTablero(m) {
  if (m.fase === 'jugando' && fase === 'espera') aplicarFase(m);
  if (fase !== 'jugando') return;
  if (m.restante != null) finLocal = Date.now() + m.restante;
  puesto = m.posiciones?.[yo.id] ?? puesto;
  total = m.total ?? total;
  renderTablero();
}

function salir(motivo) {
  red?.cerrar();
  red = null;
  fase = 'unirse';
  pregunta = null;
  respuestaPendiente = null;
  $('hangar').classList.add('oculto');
  mostrar('unirse');
  mostrarErrorUnion(motivo);
}

// ---------------------------------------------------------------------------
// Preguntas
// ---------------------------------------------------------------------------

function pedirPregunta() {
  if (fase !== 'jugando') return;
  pregunta = null;
  pidiendo = true;
  $('pregunta-texto').textContent = 'Preparando la siguiente pregunta…';
  $('pregunta-opciones').innerHTML = '';
  $('feedback').classList.add('oculto');
  red?.enviar('siguiente', { id: yo.id });
  programarReintento(() => pidiendo && !pregunta, pedirPregunta);
}

function programarReintento(sigueEsperando, accion) {
  clearTimeout(temporizadorReintento);
  temporizadorReintento = setTimeout(() => {
    if (fase === 'jugando' && sigueEsperando()) accion();
  }, ESPERA_REINTENTO);
}

function alPregunta(m) {
  if (fase !== 'jugando' || respuestaPendiente) return;
  // Ignora copias atrasadas de una pregunta ya respondida.
  if (!pidiendo && pregunta?.qid !== m.qid) return;
  pidiendo = false;
  pregunta = { qid: m.qid, texto: m.texto, opciones: m.opciones };
  $('feedback').classList.add('oculto');
  $('pregunta-texto').textContent = m.texto;
  $('pregunta-opciones').innerHTML = m.opciones.map((texto, i) => `
    <button class="opcion aparecer" data-i="${i}" style="animation-delay:${i * 40}ms">
      <span class="letra">${LETRAS[i]}</span><span class="texto">${escapar(texto)}</span>
    </button>`).join('');
  renderGanancia();
}

$('pregunta-opciones').addEventListener('click', (evento) => {
  const boton = evento.target.closest('.opcion');
  if (!boton || !pregunta || respuestaPendiente) return;
  respuestaPendiente = { qid: pregunta.qid, eleccion: Number(boton.dataset.i) };
  $('pregunta-opciones').querySelectorAll('.opcion').forEach((b) => {
    b.disabled = true;
    if (b !== boton) b.classList.add('atenuada');
  });
  enviarRespuesta();
});

function enviarRespuesta() {
  if (!respuestaPendiente) return;
  red?.enviar('responder', { id: yo.id, ...respuestaPendiente });
  programarReintento(() => respuestaPendiente, enviarRespuesta);
}

function alResultado(m) {
  if (!respuestaPendiente || m.qid !== respuestaPendiente.qid) return;
  const elegida = respuestaPendiente.eleccion;
  respuestaPendiente = null;
  pregunta = null;
  clearTimeout(temporizadorReintento);
  jugador = m.jugador;

  const botones = $('pregunta-opciones').querySelectorAll('.opcion');
  botones.forEach((b, i) => {
    b.classList.remove('atenuada');
    if (i === m.indiceCorrecto) b.classList.add('correcta');
    else if (i === elegida) b.classList.add('incorrecta');
    else b.classList.add('atenuada');
  });

  const feedback = $('feedback');
  feedback.className = `feedback aparecer ${m.acierto ? 'bien' : 'mal'}`;
  if (m.acierto) feedback.textContent = `¡Correcto! +${formatear(m.variacion)} de combustible`;
  else if (m.variacion < 0) feedback.textContent = `Incorrecto. Pierdes ${formatear(-m.variacion)} de combustible`;
  else if (perdidaFallo(jugador) === 0) feedback.textContent = 'Incorrecto, pero tu blindaje te protegió.';
  else feedback.textContent = 'Incorrecto. Tu tanque estaba vacío, así que no pierdes nada.';

  renderTablero(true);
  setTimeout(pedirPregunta, m.acierto ? 1200 : 2400);
}

// ---------------------------------------------------------------------------
// Tablero superior
// ---------------------------------------------------------------------------

function renderTablero(animar = false) {
  if (!jugador) return;
  const cifra = $('juego-combustible');
  cifra.textContent = formatear(jugador.combustible);
  if (animar) {
    cifra.classList.remove('latido');
    void cifra.offsetWidth;
    cifra.classList.add('latido');
  }
  $('juego-puesto').textContent = puesto ? `${puesto}.º de ${total}` : '—';

  const actual = planetaActual(jugador.combustible);
  const siguiente = siguientePlaneta(jugador.combustible);
  $('juego-planeta').textContent = `📍 ${actual.nombre}`;
  if (siguiente) {
    const avance = (jugador.combustible - actual.meta) / (siguiente.meta - actual.meta);
    $('juego-progreso').style.width = `${Math.max(2, avance * 100)}%`;
    $('juego-siguiente').textContent = `${siguiente.nombre} · ${formatear(siguiente.meta)}`;
  } else {
    $('juego-progreso').style.width = '100%';
    $('juego-siguiente').textContent = '¡Fin de la ruta!';
  }

  $('juego-racha').textContent = jugador.racha > 0
    ? `Racha ×${jugador.racha} · +${Math.min(jugador.racha, RACHA_MAXIMA) * 10} %`
    : 'Sin racha';
  renderGanancia();
  renderReloj();
  if (!$('hangar').classList.contains('oculto')) renderHangar();
}

function renderGanancia() {
  if (jugador) $('juego-ganancia').textContent = `Siguiente acierto: +${formatear(gananciaAcierto(jugador))}`;
}

function renderReloj() {
  const reloj = $('juego-reloj');
  if (modo === 'meta') {
    $('juego-reloj-etiqueta').textContent = 'Meta';
    reloj.textContent = formatear(meta);
    return;
  }
  $('juego-reloj-etiqueta').textContent = 'Tiempo';
  if (!finLocal) return;
  const restante = finLocal - Date.now();
  reloj.textContent = formatearTiempo(restante);
  reloj.classList.toggle('urgente', restante < 30_000);
}

setInterval(() => { if (fase === 'jugando') renderReloj(); }, 500);

// ---------------------------------------------------------------------------
// Hangar
// ---------------------------------------------------------------------------

$('abrir-hangar').addEventListener('click', () => {
  $('hangar-aviso').classList.add('oculto');
  renderHangar();
  $('hangar').classList.remove('oculto');
  $('cerrar-hangar').focus();
});

function cerrarHangar() {
  $('hangar').classList.add('oculto');
  $('abrir-hangar').focus();
}

$('cerrar-hangar').addEventListener('click', cerrarHangar);
$('hangar').addEventListener('click', (e) => { if (e.target === $('hangar')) cerrarHangar(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('hangar').classList.contains('oculto')) cerrarHangar(); });

function renderHangar() {
  $('hangar-mejoras').innerHTML = Object.entries(MEJORAS).map(([clave, mejora]) => {
    const nivel = jugador.mejoras[clave];
    const costo = costoSiguienteNivel(clave, nivel);
    const puede = costo !== null && jugador.combustible >= costo && !compraPendiente;
    return `
      <div class="mejora">
        <div class="icono" aria-hidden="true">${mejora.icono}</div>
        <div>
          <h3>${mejora.nombre}</h3>
          <div class="niveles" aria-label="Nivel ${nivel + 1} de ${mejora.valores.length}">
            ${mejora.valores.map((_, i) => `<span class="${i <= nivel ? 'lleno' : ''}"></span>`).join('')}
          </div>
          <div class="valores">${mejora.descripcion}<br>
            Ahora: <strong>${mejora.formato(mejora.valores[nivel])}</strong>
            ${costo !== null ? ` → <strong>${mejora.formato(mejora.valores[nivel + 1])}</strong>` : ''}
          </div>
        </div>
        <button class="boton ${puede ? 'combustible' : 'secundario'}" data-mejora="${clave}" ${puede ? '' : 'disabled'}>
          ${costo === null ? 'Al máximo' : `Mejorar · ${formatear(costo)}`}
        </button>
      </div>`;
  }).join('');
}

$('hangar-mejoras').addEventListener('click', (e) => {
  const boton = e.target.closest('[data-mejora]');
  if (!boton || compraPendiente) return;
  compraPendiente = { mejora: boton.dataset.mejora, nonce: nuevoId(), intentos: 0 };
  $('hangar-aviso').classList.add('oculto');
  renderHangar();
  enviarCompra();
});

function enviarCompra() {
  if (!compraPendiente) return;
  if (compraPendiente.intentos >= 3) {
    compraPendiente = null;
    mostrarAvisoHangar('No hubo respuesta. Revisa tu conexión e inténtalo de nuevo.');
    renderHangar();
    return;
  }
  compraPendiente.intentos++;
  red?.enviar('comprar', { id: yo.id, mejora: compraPendiente.mejora, nonce: compraPendiente.nonce });
  setTimeout(() => { if (compraPendiente) enviarCompra(); }, ESPERA_REINTENTO);
}

function alCompra(m) {
  if (!compraPendiente || m.nonce !== compraPendiente.nonce) return;
  compraPendiente = null;
  jugador = m.jugador;
  if (!m.ok) mostrarAvisoHangar(m.motivo);
  renderTablero(m.ok);
  renderHangar();
}

function mostrarAvisoHangar(texto) {
  const aviso = $('hangar-aviso');
  aviso.textContent = texto;
  aviso.classList.remove('oculto');
}

// ---------------------------------------------------------------------------
// Fin
// ---------------------------------------------------------------------------

function mostrarFin(m) {
  if (fase === 'fin') return;
  fase = 'fin';
  clearTimeout(temporizadorReintento);
  $('hangar').classList.add('oculto');
  const miPuesto = m.posiciones?.[yo.id];
  $('fin-puesto').textContent = miPuesto ? `${miPuesto}.º` : '—';
  $('fin-total').textContent = m.total ? `de ${m.total} ${m.total === 1 ? 'astronauta' : 'astronautas'}` : '';
  $('fin-combustible').textContent = formatear(jugador?.combustible ?? 0);
  $('fin-aciertos').textContent = jugador ? `${jugador.aciertos}/${jugador.aciertos + jugador.fallos}` : '0';
  $('fin-planeta').textContent = planetaActual(jugador?.combustible ?? 0).nombre;
  $('fin-podio').innerHTML = (m.top ?? []).map((j, i) => `
    <li><span class="puesto">${i + 1}</span><span class="nombre">${escapar(j.nombre)}</span><span class="cifra-combustible">${formatear(j.combustible)}</span></li>`).join('');
  mostrar('fin');
  setTimeout(() => { red?.cerrar(); red = null; }, 6000);
}

// Al recargar la página con un código guardado, vuelve a entrar automáticamente.
if (guardado?.id && guardado.nombre) unirse(codigoUrl, guardado.nombre);
