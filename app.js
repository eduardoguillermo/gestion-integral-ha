// ============================================================
// GESTIÓN INTEGRAL DE HA — v0.10-dev
// ============================================================
const APP_VERSION = "0.10-dev";
const STORAGE_KEY = "giha_items";
const STORAGE_KEY_AUTO = "giha_automatizaciones";
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
  zigbee: { label: "Zigbee", icono: "📡" },
  wifi:   { label: "WiFi",   icono: "📶" },
  otro:   { label: "Otro",   icono: "🔘" },
};
const BATERIAS = { cr2032: "CR2032", aa: "AA", aaa: "AAA", recargable: "Recargable", na: "N/A - cableado", otro: "Otra" };

// Etiqueta visible de la batería: si es "otro", usa el texto libre cargado.
function bateriaLabel(it) {
  if (it.bateria === "otro" && it.bateriaOtro) return it.bateriaOtro;
  return BATERIAS[it.bateria] || it.bateria;
}

let items = [];
let automatizaciones = [];
let editingId = null;
let fichaAbiertaId = null;
let reemplazandoId = null;
let filtroTipo = "todos";
let lastAction = null;

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

function pillInfo(estado) {
  switch (estado) {
    case "bateria_baja":   return { cls: "p-warn",   txt: "Batería baja" };
    case "fuera_servicio": return { cls: "p-danger", txt: "Fuera de servicio" };
    case "reemplazado":    return { cls: "p-muted",  txt: "Reemplazado" };
    default:               return { cls: "p-ok",     txt: "Activo" };
  }
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

// Etiqueta visible del tipo: si es "otro", usa el texto libre cargado en vez de "Otro".
function tipoLabel(it) {
  if (it.tipo === "otro" && it.tipoOtro) return it.tipoOtro;
  return (TIPOS[it.tipo] || TIPOS.otro).label;
}
function tipoIcono(it) {
  return (TIPOS[it.tipo] || TIPOS.otro).icono;
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
  try {
    const rawAuto = localStorage.getItem(STORAGE_KEY_AUTO);
    automatizaciones = rawAuto ? JSON.parse(rawAuto) : [];
  } catch (e) {
    console.error("Error leyendo storage de automatizaciones", e);
    automatizaciones = [];
  }
}

// Persiste ambas colecciones (dispositivos + automatizaciones) juntas: un solo snapshot,
// un solo sync a Drive, para que nunca queden desincronizadas entre sí.
function persistAll() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify(automatizaciones));
  saveSnapshot();
  if (typeof DriveSync !== "undefined" && DriveSync.conectado()) DriveSync.sync();
}
function saveItems() { persistAll(); render(); }
function saveAutomatizaciones() { persistAll(); renderAutomatizaciones(); }

function saveSnapshot() {
  try {
    let snaps = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
    snaps.push({ t: Date.now(), data: items, dataAuto: automatizaciones });
    if (snaps.length > MAX_SNAPSHOTS) snaps = snaps.slice(snaps.length - MAX_SNAPSHOTS);
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snaps));
  } catch (e) {
    console.error("Error guardando snapshot", e);
  }
}

// ============================================================
// PÁGINA: INVENTARIO
// ============================================================
function renderInventario() {
  document.getElementById("content").innerHTML = `
    <div class="stats" id="stats"></div>
    <div class="sbar">
      <input type="text" id="search" autocomplete="off" placeholder="Buscar por nombre o entidad">
      <select id="filtroTipoSel"></select>
      <button class="btn btn-p" id="btnAgregar">+ Agregar dispositivo</button>
    </div>
    <div class="dev-grid" id="list"></div>
  `;
  document.getElementById("filtroTipoSel").addEventListener("change", (e) => { filtroTipo = e.target.value; render(); });
  document.getElementById("search").addEventListener("input", render);
  document.getElementById("btnAgregar").addEventListener("click", () => openForm(null));
  render();
}

// ---------- render: stats ----------
function renderStats() {
  const statsEl = document.getElementById("stats");
  if (!statsEl) return;
  const base = activos();
  const stats = [
    { label: "Activos", n: base.filter(it => estadoDispositivo(it) === "activo").length, cls: "" },
    { label: "Batería baja", n: base.filter(it => estadoDispositivo(it) === "bateria_baja").length, cls: "warn" },
    { label: "Reemplazados", n: base.filter(it => estadoDispositivo(it) === "reemplazado").length, cls: "" },
    { label: "Fuera de servicio", n: base.filter(it => estadoDispositivo(it) === "fuera_servicio").length, cls: "danger" },
  ];
  statsEl.innerHTML = stats.map(s =>
    `<div class="stat ${s.cls}"><div class="stat-n">${s.n}</div><div class="stat-l">${s.label}</div></div>`
  ).join("");
}

// ---------- render: filtro de tipo ----------
function renderFiltroSelect() {
  const sel = document.getElementById("filtroTipoSel");
  if (!sel) return;
  const tiposEnUso = new Set(activos().map(it => it.tipo));
  let html = `<option value="todos">Todos los tipos</option>`;
  Object.keys(TIPOS).forEach(t => {
    if (!tiposEnUso.has(t)) return;
    html += `<option value="${t}">${TIPOS[t].label}</option>`;
  });
  sel.innerHTML = html;
  sel.value = filtroTipo;
}

