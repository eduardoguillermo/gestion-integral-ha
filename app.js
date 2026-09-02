// ============================================================
// GESTIÓN INTEGRAL DE HA — v0.01
// ============================================================
const APP_VERSION = "0.01-dev";
const STORAGE_KEY = "giha_items";
const SNAPSHOT_KEY = "giha_snapshots";
const DRIVE_TOKEN_KEY = "giha_drive_token";
const MAX_SNAPSHOTS = 10;

const DRIVE_CLIENT_ID = "1049169592532-is5j1j4s1bmgrc9tsq48slrgul8fbj17.apps.googleusercontent.com";
const DRIVE_SCOPES = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "GestionIntegralHA";
const DRIVE_FILE_NAME = "data.json";

// Días sin cambio de batería a partir de los cuales se considera "batería baja".
const UMBRAL_BATERIA_DIAS = 180;

const TIPOS = {
  zigbee:   { label: "Zigbee",   icono: "📡" },
  esphome:  { label: "ESPHome",  icono: "🔧" },
  tasmota:  { label: "Tasmota",  icono: "⚡" },
  miflora:  { label: "Mi Flora", icono: "🌱" },
  zwave:    { label: "Z-Wave",   icono: "📶" },
  generico: { label: "Genérico", icono: "🔘" },
};
const BATERIAS = { cr2032: "CR2032", aa: "AA", aaa: "AAA", recargable: "Recargable", na: "N/A - cableado" };

let items = [];
let editingId = null;      // id en edición dentro del form (null = alta nueva)
let fichaAbiertaId = null; // id de la ficha actualmente abierta
let reemplazandoId = null; // si el form de alta viene desde "Reemplazar", el id del dispositivo viejo
let filtroTipo = "todos";
let lastAction = null; // for undo

// ---------- utils ----------
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function hoyYMD() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function fmtFecha(dateStr) {
  if (!dateStr) return "sin fecha";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function diasDesde(dateStr) {
  if (!dateStr) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((hoy - target) / 86400000);
}

function activos() {
  return items.filter(it => !it.deleted);
}

// Último hito relevante para el cálculo de batería: el cambio más reciente,
// o si nunca se cambió, la fecha de instalación.
function ultimoCambioBateria(it) {
  const cambios = (it.historial || []).filter(h => h.tipo === "cambio_bateria");
  if (cambios.length) return cambios[cambios.length - 1].fecha;
  return it.fechaInstalacion || null;
}

function estadoDispositivo(it) {
  if (it.reemplazadoPorId) return "reemplazado";
  if (it.fueraDeServicio) return "fuera_servicio";
  if (it.bateria !== "na") {
    const dias = diasDesde(ultimoCambioBateria(it));
    if (dias !== null && dias >= UMBRAL_BATERIA_DIAS) return "bateria_baja";
  }
  return "activo";
}

function badgeInfo(estado) {
  switch (estado) {
    case "bateria_baja":   return { cls: "warn",   txt: "Batería baja" };
    case "fuera_servicio": return { cls: "danger", txt: "Fuera de servicio" };
    case "reemplazado":    return { cls: "muted",  txt: "Reemplazado" };
    default:               return { cls: "ok",     txt: "Activo" };
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// ---------- storage ----------
function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    items = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Error leyendo storage", e);
    items = [];
  }
}

function saveItems() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  saveSnapshot();
  render();
  if (typeof DriveSync !== "undefined" && DriveSync.conectado()) {
    DriveSync.sync(); // fire and forget, en segundo plano
  }
}

function saveSnapshot() {
  try {
    let snaps = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
    snaps.push({ t: Date.now(), data: items });
    if (snaps.length > MAX_SNAPSHOTS) snaps = snaps.slice(snaps.length - MAX_SNAPSHOTS);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snaps));
  } catch (e) {
    console.error("Error guardando snapshot", e);
  }
}

