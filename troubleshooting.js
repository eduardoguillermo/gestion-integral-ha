/*!
 * Troubleshooting: sección «Troubleshooting» de Gestión Integral de HA
 * Guía de diagnóstico y reparación de equipos (hoy: UPS Forza SL-1012UL-A).
 *
 * Archivo único: datos + estilos + render. Sin dependencias. Sin estado guardado.
 * Uso:  Troubleshooting.render(contenedor)
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';

  /* ------------------------------------------------------------------ */
  /*  DATOS                                                              */
  /*  Texto entre `comillas invertidas` se muestra como código.          */
  /* ------------------------------------------------------------------ */

  const EQUIPO = {
    nombre: 'UPS Forza SL-1012UL-A',
    resumen: '1000 VA / 600 W · interactiva · 2 baterías de 12 V / 7 Ah (repuesto FUB-1270) · instalada en mayo de 2024 · monitoreada con NUT en Home Assistant'
  };

  const TABS = [
    { id: 'sintomas', n: 'Diagnóstico por síntoma' },
    { id: 'pruebas', n: 'Pruebas y reparación' },
    { id: 'preventivo', n: 'Plan preventivo' },
    { id: 'referencia', n: 'Referencia' }
  ];

  const FREQ_TXT = { mensual: 'Cada mes', trimestral: 'Cada 3 meses', anual: 'Cada año', multianual: 'Cada 3 a 5 años', eventual: '' };
  const PRIOS = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };

  const INTRO = {
    sintomas: 'Elegí el síntoma que ves y seguí los pasos en orden. Cada diagnóstico te dice qué es normal y qué hacer si el resultado es anormal.',
    pruebas: 'Procedimientos para medir, probar y reparar. Los diagnósticos por síntoma te mandan acá cuando hace falta.'
  };

  const TASKS = [

    {
      id: 'ups-chequeo', cat: 'pruebas', titulo: 'Chequeo mensual de los sensores de la UPS',
      freq: 'mensual', prio: 'media', dur: '2 min', donde: 'Home Assistant: Herramientas para desarrolladores → Estados (filtrá «forza»)',
      obj: 'Comparar los valores de la UPS con tu referencia y detectar a tiempo una batería que se degrada o una comunicación que falla.',
      pasos: [
        "Abrí Herramientas para desarrolladores → Estados y escribí `sensor.forza` en el filtro.",
        "Verificá que `sensor.forza_estado` diga Online y que `sensor.forza_datos_de_estado` diga OL.",
        "Compará la carga de la batería, la tensión de la batería y las tensiones de entrada y salida con los valores de referencia de abajo.",
        "Abrí el historial de `sensor.forza_datos_de_estado` del último mes y fijate si apareció OB, LB o RB sin que un corte de luz lo explique."
      ],
      normal: [
        "Estado Online (OL) y carga de la batería al 100 %.",
        "Tensión de entrada y de salida casi iguales, y tensión del pack cerca de 27,2 V.",
        "Ningún OB, LB ni RB en el historial, salvo los cortes de luz reales."
      ],
      anormal: [
        ["Algún sensor forza_* en unavailable", "Seguí la rutina «Diagnóstico: sensores forza_* en unavailable»."],
        ["Aparecen OB, LB o RB sin corte de luz", "Seguí «Diagnóstico: pita o el estado no es Online»."],
        ["La tensión del pack baja de a poco de un mes al otro", "La batería se está degradando: adelantá la prueba de descarga controlada."],
        ["La carga no llega al 100 % con la red presente", "Dejala cargar 12 horas. Si sigue igual, seguí «Diagnóstico: dura poco en los cortes o dice RB / LB»."]
      ],
      ref: "Valores del 21/09/2026: estado Online (OL), carga 100 %, pack 27,18 V, entrada 228,7 V, salida 228,7 V, frecuencia 50,8 Hz, 2 baterías de 12 V, umbrales por batería de 11,0 V (piso) y 13,8 V (techo). Tu UPS no informa por NUT el consumo ni la autonomía: el nivel de carga se lee en su pantalla LCD."
    },
    {
      id: 'ups-avisos', cat: 'pruebas', titulo: 'Probar los avisos de la UPS',
      freq: 'trimestral', prio: 'alta', dur: '5 min', donde: 'Home Assistant: Ajustes → Automatizaciones y escenas',
      obj: 'Confirmar que las notificaciones de la UPS te llegan al celular antes de necesitarlas.',
      pasos: [
        "Abrí Ajustes → Automatizaciones y escenas.",
        "Abrí cada una de estas cuatro: «Notificación: Alerta de Energía UPS Forza», «Notificación: UPS Batería Crítica», «UPS Forza: sin comunicación» y «UPS Forza: reemplazar baterías».",
        "En el menú ⋮ tocá «Ejecutar acciones». Esto saltea el disparador y prueba solo el envío del mensaje.",
        "Confirmá que la notificación llega al celular."
      ],
      normal: ["Las cuatro notificaciones llegan en pocos segundos."],
      anormal: [
        ["No llega ninguna", "Probá el servicio `notify.mobile_app_2312dra50g` desde Herramientas para desarrolladores → Acciones. Si falla, revisá la app del celular y sus permisos."],
        ["Llega al ejecutar las acciones pero un corte real no avisa", "El disparador no coincide. Seguí «Diagnóstico: la UPS está bien pero no llega el aviso»."]
      ],
      ref: "Canal de aviso de las cuatro automatizaciones: `notify.mobile_app_2312dra50g`."
    },
    {
      id: 'ups-descarga', cat: 'pruebas', titulo: 'Prueba de descarga controlada',
      freq: 'trimestral', prio: 'alta', dur: '20 a 60 min', donde: 'UPS desenchufada de la pared y sensores en Home Assistant',
      obj: 'Medir la autonomía real y detectar el desgaste de las baterías antes de que fallen en un corte.',
      pasos: [
        "Hacé un backup manual y confirmá que llegó a Google Drive.",
        "Verificá que la batería esté al 100 % desde hace 12 horas o más, y avisá a quien use la red.",
        "Calculá cuánto debería durar: `(2 × 12 V × 7 Ah × 0,6) ÷ watts conectados`. Con 50 W da unas 2 horas. La ficha de fábrica dice 50 min con una PC y un monitor.",
        "Desenchufá la UPS de la pared y empezá a cronometrar. El estado tiene que pasar a OB.",
        "Mirá `sensor.forza_carga_de_la_bateria` y `sensor.forza_tension_de_la_bateria` cada tanto y anotá cuánto baja la carga cada 10 minutos.",
        "Volvé a enchufar cuando la carga baje del 30 %. No la descargues hasta el fondo.",
        "Con la caída medida, proyectá el tiempo hasta el final y compará con el esperado."
      ],
      normal: [
        "La carga baja de forma pareja y el tiempo proyectado es 70 % o más del esperado.",
        "Al volver la red, la UPS pasa a CHRG y recarga (unas 4 horas hasta el 90 %)."
      ],
      anormal: [
        ["El tiempo proyectado es entre 50 y 70 % del esperado", "Repetí la prueba en 30 días. Si sigue bajando, planificá el cambio del par."],
        ["Menos de la mitad de lo esperado", "Reemplazá el par (seguí «Reemplazo de las baterías»)."],
        ["Se apaga antes de llegar al 30 %", "Baterías agotadas: reemplazá el par y no repitas la prueba con las viejas."],
        ["No pasa a OB al desenchufarla", "Falla de la UPS: servicio técnico."]
      ],
      prec: [
        "Conectá a la UPS solo electrónica: nada de motores, bombas ni estufas.",
        "Si el NUC está conectado a la UPS, un apagado brusco puede dañar la base de datos: por eso el backup previo.",
        "Los umbrales de 70 % y 50 % son reglas prácticas orientativas, no datos del fabricante."
      ]
    },
    {
      id: 'ups-medicion', cat: 'pruebas', titulo: 'Medir las baterías en reposo (si hay acceso)',
      freq: 'anual', prio: 'media', dur: '20 min', donde: 'Compartimiento de baterías de la UPS, con multímetro',
      obj: 'Comparar las dos baterías entre sí y detectar una que esté fallando.',
      pasos: [
        "Comprobá si tu UPS tiene compuerta de acceso a las baterías. La ficha de Forza no lo indica: si hay que desarmar la carcasa, no la abras y hacé solo la prueba de descarga.",
        "Apagá la UPS y desenchufala de la pared.",
        "Abrí la compuerta y dejá los bornes a la vista, sin desconectar nada.",
        "Con el multímetro en V CC, medí cada batería por separado: punta roja al «+» y negra al «−».",
        "Anotá las dos lecturas y volvé a cerrar."
      ],
      normal: ["Cada batería en 12,6 V o más, con menos de unos 0,1 V de diferencia entre las dos."],
      anormal: [
        ["Entre 12,0 y 12,6 V", "Dejá cargar 12 horas con la UPS enchufada y volvé a medir en reposo."],
        ["Menos de 12,0 V, o más de unos 0,3 V de diferencia entre las dos", "Una batería está fallando: reemplazá el par."],
        ["Carcasa hinchada, olor a quemado o pérdida", "No sigas: desenchufá la UPS y llamá a servicio técnico."]
      ],
      prec: [
        "No apoyes una herramienta metálica entre dos bornes: provoca un cortocircuito.",
        "Sacate anillos y pulseras, y usá guantes y lentes.",
        "No toques nada más adentro: hay condensadores con tensión peligrosa aunque la UPS esté apagada.",
        "Los valores son reglas prácticas orientativas. Medí siempre en reposo, con la UPS desenchufada."
      ]
    },
    {
      id: 'ups-reemplazo', cat: 'pruebas', titulo: 'Reemplazo de las baterías',
      freq: 'multianual', frecTxt: 'Control fuerte a los 3 años (mayo de 2027), cambio preventivo a los 4 (mayo de 2028), o antes si la descarga da mal',
      prio: 'alta', dur: '30 min', donde: 'UPS Forza SL-1012UL-A, compartimiento de baterías',
      obj: 'Cambiar el par de baterías antes de que fallen, sin quedarte sin respaldo.',
      pasos: [
        "Conseguí el par igual al original: Forza FUB-1270, o dos baterías VRLA de 12 V / 7 Ah de la misma marca y lote.",
        "Si son de repuesto guardado, medí cada una en reposo: 12,6 V o más y parecidas entre sí.",
        "Hacé un backup manual. Si el NUC está conectado a la UPS, apagalo de forma ordenada. Después apagá y desenchufá la UPS.",
        "Sacale una foto al cableado antes de tocar nada.",
        "Desconectá primero el puente entre las baterías y después los cables de la UPS, de a uno.",
        "Conectá las nuevas respetando la polaridad: el «−» de una con el «+» de la otra mediante el puente, y los dos extremos libres a la UPS (rojo al «+», negro al «−»).",
        "Cerrá, enchufá y dejá cargar entre 8 y 12 horas.",
        "Repetí la prueba de descarga controlada y anotá la fecha del cambio: desde ahí cuentan los 3 a 5 años de vida útil."
      ],
      normal: [
        "La UPS vuelve a Online (OL) con la carga al 100 %.",
        "El pack queda cerca de 27,2 V en flotación.",
        "La autonomía medida es 70 % o más de la esperada."
      ],
      anormal: [
        ["Sigue mostrando RB con baterías nuevas", "Algunas UPS mantienen ese estado hasta un ciclo de carga o un test. Dejala cargar y hacé una descarga corta. Si persiste, falla el cargador o la placa: servicio técnico."],
        ["No enciende o no carga", "Revisá la polaridad y el puente. Si está bien, servicio técnico."],
        ["Una de las nuevas mide bastante menos que la otra", "No las uses juntas: reemplazá la que difiere por otra del mismo lote."]
      ],
      prec: [
        "Apagá y desenchufá la UPS antes de abrir. Sacate anillos y pulseras y usá guantes y lentes.",
        "Nunca pongas una herramienta metálica entre dos bornes.",
        "Son baterías de plomo-ácido selladas: reciclalas, no las tires a la basura común."
      ],
      ref: "UPS instalada en mayo de 2024. La garantía de las baterías era de 2 años y ya venció. Repuesto disponible: dos baterías Ultracell UL7-12E (12 V / 7 Ah, VRLA) sin uso."
    },
    {
      id: 'ups-diag-alarma', cat: 'sintomas', titulo: 'Diagnóstico: pita o el estado no es Online',
      freq: 'eventual', prio: 'alta', dur: '10 min', donde: '`sensor.forza_datos_de_estado` y pantalla LCD de la UPS',
      obj: 'Identificar por qué la UPS pita o cambió de estado y decidir si es un corte real, una sobrecarga o una falla.',
      pasos: [
        "Leé el código en `sensor.forza_datos_de_estado`. Puede traer varios juntos, por ejemplo «OL CHRG».",
        "Escuchá el patrón del pitido: cada 10 s es batería, cada 1 s es batería baja, cada 0,5 s es sobrecarga y continuo es falla.",
        "Mirá `sensor.forza_tension_de_entrada`. La UPS pasa a batería solo si la entrada baja de 162 V o supera 268 V.",
        "Si es sobrecarga, desenchufá todo y volvé a conectar de a un equipo por vez.",
        "Revisá que las rejillas estén libres y sin polvo, y que no haya calor alrededor."
      ],
      normal: [
        "Corte real: entrada en 0 V o fuera de 162 a 268 V, estado OB, y la UPS vuelve a OL cuando regresa la red.",
        "CHRG durante unas horas después de un corte."
      ],
      anormal: [
        ["OB con la entrada en unos 228 V", "La UPS cree que no hay red: revisá el cable de entrada y la térmica. Si sigue, es una falla interna: servicio técnico."],
        ["OVER o pitido cada 0,5 s", "Sobrecarga: retirá cargas y no conectes motores, bombas ni estufas."],
        ["RB", "Seguí «Diagnóstico: dura poco en los cortes o dice RB / LB»."],
        ["BYPASS", "Lo conectado no está protegido. Si no lo activaste vos, servicio técnico."],
        ["Pitido continuo, ALARM o FSD", "Falla de la UPS: desconectala y llamá a servicio técnico."],
        ["TRIM o BOOST", "Está regulando la tensión. Es normal si es breve; si dura, mirá la tensión de entrada."]
      ]
    },
    {
      id: 'ups-diag-bateria', cat: 'sintomas', titulo: 'Diagnóstico: dura poco en los cortes o dice RB / LB',
      freq: 'eventual', prio: 'alta', dur: '30 min', donde: 'Sensores de la UPS y, si hay acceso, compartimiento de baterías',
      obj: 'Confirmar si las baterías están agotadas y decidir si hay que cambiarlas.',
      pasos: [
        "Anotá el estado que muestra `sensor.forza_datos_de_estado`: LB (batería baja) o RB (reemplazar).",
        "Verificá la edad de las baterías: instaladas en mayo de 2024, la garantía de 2 años ya venció.",
        "Hacé la rutina «Prueba de descarga controlada».",
        "Si tenés acceso, hacé la rutina «Medir las baterías en reposo».",
        "Según el resultado, cambiá el par con la rutina «Reemplazo de las baterías»."
      ],
      normal: ["Autonomía de 70 % o más de la esperada y sin RB."],
      anormal: [
        ["RB o LB con la red presente", "Baterías agotadas o mal cargadas: dejalas cargar 12 horas y repetí la prueba. Si sigue, reemplazá el par."],
        ["La UPS se apaga apenas se va la luz", "Baterías agotadas: reemplazá el par."],
        ["Carcasa hinchada, olor a ácido o pérdida", "Desenchufá la UPS y llamá a servicio técnico."]
      ],
      ref: "Repuesto de Forza: FUB-1270 (2 unidades, 12 V / 7 Ah). Según la ficha de fábrica, la autonomía es de 50 min con una PC y un monitor, y la recarga llega al 90 % en 4 horas."
    },
    {
      id: 'ups-diag-nut', cat: 'sintomas', titulo: 'Diagnóstico: sensores forza_* en unavailable',
      freq: 'eventual', prio: 'alta', dur: '15 min', donde: 'Host de HA, app Network UPS Tools e integración NUT',
      obj: 'Recuperar la comunicación entre la UPS y Home Assistant.',
      pasos: [
        "Cambiá el cable USB por uno corto y bueno, directo al host y sin hub.",
        "Desde el terminal del host, ejecutá `lsusb` y verificá que aparezca un dispositivo tipo UPS.",
        "Si Home Assistant corre en una máquina virtual, confirmá que el USB siga pasado a la VM.",
        "Abrí Ajustes → Apps → Network UPS Tools → Registro y buscá errores.",
        "Reiniciá la app NUT y, cuando arranque bien, recargá la integración: Ajustes → Dispositivos y servicios → NUT → ⋮ → Recargar.",
        "Opcional: desde otra PC con `nut-client`, ejecutá `upsc` para ver si el servidor responde."
      ],
      cmds: [
        { l: 'Listar los dispositivos USB del host', c: 'lsusb', n: 'La UPS suele figurar como «UPS», «HID UPS», «Cypress» o «Megatec».' },
        { l: 'Consultar la UPS por red (desde otra PC con nut-client)', c: 'upsc <nombre-ups>@<ip-de-HA>', n: 'El nombre de la UPS es el que figura en la configuración de la app.' }
      ],
      normal: [
        "`lsusb` lista la UPS.",
        "El registro de la app muestra la conexión establecida.",
        "Los sensores forza_* vuelven a tener valor."
      ],
      anormal: [
        ["`lsusb` no lista la UPS", "Es el cable, el puerto o la UPS. Probala en otra PC con USB."],
        ["Error «can't claim USB device»", "Otro proceso usa el dispositivo o faltan permisos: reiniciá la app y verificá que no haya dos instancias."],
        ["Error «data stale»", "Se perdió la comunicación con el equipo: cambiá el cable y reiniciá la app."],
        ["Falta solo un sensor (carga o autonomía)", "Es normal: tu modelo no los informa por NUT."],
        ["Se cortó después de una actualización", "Revisá el registro de la app y la versión de la integración."]
      ]
    },
    {
      id: 'ups-diag-avisos', cat: 'sintomas', titulo: 'Diagnóstico: la UPS está bien pero no llega el aviso',
      freq: 'eventual', prio: 'media', dur: '15 min', donde: 'Home Assistant: Ajustes → Automatizaciones y escenas',
      obj: 'Encontrar por qué una automatización de la UPS no te avisa.',
      pasos: [
        "Probá la automatización con «Ejecutar acciones» (menú ⋮). Si el mensaje llega, el envío funciona y el problema está en el disparador.",
        "Si no llega, probá el canal: Herramientas para desarrolladores → Acciones → `notify.mobile_app_2312dra50g` con un mensaje de prueba.",
        "Abrí Ajustes → Automatizaciones y escenas → la automatización → Trazas y mirá dónde se cortó.",
        "Revisá que el router y todo lo que participa del aviso estén conectados a la UPS.",
        "En el celular, revisá los permisos de notificación de la app de Home Assistant y que no esté limitada por el ahorro de batería."
      ],
      normal: ["Llega el mensaje de prueba de las cuatro automatizaciones y un corte real también avisa."],
      anormal: [
        ["Ejecutar acciones funciona pero un corte real no avisa", "«Alerta de Energía» compara el estado exacto de OL a OB y «Batería Crítica» exige OB exacto. Si la UPS informa varios códigos juntos (por ejemplo «OB DISCHRG»), pueden no dispararse: cambiá el disparador para que busque «OB» entre los códigos."],
        ["No llega ni con Ejecutar acciones", "Falla el canal: revisá el nombre del servicio de notificación y la app del celular."],
        ["En un corte real no hay internet", "El router o el módem no están en la UPS: conectalos."]
      ]
    }
  ];

  const PLAN = [
    ['Cada mes', 'Chequeo mensual de los sensores de la UPS', '2 min'],
    ['Cada 3 meses', 'Probar los avisos de la UPS y hacer la prueba de descarga controlada', '5 min y 20 a 60 min'],
    ['Cada año', 'Medir las baterías en reposo, si hay compuerta de acceso', '20 min'],
    ['Mayo de 2027 (3 años)', 'Control fuerte: prueba de descarga completa. Si da menos del 70 % de lo esperado, cambiar el par', '60 min'],
    ['Mayo de 2028 (4 años)', 'Cambio preventivo del par de baterías, aunque las pruebas den bien', '30 min']
  ];

  const FICHA = [
    ['Modelo', 'SL-1012UL-A, 1000 VA / 600 W, interactiva, onda senoidal simulada'],
    ['Baterías', '2 × 12 V / 7 Ah. Repuesto Forza: FUB-1270 (2 unidades)'],
    ['Autonomía de fábrica', '50 min con una PC y un monitor'],
    ['Recarga', '4 horas hasta el 90 % tras una descarga completa'],
    ['Pasa a batería si la entrada…', 'baja de 162 V o supera 268 V (±5 %)'],
    ['Tiempo de transferencia', '2 a 4 ms'],
    ['Temperatura de operación', '0 a 40 °C'],
    ['Garantía de baterías', '2 años. Con instalación en mayo de 2024, ya venció'],
    ['Pantalla', 'LCD táctil: tensión de entrada y salida, capacidad de batería, nivel de carga y estado']
  ];

  const CODIGOS = [
    ['ok', 'OL', 'Online. Red normal.'],
    ['ok', 'CHRG', 'Cargando la batería.'],
    ['warn', 'OB', 'En batería: hay corte o la entrada está fuera de rango.'],
    ['warn', 'DISCHRG', 'Descargando batería.'],
    ['warn', 'BYPASS', 'Bypass: lo conectado no está protegido.'],
    ['warn', 'TRIM / BOOST', 'Corrigiendo tensión alta o baja. Normal si es breve.'],
    ['bad', 'LB', 'Batería baja. Apagado inminente.'],
    ['bad', 'RB', 'Reemplazar batería.'],
    ['bad', 'OVER', 'Sobrecarga.'],
    ['bad', 'ALARM', 'La UPS tiene una alarma activa.'],
    ['bad', 'FSD', 'Apagado forzado en curso.']
  ];

  const PITIDOS = [
    ['Un pitido cada 10 s', 'Funcionando en batería (corte de red)'],
    ['Un pitido por segundo', 'Batería baja'],
    ['Un pitido cada 0,5 s', 'Sobrecarga'],
    ['Sonido continuo', 'Falla de la UPS']
  ];

  const SENSORES = [
    ['`sensor.forza_estado`', 'Online', 'Trabaja desde la red'],
    ['`sensor.forza_datos_de_estado`', 'OL', 'Código crudo de NUT. Acá aparecen OB, LB, RB…'],
    ['`sensor.forza_carga_de_la_bateria`', '100 %', 'Batería llena'],
    ['`sensor.forza_tension_de_la_bateria`', '27,18 V', 'Dos baterías en serie, en flotación'],
    ['`sensor.forza_tension_de_entrada`', '228,7 V', 'Lo que llega de la red'],
    ['`sensor.forza_tension_de_salida`', '228,7 V', 'Igual a la entrada: la UPS deja pasar la red'],
    ['`sensor.forza_frecuencia_de_salida`', '50,8 Hz', 'Copia a la red'],
    ['`sensor.forza_tension_de_bateria_baja` y `_alta`', '11,0 / 13,8 V', 'Piso y techo por batería (22,0 / 27,6 V el pack)']
  ];

  const REFS = [
    ['Tensión de entrada', 'Cerca de 228 V (tu base: 228,7 V)', '162 a 204 V o 236 a 268 V: la UPS regula la tensión', 'Menos de 162 V o más de 268 V: pasa a batería'],
    ['Tensión del pack de baterías con red presente', 'Cerca de 27,2 V (tu base: 27,18 V)', 'Baja de a poco de un mes al otro', 'Menos de 22,0 V o más de 27,6 V (piso y techo de tus sensores)'],
    ['Carga de la batería', '100 % con red presente', 'No vuelve al 100 % unas 12 h después de un corte', 'Menos de 20 % estando en batería'],
    ['Autonomía en la prueba de descarga (regla práctica)', '70 % o más de la esperada', '50 a 70 % de la esperada', 'Menos de 50 % de la esperada'],
    ['Baterías en reposo, medidas una por una (regla práctica)', '12,6 V o más, con menos de 0,1 V de diferencia', '12,0 a 12,6 V', 'Menos de 12,0 V, o más de 0,3 V de diferencia entre las dos']
  ];

  /* ------------------------------------------------------------------ */
  /*  UTILIDADES                                                         */
  /* ------------------------------------------------------------------ */

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const byId = {};
  TASKS.forEach(t => { byId[t.id] = t; });
  let ctx = null;

  /* ------------------------------------------------------------------ */
  /*  ESTILOS                                                            */
  /* ------------------------------------------------------------------ */

  const CSS = `
.tsh{--tsh-card:var(--surface,#161b22);--tsh-card2:var(--surface2,#21262d);--tsh-line:var(--border,#30363d);--tsh-text:var(--text,#e6edf3);--tsh-mute:var(--text2,#a8b3bd);--tsh-accent:var(--primary-light,#4a9fd8);--tsh-ok:var(--green,#3fb950);--tsh-warn:var(--amber,#d29922);--tsh-bad:var(--red,#f85149);--tsh-r:var(--r,6px);--tsh-bg:var(--bg,#0d1117);
color:var(--tsh-text);font:inherit;font-size:13px;line-height:1.55;max-width:960px;margin:0;padding:0 0 32px}
.tsh,.tsh *,.tsh *::before,.tsh *::after{box-sizing:border-box}
.tsh h3{font-size:14px;margin:18px 0 8px;font-weight:700}
.tsh h4{font-size:13px;margin:12px 0 6px;font-weight:700}
.tsh-sub{margin:0;color:var(--tsh-mute)}
.tsh code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--tsh-bg);border:1px solid var(--tsh-line);border-radius:4px;padding:1px 5px}
.tsh-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0 14px}
.tsh-stat{background:var(--tsh-card);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:10px 12px}
.tsh-stat b{display:block;font-size:22px;line-height:1.15}
.tsh-stat span{color:var(--tsh-mute);font-size:11px}
.tsh-stat.is-late b{color:var(--tsh-bad)}
.tsh-stat.is-soon b{color:var(--tsh-warn)}
.tsh-stat.is-ok b{color:var(--tsh-ok)}
.tsh-tabs{display:flex;gap:4px;border-bottom:1px solid var(--tsh-line);margin-bottom:14px;overflow-x:auto}
.tsh-tab{background:none;border:0;border-bottom:2px solid transparent;color:var(--tsh-mute);padding:9px 14px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.tsh-tab[aria-selected="true"]{color:var(--tsh-text);border-bottom-color:var(--tsh-accent)}
.tsh button:focus-visible,.tsh summary:focus-visible,.tsh input:focus-visible,.tsh select:focus-visible{outline:2px solid var(--tsh-accent);outline-offset:2px}
.tsh-intro{background:var(--tsh-card);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);margin:0 0 12px}
.tsh-intro summary{cursor:pointer;padding:11px 14px;font-weight:600}
.tsh-intro ul{margin:0;padding:0 14px 12px 32px}
.tsh-intro li{margin:0 0 6px}
.tsh-filters{display:grid;gap:8px;grid-template-columns:1fr;margin-bottom:6px}
.tsh-filters input,.tsh-filters select{width:100%;background:var(--tsh-card);color:inherit;border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:8px 12px;font:inherit;font-size:12px;min-height:38px}
.tsh-task{background:var(--tsh-card);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);margin:0 0 8px}
.tsh-task>summary{list-style:none;cursor:pointer;padding:12px 14px 12px 38px;position:relative}
.tsh-task>summary::-webkit-details-marker{display:none}
.tsh-task>summary::before{content:"";position:absolute;left:15px;top:19px;width:8px;height:8px;border-right:2px solid var(--tsh-mute);border-bottom:2px solid var(--tsh-mute);transform:rotate(-45deg);transition:transform .15s}
.tsh-task[open]>summary::before{transform:rotate(45deg);top:16px}
.tsh-task-title{display:block;font-weight:600;margin-bottom:6px}
.tsh-chips{display:flex;flex-wrap:wrap;gap:6px}
.tsh-chip{display:inline-block;font-size:11px;line-height:1.5;padding:1px 9px;border-radius:999px;border:1px solid var(--tsh-line);color:var(--tsh-mute);background:var(--tsh-card2);white-space:nowrap}
.tsh-prio-critica{color:var(--tsh-bad);border-color:var(--tsh-bad)}
.tsh-prio-alta{color:var(--tsh-warn);border-color:var(--tsh-warn)}
.tsh-prio-media{color:var(--tsh-accent);border-color:var(--tsh-accent)}
.tsh-st-late{color:var(--tsh-bad);border-color:var(--tsh-bad)}
.tsh-st-soon{color:var(--tsh-warn);border-color:var(--tsh-warn)}
.tsh-st-ok{color:var(--tsh-ok);border-color:var(--tsh-ok)}
.tsh-st-none{border-style:dashed}
.tsh-body{padding:4px 14px 14px;border-top:1px solid var(--tsh-line)}
.tsh-goal{margin:10px 0}
.tsh-meta{display:grid;gap:6px;margin:0 0 4px}
.tsh-meta div{display:flex;gap:8px}
.tsh-meta dt{color:var(--tsh-mute);min-width:88px}
.tsh-meta dd{margin:0}
.tsh-steps{padding-left:22px;margin:4px 0 8px}
.tsh-steps li{margin:0 0 6px}
.tsh-cmd{margin:8px 0 12px}
.tsh-cmd-label{font-weight:600;margin:0 0 4px}
.tsh-cmd-box{display:flex;gap:8px;align-items:flex-start;background:var(--tsh-bg);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:8px 8px 8px 12px}
.tsh-cmd-box pre{flex:1;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--tsh-text)}
.tsh-cmd-note{color:var(--tsh-mute);font-size:12px;margin:4px 0 0}
.tsh-btn{font:inherit;font-size:12px;background:var(--tsh-card2);color:var(--tsh-text);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:6px 12px;min-height:36px;cursor:pointer}
.tsh-btn:hover{border-color:var(--text3,#6b7480)}
.tsh-btn-main{background:var(--primary,#1a6faa);border-color:var(--primary,#1a6faa);color:#fff}
.tsh-btn-main:hover{background:var(--primary-dark,#0d4a72);border-color:var(--primary-dark,#0d4a72)}
.tsh-res{display:grid;gap:10px;margin-top:6px}
.tsh-res-col{border-left:3px solid var(--tsh-line);padding:2px 0 2px 12px}
.tsh-res-ok{border-left-color:var(--tsh-ok)}
.tsh-res-bad{border-left-color:var(--tsh-bad)}
.tsh-res-col h4{margin-top:4px}
.tsh-res-col ul{margin:0;padding-left:18px}
.tsh-res-col li{margin:0 0 8px}
.tsh-res-col li strong{display:block}
.tsh-res-col li span{color:var(--tsh-mute)}
.tsh-note{margin-top:12px;border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:2px 12px 10px;background:var(--tsh-card2)}
.tsh-note-warn{border-color:var(--tsh-warn)}
.tsh-note ul{margin:0;padding-left:18px}
.tsh-note li{margin:0 0 6px}
.tsh-note p{margin:0}
.tsh-log{margin-top:14px;padding-top:12px;border-top:1px solid var(--tsh-line);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.tsh-log-txt{flex:1 1 220px;color:var(--tsh-mute);font-size:12px}
.tsh-empty{border:1px dashed var(--tsh-line);border-radius:var(--tsh-r);padding:18px;text-align:center;color:var(--tsh-mute)}
.tsh-sumlist{list-style:none;margin:0;padding:0}
.tsh-sumlist li{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--tsh-line)}
.tsh-link{background:none;border:0;padding:0;color:var(--tsh-accent);font:inherit;text-align:left;cursor:pointer;flex:1 1 220px}
.tsh-link:hover{text-decoration:underline}
.tsh-tablewrap{overflow-x:auto;border:1px solid var(--tsh-line);border-radius:var(--tsh-r)}
.tsh-table{width:100%;border-collapse:collapse;min-width:640px}
.tsh-table th,.tsh-table td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--tsh-line)}
.tsh-table tr:last-child td{border-bottom:0}
.tsh-table th{background:var(--tsh-card2);font-weight:600}
.tsh-table td:nth-child(2){color:var(--tsh-ok)}
.tsh-table td:nth-child(3){color:var(--tsh-warn)}
.tsh-table td:nth-child(4){color:var(--tsh-bad)}
.tsh-table td:first-child{font-weight:600}
@media(min-width:640px){.tsh-stats{grid-template-columns:repeat(4,1fr)}.tsh-filters{grid-template-columns:1.6fr 1fr 1fr}}
@media(min-width:760px){.tsh-res{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.tsh-task>summary::before{transition:none}}
.tsh-equipo{background:var(--tsh-card);border:1px solid var(--tsh-line);border-radius:var(--tsh-r);padding:12px 14px;margin:0 0 14px}
.tsh-equipo b{display:block;font-size:15px}
.tsh-equipo span{color:var(--tsh-mute);font-size:12px}
.tsh-code-chip{display:inline-block;min-width:78px;text-align:center;padding:1px 8px;border-radius:999px;border:1px solid;font:700 12px ui-monospace,Menlo,Consolas,monospace}
@media(min-width:640px){.tsh-filters{grid-template-columns:1fr}}
.tsh-code-ok{color:var(--tsh-ok)}.tsh-code-warn{color:var(--tsh-warn)}.tsh-code-bad{color:var(--tsh-bad)}
`;

  function injectStyles() {
    if (document.getElementById('tsh-styles')) return;
    const st = document.createElement('style');
    st.id = 'tsh-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */

  function taskHTML(t) {
    const cmds = (t.cmds || []).map(c =>
      '<div class="tsh-cmd">' +
        '<p class="tsh-cmd-label">' + esc(c.l) + '</p>' +
        '<div class="tsh-cmd-box"><pre>' + esc(c.c) + '</pre>' +
        '<button type="button" class="tsh-btn" data-act="copy" data-copy="' + esc(c.c) + '">Copiar</button></div>' +
        (c.n ? '<p class="tsh-cmd-note">' + fmt(c.n) + '</p>' : '') +
      '</div>').join('');
    const anormal = t.anormal.map(a => '<li><strong>' + fmt(a[0]) + '</strong><span>' + fmt(a[1]) + '</span></li>').join('');
    const freq = FREQ_TXT[t.freq];
    return '<details class="tsh-task" id="tsh-' + t.id + '" data-id="' + t.id + '">' +
      '<summary><span class="tsh-task-title">' + esc(t.titulo) + '</span>' +
        '<span class="tsh-chips">' +
          '<span class="tsh-chip tsh-prio-' + t.prio + '">' + PRIOS[t.prio] + '</span>' +
          (freq ? '<span class="tsh-chip">' + esc(freq) + '</span>' : '') +
          '<span class="tsh-chip">' + esc(t.dur) + '</span>' +
        '</span></summary>' +
      '<div class="tsh-body">' +
        '<p class="tsh-goal">' + fmt(t.obj) + '</p>' +
        '<dl class="tsh-meta">' +
          '<div><dt>Dónde</dt><dd>' + fmt(t.donde) + '</dd></div>' +
          '<div><dt>Duración</dt><dd>' + esc(t.dur) + '</dd></div>' +
          (t.frecTxt ? '<div><dt>Cuándo</dt><dd>' + esc(t.frecTxt) + '</dd></div>' : '') +
        '</dl>' +
        (t.pasos && t.pasos.length ? '<h4>Pasos</h4><ol class="tsh-steps">' + t.pasos.map(p => '<li>' + fmt(p) + '</li>').join('') + '</ol>' : '') +
        (cmds ? '<h4>Comandos</h4>' + cmds : '') +
        '<div class="tsh-res">' +
          '<div class="tsh-res-col tsh-res-ok"><h4>Resultado normal</h4><ul>' + t.normal.map(n => '<li>' + fmt(n) + '</li>').join('') + '</ul></div>' +
          '<div class="tsh-res-col tsh-res-bad"><h4>Resultado anormal</h4><ul>' + anormal + '</ul></div>' +
        '</div>' +
        (t.prec ? '<div class="tsh-note tsh-note-warn"><h4>Precauciones</h4><ul>' + t.prec.map(p => '<li>' + fmt(p) + '</li>').join('') + '</ul></div>' : '') +
        (t.ref ? '<div class="tsh-note"><h4>Referencia de tu equipo</h4><p>' + fmt(t.ref) + '</p></div>' : '') +
      '</div></details>';
  }

  function searchBlob(t) {
    return [t.titulo, t.obj, t.donde, (t.pasos || []).join(' '), (t.cmds || []).map(c => c.l + ' ' + c.c).join(' '),
      t.normal.join(' '), t.anormal.map(a => a.join(' ')).join(' ')].join(' ').toLowerCase();
  }

  function listaHTML(cat) {
    const q = ctx.ui.q.trim().toLowerCase();
    const items = TASKS.filter(t => t.cat === cat && (!q || searchBlob(t).indexOf(q) !== -1));
    if (!items.length) return '<p class="tsh-sub">No hay resultados para esa búsqueda.</p>';
    return items.map(taskHTML).join('');
  }

  function tablaHTML(cabeceras, filas, fmtCell) {
    return '<div class="tsh-tablewrap"><table class="tsh-table"><thead><tr>' + cabeceras.map(h => '<th>' + esc(h) + '</th>').join('') +
      '</tr></thead><tbody>' + filas.map(r => '<tr>' + r.map((c, i) => '<td>' + (fmtCell ? fmtCell(c, i) : esc(c)) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function tabHTML() {
    const tab = ctx.ui.tab;
    if (tab === 'sintomas' || tab === 'pruebas') {
      return '<p class="tsh-sub">' + esc(INTRO[tab]) + '</p>' +
        '<div class="tsh-filters"><input type="search" class="tsh-input" data-role="q" placeholder="Buscar (por ejemplo: pitido, OB, unavailable, batería)" value="' + esc(ctx.ui.q) + '"></div>' +
        '<div data-role="list">' + listaHTML(tab) + '</div>';
    }
    if (tab === 'preventivo') {
      return '<p class="tsh-sub">Plan de cuidado de la UPS contado desde la instalación de mayo de 2024. Cada tarea está detallada en «Pruebas y reparación».</p>' +
        tablaHTML(['Cuándo', 'Qué hacer', 'Duración'], PLAN);
    }
    return '<p class="tsh-sub">Datos del equipo, códigos de estado, pitidos y umbrales para decidir si un valor está bien.</p>' +
      '<h3>Ficha del equipo</h3>' + tablaHTML(['Dato', 'Valor'], FICHA) +
      '<h3>Valores de tus sensores (21/09/2026)</h3>' + tablaHTML(['Sensor', 'Valor', 'Qué te dice'], SENSORES, (c, i) => i === 0 ? fmt(c) : esc(c)) +
      '<div class="tsh-note"><h4>Lo que tu UPS no informa</h4><p>No aparecen sensores de carga (% de consumo) ni de autonomía estimada por NUT. El nivel de carga se lee en la pantalla LCD de la UPS.</p></div>' +
      '<h3>Códigos de estado</h3>' + tablaHTML(['Código', 'Significado'], CODIGOS.map(c => [c[0] + '|' + c[1], c[2]]), (c, i) => {
        if (i !== 0) return esc(c);
        const p = c.split('|'); return '<span class="tsh-code-chip tsh-code-' + p[0] + '">' + esc(p[1]) + '</span>';
      }) +
      '<h3>Pitidos</h3>' + tablaHTML(['Patrón', 'Significa'], PITIDOS) +
      '<h3>Valores de referencia</h3>' + tablaHTML(['Qué medir', 'Normal', 'Atención', 'Actuar'], REFS);
  }

  function renderAll() {
    ctx.root.innerHTML =
      '<div class="tsh">' +
        '<div class="tsh-equipo"><b>' + esc(EQUIPO.nombre) + '</b><span>' + esc(EQUIPO.resumen) + '</span></div>' +
        '<div class="tsh-tabs" role="tablist">' +
          TABS.map(t => '<button type="button" class="tsh-tab" role="tab" data-act="tab" data-tab="' + t.id + '" aria-selected="' + (ctx.ui.tab === t.id) + '">' + esc(t.n) + '</button>').join('') +
        '</div>' +
        '<div data-role="tabbody">' + tabHTML() + '</div>' +
      '</div>';
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && global.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
    } catch (e) { /* cae al método alternativo */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function onClick(ev) {
    const el = ev.target.closest('[data-act]');
    if (!el || !ctx.root.contains(el)) return;
    if (el.dataset.act === 'tab') {
      ctx.ui.tab = el.dataset.tab; ctx.ui.q = ''; renderAll();
    } else if (el.dataset.act === 'copy') {
      copyText(el.dataset.copy).then(ok => {
        const prev = el.textContent;
        el.textContent = ok ? 'Copiado' : 'No se pudo copiar';
        setTimeout(() => { el.textContent = prev; }, 1600);
      });
    }
  }

  function onInput(ev) {
    if (!ev.target.dataset || ev.target.dataset.role !== 'q') return;
    ctx.ui.q = ev.target.value;
    const list = ctx.root.querySelector('[data-role="list"]');
    if (list) list.innerHTML = listaHTML(ctx.ui.tab);
  }

  function render(container) {
    if (!container) throw new Error('Troubleshooting.render: falta el contenedor');
    if (ctx && ctx.root) {
      ctx.root.removeEventListener('click', onClick);
      ctx.root.removeEventListener('input', onInput);
    }
    injectStyles();
    ctx = { root: container, ui: { tab: 'sintomas', q: '' } };
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    renderAll();
    return api;
  }

  const api = { version: VERSION, render: render, tasks: TASKS };
  global.Troubleshooting = api;
})(typeof window !== 'undefined' ? window : globalThis);