// ---------- render: lista ----------
function render() {
  const list = document.getElementById("list");
  if (!list) return; // Inventario no es la página activa ahora mismo
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

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${base.length === 0 ? "Todavía no cargaste dispositivos." : "Sin resultados."}</div>`;
  } else {
    list.innerHTML = filtered.map(it => renderCard(it)).join("");
    list.querySelectorAll(".dev-card").forEach(card => {
      card.addEventListener("click", () => abrirFicha(card.dataset.id));
    });
  }

  renderStats();
  renderFiltroSelect();
}

// ============================================================
// PÁGINA: AUTOMATIZACIONES
// (Se cargan a mano por ahora; más adelante se van a poder traer del propio
// sistema HA, así que el modelo de datos ya queda listo para eso: id, categoria,
// nombre, descripcion — sin agregarle nada extra que no se haya pedido.)
// ============================================================
let filtroCategoria = "todas";

function automatizacionesActivas() {
  return automatizaciones.filter(a => !a.deleted);
}

function renderAutomatizaciones() {
  const contentEl = document.getElementById("content");
  const yaEnPagina = document.getElementById("listAuto");
  if (!yaEnPagina && _panel !== "automatizaciones") return; // no pisar otra pestaña si esto se dispara en segundo plano
  contentEl.innerHTML = `
    <div class="sbar">
      <input type="text" id="searchAuto" autocomplete="off" placeholder="Buscar por nombre, categoría o descripción">
      <select id="filtroCategoriaSel"></select>
      <button class="btn btn-p" id="btnAgregarAuto">+ Agregar automatización</button>
    </div>
    <div class="dev-grid" id="listAuto"></div>
  `;
  document.getElementById("searchAuto").addEventListener("input", renderListaAuto);
  document.getElementById("filtroCategoriaSel").addEventListener("change", (e) => { filtroCategoria = e.target.value; renderListaAuto(); });
  document.getElementById("btnAgregarAuto").addEventListener("click", () => openFormAuto(null));
  renderListaAuto();
}

function renderFiltroCategoriaSelect() {
  const sel = document.getElementById("filtroCategoriaSel");
  if (!sel) return;
  const categorias = [...new Set(automatizacionesActivas().map(a => a.categoria).filter(Boolean))].sort();
  let html = `<option value="todas">Todas las categorías</option>`;
  categorias.forEach(c => { html += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`; });
  sel.innerHTML = html;
  sel.value = filtroCategoria;
}