// ---------- render: filtros de tipo ----------
function renderFiltros() {
  const wrap = document.getElementById("filtrosTipo");
  const tiposEnUso = new Set(activos().map(it => it.tipo));
  let html = `<span class="chip ${filtroTipo === "todos" ? "active" : ""}" data-tipo="todos">Todos</span>`;
  Object.keys(TIPOS).forEach(t => {
    if (!tiposEnUso.has(t)) return;
    html += `<span class="chip ${filtroTipo === t ? "active" : ""}" data-tipo="${t}">${TIPOS[t].label}</span>`;
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => { filtroTipo = chip.dataset.tipo; render(); });
  });
}

// ---------- render: lista principal ----------
function render() {
  const q = (document.getElementById("search").value || "").toLowerCase().trim();
  const base = activos();

  const filtered = base.filter(it => {
    if (filtroTipo !== "todos" && it.tipo !== filtroTipo) return false;
    if (!q) return true;
    const enEntidades = (it.entidades || []).some(e => e.toLowerCase().includes(q));
    return it.nombre.toLowerCase().includes(q) || enEntidades;
  }).sort((a, b) => {
    const ea = estadoDispositivo(a), eb = estadoDispositivo(b);
    if (ea === "reemplazado" && eb !== "reemplazado") return 1;
    if (eb === "reemplazado" && ea !== "reemplazado") return -1;
    return a.nombre.localeCompare(b.nombre);
  });

  const list = document.getElementById("list");
  list.innerHTML = "";
  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${base.length === 0 ? "Todavía no cargaste dispositivos." : "Sin resultados."}</div>`;
  } else {
    filtered.forEach(it => list.appendChild(renderItem(it)));
  }

  renderFiltros();

  // métricas
  document.getElementById("mActivos").textContent = base.filter(it => estadoDispositivo(it) === "activo").length;
  document.getElementById("mBateriaBaja").textContent = base.filter(it => estadoDispositivo(it) === "bateria_baja").length;
  document.getElementById("mReemplazados").textContent = base.filter(it => estadoDispositivo(it) === "reemplazado").length;
  document.getElementById("mFueraServicio").textContent = base.filter(it => estadoDispositivo(it) === "fuera_servicio").length;
}

function renderItem(it) {
  const div = document.createElement("div");
  const estado = estadoDispositivo(it);
  div.className = "item" + (estado === "reemplazado" ? " reemplazado" : "");
  const badge = badgeInfo(estado);
  const tipoInfo = TIPOS[it.tipo] || TIPOS.generico;
  const metaExtra = estado === "bateria_baja" ? ` · hace ${diasDesde(ultimoCambioBateria(it))} días` : "";

  div.innerHTML = `
    <span class="icono">${tipoInfo.icono}</span>
    <div class="info">
      <p class="name">${escapeHtml(it.nombre)}</p>
      <p class="meta">${escapeHtml(it.ubicacion || "sin ubicación")} · ${BATERIAS[it.bateria] || it.bateria}${metaExtra}</p>
    </div>
    <span class="badge ${badge.cls}">${badge.txt}</span>
  `;
  div.addEventListener("click", () => abrirFicha(it.id));
  return div;
}

// ---------- form: entidades dinámicas ----------
function renderEntidadesInputs(valores) {
  const wrap = document.getElementById("entidadesWrap");
  wrap.innerHTML = "";
  const lista = (valores && valores.length) ? valores : [""];
  lista.forEach(v => agregarFilaEntidad(v));
}

function agregarFilaEntidad(valor) {
  const wrap = document.getElementById("entidadesWrap");
  const row = document.createElement("div");
  row.className = "entidad-row";
  row.innerHTML = `
    <input type="text" class="entidad-input" placeholder="binary_sensor.puerta_cocina" value="${escapeHtml(valor || "")}">
    <button type="button" class="quitar">✕</button>
  `;
  row.querySelector(".quitar").addEventListener("click", () => {
    if (wrap.children.length > 1) row.remove();
    else row.querySelector(".entidad-input").value = "";
  });
  wrap.appendChild(row);
}

document.getElementById("btnAgregarEntidad").addEventListener("click", () => agregarFilaEntidad(""));

function leerEntidadesForm() {
  return Array.from(document.querySelectorAll(".entidad-input"))
    .map(inp => inp.value.trim())
    .filter(v => v);
}

// ---------- form: abrir / cerrar / guardar ----------
function openForm(id, reemplazaAId) {
  editingId = id || null;
  reemplazandoId = reemplazaAId || null;
  const it = id ? items.find(i => i.id === id) : null;

  document.getElementById("formTitle").textContent = it ? "Editar dispositivo" : (reemplazaAId ? "Cargar dispositivo nuevo" : "Agregar dispositivo");
  document.getElementById("fNombre").value = it ? it.nombre : "";
  document.getElementById("fTipo").value = it ? it.tipo : "zigbee";
  document.getElementById("fUbicacion").value = it ? (it.ubicacion || "") : "";
  document.getElementById("fFechaInstalacion").value = it ? (it.fechaInstalacion || "") : hoyYMD();
  document.getElementById("fBateria").value = it ? it.bateria : "cr2032";
  document.getElementById("fNotas").value = it ? (it.notas || "") : "";
  renderEntidadesInputs(it ? it.entidades : []);

  document.getElementById("formOverlay").classList.add("show");
}

function closeForm() {
  document.getElementById("formOverlay").classList.remove("show");
  editingId = null;
  reemplazandoId = null;
}

document.getElementById("fab").addEventListener("click", () => openForm(null));
document.getElementById("btnCancelForm").addEventListener("click", closeForm);

document.getElementById("btnSaveForm").addEventListener("click", () => {
  const nombre = document.getElementById("fNombre").value.trim();
  if (!nombre) { alert("Ingresá el nombre del dispositivo"); return; }

  const fechaInstalacion = document.getElementById("fFechaInstalacion").value || hoyYMD();
  const data = {
    nombre,
    tipo: document.getElementById("fTipo").value,
    ubicacion: document.getElementById("fUbicacion").value.trim(),
    entidades: leerEntidadesForm(),
    fechaInstalacion,
    bateria: document.getElementById("fBateria").value,
    notas: document.getElementById("fNotas").value.trim(),
    lastModified: Date.now(),
  };

  if (editingId) {
    const it = items.find(i => i.id === editingId);
    if (it) Object.assign(it, data);
    closeForm();
    saveItems();
    showToast(`${nombre} actualizado`);
  } else {
    const nuevo = {
      id: uuid(),
      ...data,
      reemplazadoPorId: null,
      reemplazaAId: reemplazandoId || null,
      fueraDeServicio: false,
      deleted: false,
      historial: [{ tipo: "instalado", fecha: fechaInstalacion, detalle: "Instalado" }],
    };
    items.push(nuevo);

    if (reemplazandoId) {
      const viejo = items.find(i => i.id === reemplazandoId);
      if (viejo) {
        viejo.reemplazadoPorId = nuevo.id;
        viejo.lastModified = Date.now();
        viejo.historial.push({ tipo: "reemplazo", fecha: fechaInstalacion, detalle: `Reemplazado por ${nombre}` });
      }
    }

    closeForm();
    saveItems();
    showToast(`${nombre} agregado`);
    if (reemplazandoId) abrirFicha(nuevo.id);
  }
});

// ---------- ficha de dispositivo ----------
function abrirFicha(id) {
  fichaAbiertaId = id;
  const it = items.find(i => i.id === id);
  if (!it) return;

  const estado = estadoDispositivo(it);
  const badge = badgeInfo(estado);
  const tipoInfo = TIPOS[it.tipo] || TIPOS.generico;

  document.getElementById("fichaNombre").textContent = it.nombre;
  const badgeEl = document.getElementById("fichaEstadoBadge");
  badgeEl.textContent = badge.txt;
  badgeEl.className = "badge " + badge.cls;
  document.getElementById("fichaMeta").textContent =
    `${it.ubicacion || "sin ubicación"} · ${tipoInfo.label}` + ((it.entidades || []).length ? " · " + it.entidades.join(", ") : "");

  // acciones disponibles según estado
  const esReemplazado = estado === "reemplazado";
  document.getElementById("btnCambiarBateria").style.display = (!esReemplazado && it.bateria !== "na") ? "flex" : "none";
  document.getElementById("btnReemplazar").style.display = !esReemplazado ? "flex" : "none";
  document.getElementById("btnFueraServicio").style.display = (!esReemplazado && !it.fueraDeServicio) ? "flex" : "none";
  document.getElementById("btnReactivar").style.display = (!esReemplazado && it.fueraDeServicio) ? "flex" : "none";

  // timeline (más reciente primero)
  const timeline = document.getElementById("fichaTimeline");
  const eventos = [...(it.historial || [])].reverse();
  timeline.innerHTML = eventos.map(ev => {
    const dotCls = ev.tipo === "instalado" ? "hito" : (ev.tipo === "bateria_baja_detectada" ? "warn" : "");
    return `<div class="timeline-item"><div class="dot ${dotCls}"></div><p class="titulo">${escapeHtml(ev.detalle)}</p><p class="fecha">${fmtFecha(ev.fecha)}</p></div>`;
  }).join("");

  // link a reemplazo (si aplica)
  const linkWrap = document.getElementById("fichaLinkReemplazo");
  if (it.reemplazadoPorId) {
    const nuevo = items.find(i => i.id === it.reemplazadoPorId);
    linkWrap.style.display = "block";
    linkWrap.textContent = nuevo ? `→ Reemplazado por: ${nuevo.nombre}` : "→ Reemplazado (dispositivo no encontrado)";
    linkWrap.onclick = () => { if (nuevo) abrirFicha(nuevo.id); };
  } else if (it.reemplazaAId) {
    const viejo = items.find(i => i.id === it.reemplazaAId);
    linkWrap.style.display = "block";
    linkWrap.textContent = viejo ? `← Reemplaza a: ${viejo.nombre}` : "";
    linkWrap.onclick = () => { if (viejo) abrirFicha(viejo.id); };
    if (!viejo) linkWrap.style.display = "none";
  } else {
    linkWrap.style.display = "none";
  }

  // notas
  const notasEl = document.getElementById("fichaNotas");
  if (it.notas) { notasEl.style.display = "block"; notasEl.textContent = it.notas; }
  else notasEl.style.display = "none";

  document.getElementById("fichaOverlay").classList.add("show");
}

function cerrarFicha() {
  document.getElementById("fichaOverlay").classList.remove("show");
  fichaAbiertaId = null;
}

document.getElementById("btnCerrarFicha").addEventListener("click", cerrarFicha);

document.getElementById("btnEditarDesdeFicha").addEventListener("click", () => {
  if (!fichaAbiertaId) return;
  cerrarFicha();
  openForm(fichaAbiertaId);
});

document.getElementById("btnCambiarBateria").addEventListener("click", () => {
  if (!fichaAbiertaId) return;
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  const fecha = hoyYMD();
  it.historial.push({ tipo: "cambio_bateria", fecha, detalle: "Cambio de batería" });
  it.lastModified = Date.now();
  saveItems();
  abrirFicha(it.id);
  showToast(`Batería de ${it.nombre} registrada como cambiada`);
});

document.getElementById("btnReemplazar").addEventListener("click", () => {
  if (!fichaAbiertaId) return;
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  cerrarFicha();
  openForm(null, it.id);
});

document.getElementById("btnFueraServicio").addEventListener("click", () => {
  if (!fichaAbiertaId) return;
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  it.fueraDeServicio = true;
  it.lastModified = Date.now();
  it.historial.push({ tipo: "fuera_servicio", fecha: hoyYMD(), detalle: "Marcado fuera de servicio" });
  saveItems();
  abrirFicha(it.id);
  showToast(`${it.nombre} marcado fuera de servicio`);
});

document.getElementById("btnReactivar").addEventListener("click", () => {
  if (!fichaAbiertaId) return;
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  it.fueraDeServicio = false;
  it.lastModified = Date.now();
  it.historial.push({ tipo: "reactivado", fecha: hoyYMD(), detalle: "Reactivado" });
  saveItems();
  abrirFicha(it.id);
  showToast(`${it.nombre} reactivado`);
});

// ---------- toast ----------
function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove("show"), 6000);
}
document.getElementById("toastUndo").addEventListener("click", () => {
  if (lastAction) { lastAction.undo(); lastAction = null; }
  document.getElementById("toast").classList.remove("show");
});

// ---------- búsqueda ----------
document.getElementById("search").addEventListener("input", render);

// ---------- ayuda ----------
document.getElementById("btnHelp").addEventListener("click", () => {
  document.getElementById("helpOverlay").classList.add("show");
});
document.getElementById("btnCloseHelp").addEventListener("click", () => {
  document.getElementById("helpOverlay").classList.remove("show");
});

// ============================================================
// DRIVE SYNC (mismo patrón que Botiquín: merge por uuid + lastModified)
// ============================================================
const DriveSync = {
  token: null,
  tokenExpiry: 0,
  tokenClient: null,
  folderId: null,
  fileId: null,
  _lock: Promise.resolve(),

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRIVE_TOKEN_KEY) || "null");
      if (saved && saved.token && saved.expiry > Date.now()) {
        this.token = saved.token;
        this.tokenExpiry = saved.expiry;
        this.folderId = saved.folderId || null;
        this.fileId = saved.fileId || null;
      }
    } catch (e) {}
    this._updateDriveBtn();
  },

  _updateDriveBtn() {
    const btn = document.getElementById("btnDrive");
    if (this.conectado()) { btn.textContent = "🟢"; btn.title = "Drive conectado"; }
    else { btn.textContent = "🔌"; btn.title = "Conectar Google Drive"; }
  },

  conectado() { return !!(this.token && this.tokenExpiry > Date.now()); },

  _persistToken() {
    localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({
      token: this.token, expiry: this.tokenExpiry, folderId: this.folderId, fileId: this.fileId,
    }));
  },

  conectar() {
    return new Promise((resolve, reject) => {
      if (this.conectado()) { resolve(); return; }
      if (typeof google === "undefined" || !google.accounts) {
        reject(new Error("Google Identity Services no cargó todavía"));
        return;
      }
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID,
        scope: DRIVE_SCOPES,
        callback: (resp) => {
          if (resp.error) { reject(resp); return; }
          this.token = resp.access_token;
          this.tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
          this._persistToken();
          this._updateDriveBtn();
          resolve();
        },
      });
      this.tokenClient.requestAccessToken();
    });
  },

  _authHeader() { return { Authorization: `Bearer ${this.token}` }; },

  async ensureFolder() {
    if (this.folderId) return this.folderId;
    const q = encodeURIComponent(`name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: this._authHeader() });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      this.folderId = data.files[0].id;
    } else {
      const create = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: { ...this._authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
      });
      const created = await create.json();
      this.folderId = created.id;
    }
    this._persistToken();
    return this.folderId;
  },

  async ensureFile() {
    if (this.fileId) return this.fileId;
    await this.ensureFolder();
    const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}' and '${this.folderId}' in parents and trashed=false`);
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: this._authHeader() });
    const data = await res.json();
    if (data.files && data.files.length > 0) this.fileId = data.files[0].id;
    else this.fileId = null;
    this._persistToken();
    return this.fileId;
  },

  async descargar() {
    await this.ensureFile();
    if (!this.fileId) return null;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, { headers: this._authHeader() });
    if (!res.ok) return null;
    try { return await res.json(); } catch (e) { return null; }
  },

  async subir(payload, keepalive) {
    await this.ensureFolder();
    const boundary = "hainv_boundary";
    const metadata = this.fileId ? { name: DRIVE_FILE_NAME } : { name: DRIVE_FILE_NAME, parents: [this.folderId] };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;
    const url = this.fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${this.fileId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const res = await fetch(url, {
      method: this.fileId ? "PATCH" : "POST",
      headers: { ...this._authHeader(), "Content-Type": `multipart/related; boundary=${boundary}` },
      body, keepalive: !!keepalive,
    });
    const data = await res.json();
    if (!this.fileId && data.id) { this.fileId = data.id; this._persistToken(); }
    return data;
  },

  merge(local, remote) {
    const byId = new Map();
    (local || []).forEach(it => byId.set(it.id, it));
    (remote || []).forEach(rIt => {
      const lIt = byId.get(rIt.id);
      if (!lIt || (rIt.lastModified || 0) > (lIt.lastModified || 0)) byId.set(rIt.id, rIt);
    });
    return Array.from(byId.values());
  },

  async sync(keepalive) {
    this._lock = this._lock.then(() => this._syncNow(keepalive)).catch((e) => console.error("Drive sync error", e));
    return this._lock;
  },

  async _syncNow(keepalive) {
    if (!this.conectado()) return;
    const remoteData = await this.descargar();
    const remoteItems = remoteData && remoteData.items ? remoteData.items : [];
    const merged = this.merge(items, remoteItems);
    items = merged;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    render();
    await this.subir({ items, updatedAt: Date.now() }, keepalive);
  },
};

