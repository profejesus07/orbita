// Canal en tiempo real de una sala. Todos los mensajes viajan como un único evento
// de difusión "msg" con un campo `tipo`; los dirigidos a un estudiante llevan `para`.
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';

let cliente = null;

function obtenerCliente() {
  if (!cliente) {
    if (!window.supabase) throw new Error('No se pudo cargar la librería de Supabase. Revisa tu conexión a internet.');
    cliente = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      realtime: { params: { eventsPerSecond: 30 } },
    });
  }
  return cliente;
}

export function abrirSala(codigo, { clavePresencia, alMensaje, alPresencia, alEstado }) {
  const supabase = obtenerCliente();
  const canal = supabase.channel(`orbita-${codigo}`, {
    config: { broadcast: { self: false }, presence: { key: clavePresencia } },
  });
  let conectado = false;

  canal.on('broadcast', { event: 'msg' }, ({ payload }) => alMensaje(payload));
  // Supabase solo activa la presencia en canales con un escuchador de presencia, así que siempre se registra uno.
  canal.on('presence', { event: 'sync' }, () => alPresencia?.(canal.presenceState()));

  canal.subscribe((estado) => {
    conectado = estado === 'SUBSCRIBED';
    alEstado?.(estado);
  });

  return {
    get conectado() {
      return conectado;
    },
    enviar(tipo, datos = {}) {
      if (!conectado) return Promise.resolve('no-conectado');
      return canal.send({ type: 'broadcast', event: 'msg', payload: { tipo, ...datos } });
    },
    anunciar(datos) {
      return canal.track(datos);
    },
    cerrar() {
      supabase.removeChannel(canal);
    },
  };
}