function renderListaAuto() {
  const list = document.getElementById("listAuto");
  if (!list) return;
  const q = (document.getElementById("searchAuto").value || "").toLowerCase().trim();
  const base = automatizacionesActivas();

  const filtered = base.filter(a => {
    if (filtroCategoria !== "todas" && a.categoria !== filtroCategoria) return false;
    if (!q) return true;
    return a.nombre.toLowerCase().includes(q) || (a.categoria || "").toLowerCase().includes(q) || (a.descripcion || "").toLowerCase().includes(q);
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty">${base.length === 0 ? "Todavía no cargaste automatizaciones." : "Sin resultados."}</div>`;
  } else {
    list.innerHTML = filtered.map(a => `
      <div class="dev-card" data-id="${a.id}">
        <div class="dev-card-top">
          <span class="dev-card-icon">🤖</span>
          <span class="dev-card-title">${escapeHtml(a.nombre)}</span>
        </div>
        <div class="dev-card-meta">${a.descripcion ? escapeHtml(a.descripcion.length > 90 ? a.descripcion.slice(0, 90) + "…" : a.descripcion) : "sin descripción"}</div>
        <span class="pill p-muted">${escapeHtml(a.categoria || "sin categoría")}</span>
      </div>
    `).join("");
    list.querySelectorAll(".dev-card").forEach(card => {
      card.addEventListener("click", () => openFormAuto(card.dataset.id));
    });
  }
  renderFiltroCategoriaSelect();
}

function openFormAuto(id) {
  const a = id ? automatizaciones.find(x => x.id === id) : null;
  const titulo = a ? "Editar automatización" : "Agregar automatización";
  const categoriasExistentes = [...new Set(automatizacionesActivas().map(x => x.categoria).filter(Boolean))].sort();

  const body = `
    <div class="fg"><label>Categoría</label>
      <input type="text" id="faCategoria" autocomplete="off" list="listaCategorias" placeholder="Ej: Seguridad, Riego, Iluminación" value="${escapeHtml(a ? (a.categoria || "") : "")}">
      <datalist id="listaCategorias">${categoriasExistentes.map(c => `<option value="${escapeHtml(c)}">`).join("")}</datalist>
    </div>
    <div class="fg"><label>Nombre</label><input type="text" id="faNombre" autocomplete="off" placeholder="Ej: Apagar luces al salir" value="${escapeHtml(a ? a.nombre : "")}"></div>
    <div class="fg"><label>Descripción</label><textarea id="faDescripcion" placeholder="Qué hace y cuándo se dispara">${escapeHtml(a ? (a.descripcion || "") : "")}</textarea></div>
  `;
  const foot = `
    ${a ? `<button class="btn btn-d" id="btnEliminarAuto">🗑️ Eliminar</button>` : ""}
    <button class="btn" id="btnCancelFormAuto">Cancelar</button>
    <button class="btn btn-p" id="btnSaveFormAuto">Guardar</button>
  `;
  abrirModal(titulo, body, foot);

  document.getElementById("btnCancelFormAuto").addEventListener("click", cerrarModal);
  document.getElementById("btnSaveFormAuto").addEventListener("click", () => guardarFormAuto(id));
  const btnDel = document.getElementById("btnEliminarAuto");
  if (btnDel) btnDel.addEventListener("click", () => eliminarAuto(id));
}

function guardarFormAuto(id) {
  const nombre = document.getElementById("faNombre").value.trim();
  if (!nombre) { alert("Ingresá el nombre de la automatización"); return; }

  const data = {
    categoria: document.getElementById("faCategoria").value.trim(),
    nombre,
    descripcion: document.getElementById("faDescripcion").value.trim(),
    lastModified: Date.now(),
  };

  if (id) {
    const a = automatizaciones.find(x => x.id === id);
    if (a) Object.assign(a, data);
    cerrarModal();
    saveAutomatizaciones();
    showToast(`${nombre} actualizada`);
  } else {
    automatizaciones.push({ id: uuid(), ...data, deleted: false });
    cerrarModal();
    saveAutomatizaciones();
    showToast(`${nombre} agregada`);
  }
}

function eliminarAuto(id) {
  const a = automatizaciones.find(x => x.id === id);
  if (!a) return;
  if (!confirm(`¿Eliminar "${a.nombre}"?`)) return;
  a.deleted = true;
  a.lastModified = Date.now();
  cerrarModal();
  saveAutomatizaciones();
  showToast(`${a.nombre} eliminada`);
}

// ============================================================
// ROUTER / NAV LATERAL
// ============================================================
let _panel = "inventario";
const PANELS = ["inventario", "automatizaciones", "reportes", "backup"];
const TITULOS = { inventario: "Inventario", automatizaciones: "Automatizaciones", reportes: "Reportes", backup: "Backup" };
const RENDERS = { inventario: renderInventario, automatizaciones: () => renderAutomatizaciones(), reportes: () => renderReportes(), backup: () => renderBackup() };

function toggleNav() {
  document.getElementById("nav").classList.toggle("open");
  document.getElementById("nav-overlay").classList.toggle("open");
}
function cerrarNav() {
  document.getElementById("nav").classList.remove("open");
  document.getElementById("nav-overlay").classList.remove("open");
}
function goTo(panel) {
  cerrarNav();
  _panel = panel;
  PANELS.forEach(p => { const el = document.getElementById("nav-" + p); if (el) el.classList.remove("on"); });
  const navEl = document.getElementById("nav-" + panel);
  if (navEl) navEl.classList.add("on");
  document.getElementById("ptitle").textContent = TITULOS[panel] || panel;
  document.getElementById("pacts").innerHTML = "";
  (RENDERS[panel] || renderInventario)();
}

// ============================================================
// PÁGINA: REPORTES (placeholder — a definir)
// ============================================================
function renderReportes() {
  document.getElementById("content").innerHTML = `
    <div class="card">
      <div class="ch"><span class="ct">Reportes</span></div>
      <div class="card-body">
        <p class="text2" style="font-size:12px;">Todavía no hay reportes definidos para este módulo. Contame qué querés ver acá (por ejemplo: dispositivos por ubicación, próximos cambios de batería, historial de reemplazos) y lo armamos.</p>
      </div>
    </div>
  `;
}

// ============================================================
// PÁGINA: BACKUP
// ============================================================
function renderBackup() {
  const conectado = DriveSync.conectado();
  const snaps = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]").slice().reverse();
  const snapsHtml = snaps.length === 0
    ? `<p class="text3" style="font-size:12px;">Sin snapshots todavía. Se crean automáticamente al cerrar o minimizar la app.</p>`
    : snaps.map(s => {
        const d = new Date(s.t);
        const label = d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <span class="text2">🔄 ${label} · ${s.data.length} dispositivo${s.data.length === 1 ? "" : "s"} · ${(s.dataAuto || []).length} automatización${(s.dataAuto || []).length === 1 ? "" : "es"}</span>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-sm" onclick="restaurarSnapshot(${s.t})">↩️ Restaurar</button>
          </div>
        </div>`;
      }).join("");

  document.getElementById("content").innerHTML = `
    <div class="card">
      <div class="ch"><span class="ct">Google Drive</span></div>
      <div class="card-body">
        <p class="text2" id="backup-drive-status" style="font-size:12px;margin-bottom:12px;">${conectado ? "🟢 Conectado" : "🔌 No conectado"}</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          ${conectado
            ? `<button class="btn btn-p" onclick="backupAhora()">☁️ Sincronizar ahora</button><button class="btn btn-d" onclick="desconectarDrive()">🔌 Desconectar</button>`
            : `<button class="btn btn-p" onclick="conectarDrive()">🔌 Conectar Google Drive</button>`
          }
        </div>
        <p class="text3" style="font-size:11px;margin-top:8px;">"Sincronizar ahora" trae los cambios de Drive y sube los tuyos, en un solo paso.</p>
      </div>
    </div>
    <div class="card">
      <div class="ch"><span class="ct">Importar / Exportar JSON</span></div>
      <div class="card-body">
        <p class="text2" style="font-size:12px;margin-bottom:10px;">Para cargar datos preparados por fuera de la app (por ejemplo, un import armado a mano) o para pasar datos entre dispositivos sin depender de Drive.</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button class="btn" onclick="document.getElementById('inputImportarJson').click()">📥 Importar JSON</button>
          <input type="file" id="inputImportarJson" accept="application/json" style="display:none;" onchange="importarJSON(event)">
          <button class="btn" onclick="exportarJSON()">📤 Exportar JSON</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="ch"><span class="ct">Snapshots locales <span class="text3" style="font-size:11px;font-weight:400;">(últimos ${snaps.length}/${MAX_SNAPSHOTS})</span></span></div>
      <div class="card-body">${snapsHtml}</div>
    </div>
  `;
}

function restaurarSnapshot(ts) {
  const snaps = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "[]");
  const snap = snaps.find(s => s.t === ts);
  if (!snap) return;
  if (!confirm("¿Restaurar este snapshot? Reemplaza los datos actuales por los de ese momento.")) return;
  items = snap.data;
  automatizaciones = snap.dataAuto || [];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify(automatizaciones));
  saveSnapshot();
  render();
  renderAutomatizaciones();
  renderBackup();
  showToast("Snapshot restaurado");
}


function renderCard(it) {
  const estado = estadoDispositivo(it);
  const pill = pillInfo(estado);
  const metaExtra = estado === "bateria_baja" ? ` · hace ${diasDesde(ultimoCambioBateria(it))} días` : "";
  const marcaModelo = [it.marca, it.modelo].filter(Boolean).join(" ");
  return `
    <div class="dev-card ${estado === "reemplazado" ? "reemplazado" : ""}" data-id="${it.id}">
      <div class="dev-card-top">
        <span class="dev-card-icon">${tipoIcono(it)}</span>
        <span class="dev-card-title">${escapeHtml(it.nombre)}</span>
      </div>
      <div class="dev-card-meta">${escapeHtml(it.ubicacion || "sin ubicación")} · ${bateriaLabel(it)}${metaExtra}</div>
      ${marcaModelo ? `<div class="dev-card-meta">${escapeHtml(marcaModelo)}</div>` : ""}
      <span class="pill ${pill.cls}">${pill.txt}</span>
    </div>
  `;
}

// ============================================================
// MODAL GENÉRICO
// ============================================================
function abrirModal(titulo, bodyHtml, footHtml) {
  document.getElementById("modal-title").textContent = titulo;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-foot").innerHTML = footHtml || "";
  document.getElementById("modal").style.display = "flex";
}
function cerrarModal() {
  document.getElementById("modal").style.display = "none";
  document.getElementById("modal-body").innerHTML = "";
  document.getElementById("modal-foot").innerHTML = "";
  editingId = null;
  reemplazandoId = null;
  fichaAbiertaId = null;
}

// ============================================================
// FORM ALTA / EDICIÓN
// ============================================================
function openForm(id, reemplazaAId) {
  editingId = id || null;
  reemplazandoId = reemplazaAId || null;
  const it = id ? items.find(i => i.id === id) : null;
  const titulo = it ? "Editar dispositivo" : (reemplazaAId ? "Cargar dispositivo nuevo" : "Agregar dispositivo");

  const entidades = (it ? it.entidades : []) || [];
  const entidadesIniciales = entidades.length ? entidades : [""];

  const body = `
    <div class="fg"><label>Nombre</label><input type="text" id="fNombre" autocomplete="off" placeholder="Ej: Sensor puerta cocina" value="${escapeHtml(it ? it.nombre : "")}"></div>
    <div class="fg"><label>Tipo</label>
      <select id="fTipo">
        ${Object.keys(TIPOS).map(t => `<option value="${t}" ${it && it.tipo === t ? "selected" : ""}>${TIPOS[t].label}</option>`).join("")}
      </select>
    </div>
    <div class="fg" id="fTipoOtroWrap" style="display:${it && it.tipo === "otro" ? "flex" : "none"};">
      <label>Especificar tipo</label>
      <input type="text" id="fTipoOtro" autocomplete="off" placeholder="Ej: Bluetooth, Matter, LoRa" value="${escapeHtml(it ? (it.tipoOtro || "") : "")}">
    </div>
    <div class="fgrid">
      <div class="fg"><label>Marca</label><input type="text" id="fMarca" autocomplete="off" placeholder="Ej: Aqara" value="${escapeHtml(it ? (it.marca || "") : "")}"></div>
      <div class="fg"><label>Modelo</label><input type="text" id="fModelo" autocomplete="off" placeholder="Ej: WSDCGQ11LM" value="${escapeHtml(it ? (it.modelo || "") : "")}"></div>
    </div>
    <div class="fg"><label>Ubicación</label><input type="text" id="fUbicacion" autocomplete="off" placeholder="Ej: Cocina" value="${escapeHtml(it ? (it.ubicacion || "") : "")}"></div>
    <div class="fg"><label>Entidades HA</label>
      <div id="entidadesWrap"></div>
      <button type="button" class="btn btn-sm" id="btnAgregarEntidad" style="margin-top:2px;">+ Agregar otra entidad</button>
    </div>
    <div class="fgrid">
      <div class="fg"><label>Fecha instalación</label><input type="date" id="fFechaInstalacion" value="${it ? (it.fechaInstalacion || "") : hoyYMD()}"></div>
      <div class="fg"><label>Tipo batería</label>
        <select id="fBateria">
          ${Object.keys(BATERIAS).map(b => `<option value="${b}" ${it && it.bateria === b ? "selected" : ""}>${BATERIAS[b]}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="fg" id="fBateriaOtroWrap" style="display:${it && it.bateria === "otro" ? "flex" : "none"};">
      <label>Especificar batería</label>
      <input type="text" id="fBateriaOtro" autocomplete="off" placeholder="Ej: CR123A, 18650" value="${escapeHtml(it ? (it.bateriaOtro || "") : "")}">
    </div>
    <div class="fg"><label>Notas</label><textarea id="fNotas" placeholder="Observaciones opcionales">${escapeHtml(it ? (it.notas || "") : "")}</textarea></div>
  `;
  const foot = `
    <button class="btn" id="btnCancelForm">Cancelar</button>
    <button class="btn btn-p" id="btnSaveForm">Guardar</button>
  `;
  abrirModal(titulo, body, foot);

  renderEntidadesInputs(entidadesIniciales);
  document.getElementById("btnAgregarEntidad").addEventListener("click", () => agregarFilaEntidad(""));
  document.getElementById("btnCancelForm").addEventListener("click", cerrarModal);
  document.getElementById("btnSaveForm").addEventListener("click", guardarForm);
  document.getElementById("fTipo").addEventListener("change", (e) => {
    document.getElementById("fTipoOtroWrap").style.display = e.target.value === "otro" ? "flex" : "none";
  });
  document.getElementById("fBateria").addEventListener("change", (e) => {
    document.getElementById("fBateriaOtroWrap").style.display = e.target.value === "otro" ? "flex" : "none";
  });
}

function renderEntidadesInputs(valores) {
  const wrap = document.getElementById("entidadesWrap");
  wrap.innerHTML = "";
  valores.forEach(v => agregarFilaEntidad(v));
}

function agregarFilaEntidad(valor) {
  const wrap = document.getElementById("entidadesWrap");
  const row = document.createElement("div");
  row.className = "entidad-row";
  row.innerHTML = `
    <input type="text" class="entidad-input" autocomplete="off" placeholder="binary_sensor.puerta_cocina" value="${escapeHtml(valor || "")}">
    <button type="button" class="quitar">✕</button>
  `;
  row.querySelector(".quitar").addEventListener("click", () => {
    if (wrap.children.length > 1) row.remove();
    else row.querySelector(".entidad-input").value = "";
  });
  wrap.appendChild(row);
}

function leerEntidadesForm() {
  return Array.from(document.querySelectorAll(".entidad-input")).map(inp => inp.value.trim()).filter(v => v);
}

function guardarForm() {
  const nombre = document.getElementById("fNombre").value.trim();
  if (!nombre) { alert("Ingresá el nombre del dispositivo"); return; }

  const tipo = document.getElementById("fTipo").value;
  const tipoOtro = document.getElementById("fTipoOtro").value.trim();
  if (tipo === "otro" && !tipoOtro) { alert("Especificá el tipo en el campo de texto"); return; }

  const bateria = document.getElementById("fBateria").value;
  const bateriaOtro = document.getElementById("fBateriaOtro").value.trim();
  if (bateria === "otro" && !bateriaOtro) { alert("Especificá la batería en el campo de texto"); return; }

  const fechaInstalacion = document.getElementById("fFechaInstalacion").value || hoyYMD();
  const data = {
    nombre,
    tipo,
    tipoOtro: tipo === "otro" ? tipoOtro : "",
    marca: document.getElementById("fMarca").value.trim(),
    modelo: document.getElementById("fModelo").value.trim(),
    ubicacion: document.getElementById("fUbicacion").value.trim(),
    entidades: leerEntidadesForm(),
    fechaInstalacion,
    bateria,
    bateriaOtro: bateria === "otro" ? bateriaOtro : "",
    notas: document.getElementById("fNotas").value.trim(),
    lastModified: Date.now(),
  };

  if (editingId) {
    const it = items.find(i => i.id === editingId);
    if (it) Object.assign(it, data);
    cerrarModal();
    saveItems();
    showToast(`${nombre} actualizado`);
  } else {
    const nuevo = {
      id: uuid(), ...data,
      reemplazadoPorId: null, reemplazaAId: reemplazandoId || null,
      fueraDeServicio: false, deleted: false,
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
    const yaEraReemplazo = !!reemplazandoId;
    cerrarModal();
    saveItems();
    showToast(`${nombre} agregado`);
    if (yaEraReemplazo) abrirFicha(nuevo.id);
  }
}

// ============================================================
// FICHA DE DISPOSITIVO
// ============================================================
function abrirFicha(id) {
  fichaAbiertaId = id;
  const it = items.find(i => i.id === id);
  if (!it) return;

  const estado = estadoDispositivo(it);
  const pill = pillInfo(estado);
  const esReemplazado = estado === "reemplazado";

  const eventos = [...(it.historial || [])].reverse();
  const historialHtml = eventos.map(ev =>
    `<div class="hist-item"><span class="hist-fecha">${fmtFecha(ev.fecha)}</span><span class="hist-accion">${escapeHtml(ev.detalle)}</span></div>`
  ).join("") || `<div class="hist-item"><span class="hist-accion">Sin eventos registrados.</span></div>`;

  let linkHtml = "";
  if (it.reemplazadoPorId) {
    const nuevo = items.find(i => i.id === it.reemplazadoPorId);
    linkHtml = `<div class="ficha-link" id="linkReemplazo">→ Reemplazado por: ${nuevo ? escapeHtml(nuevo.nombre) : "(no encontrado)"}</div>`;
  } else if (it.reemplazaAId) {
    const viejo = items.find(i => i.id === it.reemplazaAId);
    if (viejo) linkHtml = `<div class="ficha-link" id="linkReemplazo">← Reemplaza a: ${escapeHtml(viejo.nombre)}</div>`;
  }

  const notasHtml = it.notas ? `<div class="ficha-notas">${escapeHtml(it.notas)}</div>` : "";
  const marcaModelo = [it.marca, it.modelo].filter(Boolean).join(" ");

  const body = `
    <div class="ficha-meta-row">
      <span class="pill ${pill.cls}">${pill.txt}</span>
      <span class="ficha-entidades">${escapeHtml(it.ubicacion || "sin ubicación")} · ${tipoLabel(it)}${marcaModelo ? " · " + escapeHtml(marcaModelo) : ""}${(it.entidades || []).length ? " · " + it.entidades.map(escapeHtml).join(", ") : ""}</span>
    </div>
    <div class="ficha-acciones">
      ${(!esReemplazado && it.bateria !== "na") ? `<button class="btn" id="btnCambiarBateria">🔋 Cambiar batería</button>` : ""}
      ${!esReemplazado ? `<button class="btn" id="btnReemplazar">🔄 Reemplazar</button>` : ""}
      ${(!esReemplazado && !it.fueraDeServicio) ? `<button class="btn btn-d" id="btnFueraServicio">⛔ Fuera de servicio</button>` : ""}
      ${(!esReemplazado && it.fueraDeServicio) ? `<button class="btn btn-g" id="btnReactivar">✅ Reactivar</button>` : ""}
    </div>
    <div class="ficha-section-title">Historial</div>
    <div id="fichaHistorial">${historialHtml}</div>
    ${linkHtml}
    ${notasHtml}
  `;
  const foot = `<button class="btn btn-sm" id="btnEditarDesdeFicha">✏️ Editar</button>`;

  abrirModal(it.nombre, body, foot);
  fichaAbiertaId = id; // abrirModal/cerrarModal previo puede resetearlo

  document.getElementById("btnEditarDesdeFicha").addEventListener("click", () => { const eid = fichaAbiertaId; cerrarModal(); openForm(eid); });
  const bBat = document.getElementById("btnCambiarBateria");
  if (bBat) bBat.addEventListener("click", cambiarBateria);
  const bRep = document.getElementById("btnReemplazar");
  if (bRep) bRep.addEventListener("click", () => { const eid = fichaAbiertaId; cerrarModal(); openForm(null, eid); });
  const bFuera = document.getElementById("btnFueraServicio");
  if (bFuera) bFuera.addEventListener("click", marcarFueraServicio);
  const bReact = document.getElementById("btnReactivar");
  if (bReact) bReact.addEventListener("click", reactivar);
  const link = document.getElementById("linkReemplazo");
  if (link) link.addEventListener("click", () => {
    const target = it.reemplazadoPorId || it.reemplazaAId;
    if (target) abrirFicha(target);
  });
}

function cambiarBateria() {
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  it.historial.push({ tipo: "cambio_bateria", fecha: hoyYMD(), detalle: "Cambio de batería" });
  it.lastModified = Date.now();
  saveItems();
  abrirFicha(it.id);
  showToast(`Batería de ${it.nombre} registrada como cambiada`);
}
function marcarFueraServicio() {
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  it.fueraDeServicio = true;
  it.lastModified = Date.now();
  it.historial.push({ tipo: "fuera_servicio", fecha: hoyYMD(), detalle: "Marcado fuera de servicio" });
  saveItems();
  abrirFicha(it.id);
  showToast(`${it.nombre} marcado fuera de servicio`);
}
function reactivar() {
  const it = items.find(i => i.id === fichaAbiertaId);
  if (!it) return;
  it.fueraDeServicio = false;
  it.lastModified = Date.now();
  it.historial.push({ tipo: "reactivado", fecha: hoyYMD(), detalle: "Reactivado" });
  saveItems();
  abrirFicha(it.id);
  showToast(`${it.nombre} reactivado`);
}

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

// ============================================================
// AYUDA
// ============================================================
function abrirAyuda() {
  const body = `
    <div class="help-item"><p class="help-title">➕ Agregar dispositivo</p><p class="help-desc">Nombre, tipo, ubicación, una o más entidades de Home Assistant, fecha de instalación y tipo de batería.</p></div>
    <div class="help-item"><p class="help-title">🔋 Cambiar batería</p><p class="help-desc">Desde la ficha, registra la fecha del cambio en el historial. Queda un registro permanente de cada cambio, no solo el último.</p></div>
    <div class="help-item"><p class="help-title">🔄 Reemplazar</p><p class="help-desc">Marca el dispositivo actual como reemplazado y abre el formulario para el nuevo. El viejo queda en el historial con link al nuevo — nunca se borra.</p></div>
    <div class="help-item"><p class="help-title">⛔ Fuera de servicio</p><p class="help-desc">Para un dispositivo dado de baja sin reemplazo. Se puede reactivar en cualquier momento.</p></div>
    <div class="help-item"><p class="help-title">Estados</p><p class="help-desc">Activo (verde): funcionando normal. Batería baja (ámbar): pasó el umbral desde el último cambio. Fuera de servicio (rojo). Reemplazado (gris): ver el reemplazo desde su ficha.</p></div>
    <div class="help-item"><p class="help-title">🔌 Conectar Drive</p><p class="help-desc">Vincula tu cuenta de Google para sincronizar entre dispositivos. Se crea una carpeta "GestionIntegralHA" en tu Drive.</p></div>
    <div class="help-item"><p class="help-title">🚪 Salir</p><p class="help-desc">Guarda un backup local y sincroniza con Drive antes de cerrar. Si el backup falla, la app no se cierra para que puedas reintentar.</p></div>
  `;
  abrirModal("Cómo usar Gestión Integral de HA", body, `<button class="btn btn-p" onclick="cerrarModal()">Entendido</button>`);
}
document.getElementById("btnHelp").addEventListener("click", abrirAyuda);

// ============================================================
// DRIVE SYNC (mismo patrón que Botiquín / mini_ha: merge por uuid + lastModified)
// ============================================================
const DriveSync = {
  token: null, tokenExpiry: 0, tokenClient: null, folderId: null, fileId: null,
  _lock: Promise.resolve(),

  init() {
    try {
      const saved = JSON.parse(localStorage.getItem(DRIVE_TOKEN_KEY) || "null");
      if (saved && saved.token && saved.expiry > Date.now()) {
        this.token = saved.token; this.tokenExpiry = saved.expiry;
        this.folderId = saved.folderId || null; this.fileId = saved.fileId || null;
      }
    } catch (e) {}
    this._updateDriveBtn();
  },
  _updateDriveBtn() {
    // Si la página Backup está activa, refresca su estado; si no, no hace nada (no hay botón fijo en el topbar).
    if (typeof renderBackup === "function" && document.getElementById("backup-drive-status")) renderBackup();
  },
  conectado() { return !!(this.token && this.tokenExpiry > Date.now()); },
  _persistToken() {
    localStorage.setItem(DRIVE_TOKEN_KEY, JSON.stringify({ token: this.token, expiry: this.tokenExpiry, folderId: this.folderId, fileId: this.fileId }));
  },
  conectar() {
    return new Promise((resolve, reject) => {
      if (this.conectado()) { resolve(); return; }
      if (typeof google === "undefined" || !google.accounts) { reject(new Error("Google Identity Services no cargó todavía")); return; }
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPES,
        callback: (resp) => {
          if (resp.error) { reject(resp); return; }
          this.token = resp.access_token;
          this.tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
          this._persistToken(); this._updateDriveBtn(); resolve();
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
    if (data.files && data.files.length > 0) this.folderId = data.files[0].id;
    else {
      const create = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST", headers: { ...this._authHeader(), "Content-Type": "application/json" },
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
    if (data.files && data.files.length > 0) this.fileId = data.files[0].id; else this.fileId = null;
    this._persistToken();
    return this.fileId;
  },
  async descargar() {
    await this.ensureFile();
    if (!this.fileId) return null;
    let res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, { headers: this._authHeader() });
    if (res.status === 404) {
      // El archivo que teníamos guardado ya no existe (borrado o reemplazado) — nos olvidamos
      // del id viejo y volvemos a buscarlo por nombre, en vez de quedar apuntando al vacío.
      this.fileId = null;
      this._persistToken();
      await this.ensureFile();
      if (!this.fileId) return null;
      res = await fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media`, { headers: this._authHeader() });
    }
    if (!res.ok) return null;
    try { return await res.json(); } catch (e) { return null; }
  },
  async subir(payload, keepalive) {
    await this.ensureFolder();
    const boundary = "giha_boundary";
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
    const remoteAuto = remoteData && remoteData.automatizaciones ? remoteData.automatizaciones : [];
    items = this.merge(items, remoteItems);
    automatizaciones = this.merge(automatizaciones, remoteAuto);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify(automatizaciones));
    render();
    renderAutomatizaciones();
    await this.subir({ items, automatizaciones, updatedAt: Date.now() }, keepalive);
  },
};
DriveSync.init();

async function conectarDrive() {
  if (DriveSync.conectado()) { showToast("Drive ya está conectado"); return; }
  try {
    await DriveSync.conectar();
    showToast("Google Drive conectado");
    await DriveSync.sync();
    showToast("Sincronizado con Drive");
  } catch (e) { showToast("No se pudo conectar a Drive"); }
  renderBackup();
}
async function backupAhora() {
  if (!DriveSync.conectado()) { showToast("Conectá Drive primero"); return; }
  showToast("Sincronizando con Drive...");
  await DriveSync.sync();
  showToast("Sincronización completa");
  renderBackup();
}

function exportarJSON() {
  const payload = { items, automatizaciones, exportedAt: Date.now() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gestion-integral-ha-${hoyYMD()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function importarJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    let payload;
    try { payload = JSON.parse(e.target.result); } catch (err) { alert("El archivo no es un JSON válido."); return; }
    const nuevosItems = Array.isArray(payload.items) ? payload.items : [];
    const nuevasAuto = Array.isArray(payload.automatizaciones) ? payload.automatizaciones : [];
    if (!nuevosItems.length && !nuevasAuto.length) { alert("El archivo no tiene dispositivos ni automatizaciones para importar."); return; }
    // Mismo criterio de merge que Drive: por id, gana el que tenga lastModified más reciente.
    items = DriveSync.merge(items, nuevosItems);
    automatizaciones = DriveSync.merge(automatizaciones, nuevasAuto);
    saveItems();
    saveAutomatizaciones();
    showToast(`Importado: ${nuevosItems.length} dispositivo${nuevosItems.length === 1 ? "" : "s"}, ${nuevasAuto.length} automatización${nuevasAuto.length === 1 ? "" : "es"}`);
    renderBackup();
  };
  reader.readAsText(file);
  event.target.value = ""; // permite volver a elegir el mismo archivo si hace falta
}

function desconectarDrive() {
  if (!confirm("¿Desconectar Google Drive de este dispositivo? Se olvida la conexión guardada (útil si el archivo remoto cambió y no lo está encontrando). Podés reconectar cuando quieras.")) return;
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  DriveSync.token = null;
  DriveSync.tokenExpiry = 0;
  DriveSync.folderId = null;
  DriveSync.fileId = null;
  showToast("Drive desconectado");
  renderBackup();
}

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

// ============================================================
// SPLASH (inyectado por JS, estilo mini_ha)
// ============================================================
function mostrarSplash() {
  const ahora = new Date();
  const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const meses = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const dia = diasSemana[ahora.getDay()];
  const fecha = `${dia} ${String(ahora.getDate()).padStart(2, '0')}/${meses[ahora.getMonth()]}/${ahora.getFullYear()}`;
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;

  const el = document.createElement('div');
  el.id = 'splash';
  el.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:#111318;display:flex;flex-direction:column;font-family:system-ui,sans-serif;`;
  el.innerHTML = `
    <div style="background:#1e2128;border-bottom:1px solid rgba(255,255,255,0.08);padding:10px 18px;display:flex;align-items:center;gap:10px;">
      <div style="width:32px;height:32px;background:#1a6faa;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🏠</div>
      <div>
        <div style="font-weight:700;font-size:13px;color:#e0e0e0;">Gestión Integral de HA</div>
        <div style="font-size:10px;color:#7a9aa8;">Home Assistant</div>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:3rem 2rem;">
      <div style="margin-bottom:2.5rem;text-align:center;">
        <div style="font-size:26px;font-weight:500;letter-spacing:0.03em;color:#c8d8e0;line-height:1.4;">Sensores, baterías y reemplazos de tu instalación</div>
      </div>
      <div style="text-align:center;width:100%;max-width:400px;">
        <div style="display:flex;align-items:center;justify-content:center;gap:1rem;font-size:10px;color:#5a7a85;font-family:monospace;letter-spacing:0.05em;">
          <span style="color:#7a9aa8;">Gestión Integral de HA</span>
          <span style="opacity:0.3;">·</span>
          <span>${fecha}</span>
          <span style="opacity:0.3;">·</span>
          <span>${hora}</span>
          <span style="opacity:0.3;">·</span>
          <span>v${APP_VERSION}</span>
        </div>
        <div style="margin-top:16px;font-family:'Dancing Script',cursive;font-size:22px;color:#93c5fd;">Development by Guille</div>
        <div style="margin-top:32px;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0.85;animation:splash-pulse 1.8s ease-in-out infinite;">
          <span style="border:1.2px solid #2a2e35;border-radius:5px;padding:3px 9px;font-size:10.5px;color:#cbd5e1;font-weight:600;">ENTER</span>
          <span style="font-size:11.5px;color:#5a7a85;">o tocá la pantalla para continuar</span>
        </div>
      </div>
    </div>
    <style>@keyframes splash-pulse { 0%,100%{opacity:0.45;} 50%{opacity:1;} }</style>
  `;
  document.body.appendChild(el);

  function cerrarSplash() {
    document.removeEventListener('keydown', onKeydown);
    el.removeEventListener('click', cerrarSplash);
    el.style.transition = 'opacity 0.3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }
  function onKeydown(e) { if (e.key === 'Enter') cerrarSplash(); }
  document.addEventListener('keydown', onKeydown);
  el.addEventListener('click', cerrarSplash);
}

document.getElementById("nav-version").textContent = "v" + APP_VERSION;

// ---------- init ----------
loadItems();
goTo("inventario");
mostrarSplash();
if (DriveSync.conectado()) DriveSync.sync();

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