DriveSync.init();

document.getElementById("btnDrive").addEventListener("click", async () => {
  if (DriveSync.conectado()) { showToast("Drive ya está conectado"); return; }
  try {
    await DriveSync.conectar();
    showToast("Google Drive conectado");
    await DriveSync.sync();
    showToast("Sincronizado con Drive");
  } catch (e) { showToast("No se pudo conectar a Drive"); }
});

document.getElementById("btnBackup").addEventListener("click", async () => {
  if (!DriveSync.conectado()) { showToast("Conectá Drive primero (🔌)"); return; }
  showToast("Sincronizando con Drive...");
  await DriveSync.sync();
  showToast("Backup a Drive completo");
});

// ---------- safe close ----------
window.addEventListener("beforeunload", saveSnapshot);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveSnapshot();
    if (typeof DriveSync !== "undefined" && DriveSync.conectado()) DriveSync.sync(true);
  }
});

document.getElementById("btnExit").addEventListener("click", async () => {
  if (!confirm("¿Salir de Gestión Integral de HA? Se va a guardar un backup en Drive antes de cerrar.")) return;
  saveSnapshot();
  if (!DriveSync.conectado()) {
    alert("Drive no está conectado, así que no puedo hacer backup antes de salir. Tocá 🔌 para conectar Drive, o volvé a intentar salir si igual querés forzarlo.");
    return;
  }
  try {
    await DriveSync.sync();
    alert("Backup guardado en Drive. Cerrando Gestión Integral de HA.");
    window.close();
  } catch (e) {
    console.error("Error sincronizando al salir", e);
    alert("No se pudo guardar el backup en Drive (revisá conexión a internet). La app sigue abierta, reintentá salir cuando se resuelva.");
  }
});

// ---------- splash ----------
function updateSplashFooter() {
  const now = new Date();
  const fecha = now.toLocaleDateString('es-UY');
  const hora = now.toLocaleTimeString('es-UY', { hour12: false, hour: '2-digit', minute: '2-digit' });
  document.getElementById("splash-footer").textContent = `Gestión Integral de HA · ${fecha} · ${hora} · v${APP_VERSION}`;
}
function closeSplash() {
  document.getElementById("splash").style.display = "none";
  document.getElementById("app").style.display = "block";
}
updateSplashFooter();
document.getElementById("splash").addEventListener("click", closeSplash);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.getElementById("splash").style.display !== "none") closeSplash();
});

// ---------- init ----------
loadItems();
render();
if (DriveSync.conectado()) DriveSync.sync();

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
