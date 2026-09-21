/*!
 * Mantenimiento: sección «Mantenimiento» de Gestión Integral de HA
 * Manual de rutinas del servidor Home Assistant (NUC).
 *
 * Archivo único: datos + estilos + render. Sin dependencias.
 * Uso:  Mantenimiento.render(contenedor, { onChange: estado => guardar(estado) })
 */
(function (global) {
  'use strict';

  const VERSION = '1.0.0';
  const DEFAULT_KEY = 'gihaMantenimiento';

  /* ------------------------------------------------------------------ */
  /*  DATOS DEL MANUAL                                                   */
  /*  Texto entre `comillas invertidas` se muestra como código.          */
  /* ------------------------------------------------------------------ */

  const CATS = [
    { id: 'monitoreo', nombre: 'Monitoreo del sistema' },
    { id: 'backups', nombre: 'Copias de seguridad' },
    { id: 'updates', nombre: 'Actualizaciones' },
    { id: 'bd', nombre: 'Base de datos' },
    { id: 'hardware', nombre: 'Hardware del NUC' },
    { id: 'seguridad', nombre: 'Seguridad y accesos' },
    { id: 'limpieza', nombre: 'Orden dentro de Home Assistant' }
  ];

  const FREQS = {
    diaria: { n: 'Diaria', d: 1, sub: 'Todos los días' },
    semanal: { n: 'Semanal', d: 7, sub: 'Cada 7 días' },
    mensual: { n: 'Mensual', d: 30, sub: 'Cada 30 días' },
    trimestral: { n: 'Trimestral', d: 90, sub: 'Cada 3 meses' },
    semestral: { n: 'Semestral', d: 182, sub: 'Cada 6 meses' },
    anual: { n: 'Anual', d: 365, sub: 'Una vez por año' },
    multianual: { n: 'Cada varios años', d: 1460, sub: 'Cada 3 a 5 años, o antes si el equipo lo pide' }
  };

  const PRIOS = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };

  const INTRO = [
    "Los comandos `ha ...` se ejecutan en el terminal de la app Terminal & SSH o Advanced SSH & Web Terminal (Ajustes → Apps).",
    "Para pegar en el terminal web usá Ctrl + Shift + V. Pegá cada comando en una sola línea y sin caracteres de más al final.",
    "Antes de actualizar o de tocar el hardware, hacé siempre un backup manual y confirmá que llegó a Google Drive.",
    "Las duraciones son estimadas. En «Valores de referencia» tenés todos los umbrales juntos.",
    "Cuando termines una rutina, tocá «Marcar como hecha»: la fecha queda guardada y la app calcula cuándo vence la próxima."
  ];

  const TASKS = [
    /* ------------------------- MONITOREO ------------------------- */
    {
      id: 'mon-temp', cat: 'monitoreo', titulo: 'Temperatura del procesador',
      freq: 'semanal', frecTxt: 'Semanal, más una alerta automática permanente',
      prio: 'alta', dur: '2 min', donde: 'Home Assistant: Ajustes → Dispositivos y servicios',
      obj: 'Detectar a tiempo polvo acumulado, pasta térmica seca o un ventilador que empieza a fallar.',
      pasos: [
        "Verificá que la integración System Monitor esté agregada (Ajustes → Dispositivos y servicios). Si no está, agregala.",
        "Buscá el sensor Processor temperature y abrí su gráfico de los últimos 7 días.",
        "Compará con tu valor habitual (unos 47 °C en reposo) y fijate si hay picos que no coincidan con un backup o una actualización.",
        "Una sola vez, creá una automatización que te avise si la temperatura supera los 80 °C durante más de 5 minutos."
      ],
      cmds: [
        { l: 'Leer la temperatura desde el terminal (opcional)', c: 'cat /sys/class/thermal/thermal_zone*/temp',
          n: 'El valor viene en milésimas de grado: 47000 equivale a 47 °C. Si el archivo no existe dentro de la app de terminal, usá el sensor de System Monitor.' }
      ],
      normal: [
        "Entre 35 y 55 °C en reposo con carga baja (4 a 7 %). Tu valor de referencia es 47 °C.",
        "Picos de 60 a 70 °C durante backups, actualizaciones o reinicios, que bajan solos en unos minutos."
      ],
      anormal: [
        ["Más de 65 a 70 °C sostenidos en reposo", "Limpiá el polvo del disipador y del ventilador. Si sigue alto, cambiá la pasta térmica."],
        ["Subida gradual de varios grados a lo largo de semanas", "Es el patrón típico de polvo acumulado o pasta seca: programá la limpieza."],
        ["Más de 80 °C", "Actuá pronto: apagá con `ha host shutdown` o desde Ajustes → Sistema y revisá ventilador y disipador. El procesador reduce su velocidad (throttling) cerca de los 100 °C."],
        ["El ventilador suena fuerte o vibra", "Seguí la rutina «Inspección del ventilador»."]
      ]
    },
    {
      id: 'mon-recursos', cat: 'monitoreo', titulo: 'Carga de procesador y memoria',
      freq: 'semanal', prio: 'media', dur: '3 min', donde: 'Home Assistant y terminal',
      obj: 'Ver si el sistema trabaja holgado o si alguna app o integración consume de más.',
      pasos: [
        "Abrí los sensores de System Monitor de uso de procesador y de memoria y mirá el gráfico de 7 días.",
        "Buscá picos sostenidos (no los breves) y una memoria que solo sube y nunca baja.",
        "Si algo se ve raro, corré los comandos de abajo para ver cuánto usa Home Assistant Core y el Supervisor.",
        "Identificá la app o integración responsable: las apps de voz local (Whisper, Piper) consumen bastante si las usás."
      ],
      cmds: [
        { l: 'Uso de Home Assistant Core', c: 'ha core stats', n: 'Muestra cpu_percent y memory_usage frente a memory_limit.' },
        { l: 'Uso del Supervisor', c: 'ha supervisor stats' }
      ],
      normal: [
        "Procesador en 4 a 7 % en reposo (tu base habitual), con picos breves al iniciar o hacer backups.",
        "Memoria estable, por debajo del 70 % del total."
      ],
      anormal: [
        ["Procesador por encima del 30 % de forma sostenida sin actividad", "Buscá qué app o integración lo causa mirando los registros. Reiniciá la sospechosa o actualizala."],
        ["La memoria sube día tras día y no baja", "Posible fuga: reiniciá la app o integración implicada y revisá si hay una actualización."],
        ["Memoria por encima del 85 % o uso alto de zram", "Detené apps pesadas que no uses. Si es permanente, evaluá ampliar la RAM."]
      ]
    },
    {
      id: 'mon-disco', cat: 'monitoreo', titulo: 'Espacio en disco',
      freq: 'mensual', prio: 'alta', dur: '3 min', donde: 'Ajustes → Sistema → Almacenamiento, y terminal',
      obj: 'Evitar que el SSD se llene: con el disco lleno Home Assistant deja de escribir y puede corromper datos.',
      pasos: [
        "Abrí Ajustes → Sistema → Almacenamiento y mirá cuánto está usado del total (tu SSD es de unos 447 GB).",
        "Revisá cuántas copias de seguridad locales se acumulan. La app Google Drive Backup las borra según su política de retención.",
        "Si el uso crece rápido, mirá la rutina «Tamaño de la base de datos y purga»."
      ],
      cmds: [
        { l: 'Datos del disco desde el terminal', c: 'ha host info', n: 'Buscá disk_free, disk_total y disk_used (en GB).' }
      ],
      normal: ["Uso por debajo del 70 % y estable de un mes al otro."],
      anormal: [
        ["Entre 70 y 85 %", "Borrá backups locales viejos y revisá la purga de la base de datos."],
        ["Más de 85 %", "Urgente: liberá espacio ya. Home Assistant puede fallar al escribir."],
        ["Crece varios puntos por semana", "Casi siempre es la base de datos o los registros. Ver la rutina de base de datos."]
      ]
    },
    {
      id: 'mon-salud', cat: 'monitoreo', titulo: 'Reparaciones y estado del Supervisor',
      freq: 'semanal', prio: 'alta', dur: '2 min', donde: 'Ajustes → Sistema → Reparaciones, y terminal',
      obj: 'Enterarte a tiempo de avisos del sistema antes de que se conviertan en fallas.',
      pasos: [
        "Abrí Ajustes → Sistema → Reparaciones y leé cada aviso.",
        "Resolvé los que tengan asistente o entendé por qué aparecen.",
        "Confirmá el estado del Supervisor con los comandos de abajo."
      ],
      cmds: [
        { l: 'Estado del Supervisor', c: 'ha supervisor info', n: 'healthy y supported deben decir true.' },
        { l: 'Problemas detectados', c: 'ha resolution info', n: 'Las listas issues, unhealthy y unsupported deben estar vacías.' }
      ],
      normal: ["healthy: true y supported: true.", "Sin reparaciones pendientes, o solo avisos informativos."],
      anormal: [
        ["unhealthy con un motivo indicado", "Corregí el motivo. Si el aviso lo sugiere, ejecutá `ha supervisor repair`."],
        ["unsupported", "Algo del sistema no cumple lo esperado. Leé la razón y corregila antes de seguir actualizando."],
        ["Reparaciones de integraciones", "Seguí el asistente de cada una o eliminá la integración si ya no la usás."]
      ]
    },
    {
      id: 'mon-logs', cat: 'monitoreo', titulo: 'Revisión de registros (logs)',
      freq: 'semanal', prio: 'media', dur: '5 min', donde: 'Ajustes → Sistema → Registros, y terminal',
      obj: 'Encontrar errores repetidos que todavía no se notan en el uso diario.',
      pasos: [
        "Abrí Ajustes → Sistema → Registros con el selector en Home Assistant Core y filtrá por Error y Warning.",
        "Ignorá los avisos aislados. Lo que importa es lo que se repite.",
        "Cambiá el selector a Supervisor y repetí.",
        "Anotá la integración o el dispositivo que falla para atenderlo en la rutina mensual."
      ],
      cmds: [
        { l: 'Últimas 100 líneas del Core', c: 'ha core logs -n 100' },
        { l: 'Solo errores de las últimas 500 líneas', c: 'ha core logs -n 500 | grep -i error' },
        { l: 'Últimas 100 líneas del Supervisor', c: 'ha supervisor logs -n 100', n: 'En versiones recientes ya no existe /config/home-assistant.log: leé los registros con estos comandos o desde la interfaz.' }
      ],
      normal: ["Pocos warnings ocasionales (un dispositivo que tarda en responder).", "Sin errores que se repitan."],
      anormal: [
        ["El mismo error cada pocos segundos", "Integración caída o dispositivo desconectado: revisá IP, credenciales, batería o red y recargá la integración."],
        ["Errores de base de datos (database is locked, disk I/O error)", "Revisá el espacio en disco y hacé el chequeo SMART del SSD."],
        ["Mensajes de falta de memoria o procesos terminados", "Revisá el consumo de memoria y las apps pesadas."]
      ]
    },
    {
      id: 'mon-apps', cat: 'monitoreo', titulo: 'Estado de las apps críticas',
      freq: 'mensual', prio: 'media', dur: '3 min', donde: 'Ajustes → Apps',
      obj: 'Comprobar que las apps de las que depende tu domótica siguen iniciadas y sanas (por ejemplo Mosquitto, Matter Server, ESPHome y Google Drive Backup).',
      pasos: [
        "Abrí Ajustes → Apps y confirmá que las apps que usás figuren iniciadas.",
        "Dentro de cada crítica, verificá que Iniciar en el arranque y Vigilancia estén activados.",
        "Abrí la pestaña Registro de Mosquitto, Matter Server y Google Drive Backup y buscá errores repetidos.",
        "Decidí la actualización automática app por app: dejala manual en las críticas para poder hacer backup antes."
      ],
      normal: ["Apps iniciadas, sin estado Error y con registros limpios."],
      anormal: [
        ["App detenida o en Error", "Abrí su Registro para ver la causa y reiniciala. Si se repite después de reiniciar el equipo, revisá su configuración o su última actualización."],
        ["La app se reinicia una y otra vez", "El Vigilancia la está levantando en bucle: mirá el registro y la memoria disponible."]
      ]
    },

    /* --------------------------- BACKUPS --------------------------- */
    {
      id: 'bkp-verif', cat: 'backups', titulo: 'Verificar las copias de seguridad',
      freq: 'semanal', prio: 'critica', dur: '5 min', donde: 'Ajustes → Sistema → Copias de seguridad, app Google Drive Backup y Google Drive',
      obj: 'Confirmar que hay copias recientes y que están fuera del NUC. Una copia guardada solo en el mismo SSD no te protege si el SSD falla.',
      pasos: [
        "Abrí Ajustes → Sistema → Copias de seguridad y mirá la fecha de la última.",
        "Abrí la app Google Drive Backup y confirmá que sube a Drive sin errores ni pedidos de autorización.",
        "Entrá a Google Drive y comprobá que las copias estén y que las fechas coincidan.",
        "Compará el tamaño con el de copias anteriores."
      ],
      cmds: [
        { l: 'Listar las copias locales', c: 'ha backups list', n: 'Muestra nombre, fecha y tamaño de cada copia.' },
        { l: 'Crear una copia manual', c: 'ha backups new --name "Manual"', n: 'Usala antes de actualizar o de abrir el equipo.' }
      ],
      normal: [
        "La copia más reciente es tan nueva como tu programación (diaria o semanal).",
        "La misma copia está en Google Drive.",
        "El tamaño es estable y crece de a poco."
      ],
      anormal: [
        ["Sin copias nuevas hace más de 7 días", "Revisá la programación, el espacio libre y el registro de Google Drive Backup."],
        ["La app pide autorizar Google de nuevo o muestra error", "Volvé a autorizar la cuenta y forzá una copia manual."],
        ["El tamaño cambia de golpe (mucho mayor o mucho menor)", "Puede ser la base de datos creciendo o una copia incompleta. Mirá la rutina de base de datos."],
        ["Solo hay copias locales", "Corregilo hoy: sin copia externa un fallo del SSD te deja sin nada."]
      ]
    },
    {
      id: 'bkp-restore', cat: 'backups', titulo: 'Prueba de restauración',
      freq: 'semestral', prio: 'critica', dur: '30 a 60 min', donde: 'Tu PC y, si es posible, una segunda instalación de Home Assistant',
      obj: 'Comprobar que las copias sirven de verdad. Una copia que nunca se probó es una suposición.',
      pasos: [
        "Descargá la copia más reciente desde Google Drive a tu PC.",
        "Verificá que el archivo abre y que su tamaño es coherente.",
        "Confirmá que guardaste la clave de cifrado (o el kit de emergencia) fuera del NUC, si tus copias están cifradas. Sin ella no se puede restaurar.",
        "Ideal: restaurala en una segunda instalación (máquina virtual o equipo de repuesto) y comprobá que arrancan las integraciones y los dashboards.",
        "Anotá cuánto tardó y qué faltó."
      ],
      cmds: [
        { l: 'Listar el contenido de la copia (en tu PC con Linux, Mac o WSL)', c: 'tar -tf nombre_de_la_copia.tar | head',
          n: 'Si lista archivos, el paquete exterior está íntegro. El contenido cifrado solo se comprueba al restaurar.' }
      ],
      normal: ["La copia se abre y se restaura sin errores.", "Home Assistant arranca con tus dispositivos y automatizaciones."],
      anormal: [
        ["Archivo dañado o incompleto", "Creá una copia manual nueva, verificá que llegue a Drive y repetí la prueba."],
        ["No tenés la clave de cifrado", "Guardala hoy en un lugar fuera del NUC. La encontrás en la configuración de Copias de seguridad."],
        ["La restauración queda incompleta", "Anotá qué falta (apps, integraciones, dashboards) y corregí el origen antes de la próxima copia."]
      ]
    },
    {
      id: 'bkp-plan', cat: 'backups', titulo: 'Plan de recuperación ante fallas',
      freq: 'semestral', prio: 'alta', dur: '15 min de revisión', donde: 'Tu PC y el router',
      obj: 'Tener escrito y a mano qué hacer si el SSD o el NUC dejan de funcionar, para volver a andar en una tarde.',
      pasos: [
        "Guardá fuera del NUC: la última copia de seguridad, la clave de cifrado y un pendrive.",
        "Tené definido el reemplazo: un SSD de 120 a 240 GB alcanza de sobra.",
        "Descargá la imagen de Home Assistant OS para Generic x86-64 desde la página oficial de instalación.",
        "Grabá la imagen en el SSD nuevo con un adaptador USB y balenaEtcher, o arrancá el NUC desde un pendrive con el instalador.",
        "Instalá el SSD, encendé y esperá unos 20 minutos hasta que responda `homeassistant.local:8123`.",
        "En la pantalla de bienvenida elegí restaurar desde una copia de seguridad, subí el archivo e ingresá la clave.",
        "Cuando termine, verificá integraciones y dispositivos y reactivá las copias automáticas.",
        "Reservá la IP del NUC en el router para que no cambie (la actual es 192.168.68.148)."
      ],
      normal: ["El plan está escrito y probado.", "Copia y clave disponibles fuera del NUC."],
      anormal: [
        ["Copia o clave solo dentro del NUC", "Copialas afuera hoy mismo."],
        ["Los pasos o la versión de la imagen cambiaron", "Revisá la guía oficial de instalación de Home Assistant OS y actualizá esta rutina."]
      ],
      prec: ["Si hacés el reemplazo con el NUC actual todavía funcionando, hacé antes una copia manual completa."]
    },

    /* ------------------------ ACTUALIZACIONES ------------------------ */
    {
      id: 'upd-mensual', cat: 'updates', titulo: 'Actualizaciones de Home Assistant',
      freq: 'mensual', prio: 'alta', dur: '20 a 30 min', donde: 'Ajustes → Actualizaciones y terminal',
      obj: 'Mantener Core, Supervisor, sistema operativo y apps al día sin romper nada.',
      pasos: [
        "Creá una copia manual completa y verificá que llegue a Google Drive.",
        "Leé las notas de versión de Core, en especial los cambios importantes (breaking changes) que afecten integraciones que usás.",
        "Actualizá primero las apps (Ajustes → Apps).",
        "Verificá la configuración antes de reiniciar con `ha core check`.",
        "Actualizá Home Assistant Core y esperá a que vuelva solo.",
        "Actualizá el Supervisor y, si hay novedades, el sistema operativo. El sistema operativo reinicia el NUC: hacelo cuando no dependas de la domótica.",
        "Comprobá Reparaciones, registros y que dispositivos y automatizaciones respondan."
      ],
      cmds: [
        { l: 'Copia manual previa', c: 'ha backups new --name "Antes de actualizar"' },
        { l: 'Validar la configuración', c: 'ha core check' },
        { l: 'Ver la versión de Core', c: 'ha core info' },
        { l: 'Ver la versión del sistema operativo', c: 'ha os info' }
      ],
      normal: ["Home Assistant vuelve en pocos minutos, sin errores nuevos y con las apps iniciadas."],
      anormal: [
        ["Core no arranca", "Mirá `ha core logs -n 100`. Si no se resuelve, restaurá la copia previa."],
        ["Una integración se rompe tras actualizar", "Leé las notas de versión, actualizá el componente o restaurá la copia."],
        ["La actualización lleva más de 30 minutos", "No cortes la energía. Mirá el registro del Supervisor y esperá."],
        ["Falta de espacio", "Liberá espacio antes de reintentar."]
      ],
      prec: [
        "Después de una versión mayor (la .0 de cada mes) conviene esperar a las primeras correcciones (.1, .2) antes de actualizar.",
        "Nunca cortes la energía durante una actualización."
      ]
    },

    /* -------------------------- BASE DE DATOS ------------------------- */
    {
      id: 'bd-tamano', cat: 'bd', titulo: 'Tamaño de la base de datos y purga',
      freq: 'mensual', prio: 'media', dur: '5 min', donde: 'Terminal y Herramientas de desarrollo',
      obj: 'Controlar cuánto escribe Home Assistant en el SSD. Menos escritura significa más vida útil para el disco.',
      pasos: [
        "Mirá el tamaño del archivo de la base de datos con el primer comando.",
        "Anotalo y compará con el del mes anterior.",
        "Revisá la configuración de recorder: purge_keep_days, commit_interval y exclusiones. Una configuración razonable conserva 7 a 10 días y excluye entidades muy ruidosas (potencia, temperaturas que cambian cada segundo).",
        "Si creció mucho, andá a Herramientas de desarrollo → Acciones y ejecutá recorder.purge con keep_days: 7 y repack: true."
      ],
      cmds: [
        { l: 'Tamaño de la base de datos', c: 'ls -lh /config/home-assistant_v2.db' },
        { l: 'Ejemplo de configuración (configuration.yaml)',
          c: 'recorder:\n  purge_keep_days: 7\n  commit_interval: 30\n  exclude:\n    entity_globs:\n      - sensor.*_power',
          n: 'Adaptalo a tus entidades. Después de editar, validá con `ha core check` y reiniciá Core.' }
      ],
      normal: ["Tamaño estable o que crece despacio hasta un tope, según cuántos días conserves y cuántas entidades registres."],
      anormal: [
        ["Crece sin parar semana tras semana", "Alguna entidad escribe de más o la purga no corre. Buscá la entidad ruidosa y excluila."],
        ["La purga no reduce el tamaño", "Falta el repack: ejecutala con repack: true (necesita espacio libre parecido al tamaño de la base)."],
        ["Errores de recorder o database is locked en los registros", "Revisá el espacio libre y hacé el chequeo SMART del SSD."]
      ]
    },

    /* ------------------------------ HARDWARE ------------------------------ */
    {
      id: 'hw-smart', cat: 'hardware', titulo: 'Estado de salud del SSD (SMART)',
      freq: 'anual', frecTxt: 'Una vez por año (cada 6 meses si los valores empeoran)',
      prio: 'critica', dur: '10 min', donde: 'Ajustes → Apps → Advanced SSH & Web Terminal',
      obj: 'Saber cómo está el SSD antes de que falle. Es lo primero que se rompe en un equipo con muchos años.',
      pasos: [
        "Hacé una copia manual y verificá que esté en Google Drive.",
        "Instalá Advanced SSH & Web Terminal desde Ajustes → Apps → Tienda de apps. El Terminal & SSH oficial no muestra el interruptor de Modo de protección.",
        "En su pestaña Configuración desplegá la sección ssh, poné una contraseña y guardá.",
        "En la pestaña Información apagá Modo de protección (está en la columna Controles, al final de la lista) y tocá Iniciar.",
        "Abrí el terminal y corré `lsblk` para ver tu disco.",
        "Corré el comando de SMART con docker (segundo comando de abajo).",
        "Compará el resultado con los valores normales.",
        "Al terminar, detené la app y volvé a activar Modo de protección."
      ],
      cmds: [
        { l: 'Ver el disco', c: 'lsblk', n: 'Tu disco figura como sda (SATA). Si apareciera nvme0n1, cambiá /dev/sda por /dev/nvme0n1 en los comandos siguientes.' },
        { l: 'Informe SMART completo',
          c: 'docker run --rm --privileged alpine sh -c "apk add -q smartmontools && smartctl -a /dev/sda"',
          n: 'Corre smartctl en un contenedor temporal con acceso al hardware. La primera vez tarda un minuto porque baja la imagen. Solo lee el disco, no modifica nada. Directamente desde la app de terminal daba «Operation not permitted».' },
        { l: 'Versión filtrada con lo importante',
          c: 'docker run --rm --privileged alpine sh -c "apk add -q smartmontools && smartctl -a /dev/sda" | grep -Ei "model|power_on|wear|realloc|pending|uncorrect|percent|life|health"' }
      ],
      normal: [
        "SMART overall-health self-assessment: PASSED.",
        "Reallocated_Sector_Ct (5) en 0.",
        "Reported_Uncorrect (187) en 0 y sin Current_Pending_Sector.",
        "Media_Wearout_Indicator (233) alto (100 es disco nuevo) y sin caídas bruscas."
      ],
      anormal: [
        ["Resultado FAILED", "Reemplazá el SSD de inmediato. Hacé backup ya."],
        ["Reallocated_Sector_Ct mayor a 0 y subiendo entre chequeos", "El disco está degradándose: planificá el reemplazo pronto."],
        ["Current_Pending_Sector o Reported_Uncorrect mayores a 0", "Reemplazalo: hay sectores que no se pueden leer."],
        ["Media_Wearout_Indicator por debajo de 20", "Fin de vida útil cercano: planificá el reemplazo."],
        ["Operation not permitted", "Confirmá que Modo de protección esté apagado y que usás el comando con docker. Alternativa: arrancá el NUC con un pendrive de Linux y corré `sudo smartctl -a /dev/sda`."]
      ],
      prec: [
        "Con Modo de protección apagado la app tiene acceso total al sistema. Detenela y reactivá el modo cuando termines.",
        "En SSD económicos como el WD Green algunos atributos no son confiables: Power_On_Hours marcó 9 en tu chequeo. El aviso «invalid SMART checksum» del registro de errores es habitual en estos modelos y no es una falla por sí solo."
      ],
      ref: "Chequeo del 19/09/2026: WD Green 2.5\" de 480 GB, SMART PASSED, sectores reasignados 0, errores sin corregir 0 y desgaste 0."
    },
    {
      id: 'hw-polvo', cat: 'hardware', titulo: 'Limpieza de polvo',
      freq: 'semestral', frecTxt: 'Cada 6 a 12 meses (antes si hay mascotas o mucho polvo)',
      prio: 'media', dur: '30 min', donde: 'Interior del NUC',
      obj: 'Mantener libre el disipador y el ventilador para que el procesador no se caliente.',
      pasos: [
        "Hacé una copia manual antes de tocar el equipo.",
        "Apagá desde Home Assistant con `ha host shutdown` y esperá a que se apague del todo.",
        "Desconectá el cable de alimentación y los demás cables. Esperá 1 minuto.",
        "Sacá los tornillos de la tapa inferior (generalmente 4) y abrí la carcasa.",
        "Sujetá las aspas del ventilador con un palito plástico para que no giren con el aire.",
        "Soplá con aire comprimido en ráfagas cortas sobre el disipador y el ventilador, con el pico a unos 10 cm.",
        "Quitá el polvo suelto con un pincel suave.",
        "Verificá que el ventilador gira libre y que ningún cable roza las aspas.",
        "Cerrá, reconectá, encendé y esperá a que Home Assistant arranque.",
        "Compará la temperatura en reposo con la de antes de limpiar."
      ],
      cmds: [{ l: 'Apagado ordenado', c: 'ha host shutdown' }],
      normal: ["La temperatura baja entre 3 y 10 °C, o queda igual si estaba limpio.", "El ventilador queda silencioso."],
      anormal: [
        ["Sin mejora y más de 65 °C en reposo", "Cambiá la pasta térmica."],
        ["El ventilador roza, vibra o hace ruido", "Reemplazalo: es un repuesto barato."],
        ["El equipo no enciende después de cerrar", "Revisá que el cable del ventilador, el SSD y la memoria estén bien asentados."],
        ["Suciedad con grasa o humedad", "Limpiala con alcohol isopropílico y un paño sin pelusa, con el equipo apagado."]
      ],
      prec: [
        "Trabajá siempre con el equipo apagado y desenchufado.",
        "No des vuelta el envase de aire comprimido: sale líquido frío que daña los componentes.",
        "No soples con la boca ni uses una aspiradora común: humedad y electricidad estática.",
        "Tocá una superficie metálica antes de manipular la placa para descargar la estática."
      ]
    },
    {
      id: 'hw-ventilador', cat: 'hardware', titulo: 'Inspección del ventilador',
      freq: 'mensual', prio: 'baja', dur: '1 min', donde: 'Junto al equipo',
      obj: 'Notar a tiempo un ventilador que falla. Sin él, un i7 se calienta a más de 80 °C en pocos minutos.',
      pasos: [
        "Cuando pases cerca, escuchá el equipo: tiene que sonar parejo y suave.",
        "Sentí con la mano el flujo de aire en las rejillas de salida.",
        "Verificá que las rejillas no estén tapadas y que haya unos centímetros libres alrededor.",
        "Si el sonido cambió, anotalo y mirá la temperatura."
      ],
      normal: ["Zumbido parejo y suave.", "Flujo de aire tibio y constante.", "Rejillas libres."],
      anormal: [
        ["Traqueteo, roce, chillido o vibración", "Apagá y abrí: limpiá y, si sigue, reemplazá el ventilador."],
        ["Ventilador al máximo todo el tiempo sin carga alta", "Polvo o pasta térmica seca. Ver limpieza y pasta."],
        ["No sale aire", "El ventilador está detenido: apagá el equipo ya."]
      ]
    },
    {
      id: 'hw-pasta', cat: 'hardware', titulo: 'Cambio de pasta térmica',
      freq: 'multianual', frecTxt: 'Cada 4 a 5 años, o antes si la temperatura sube después de limpiar',
      prio: 'media', dur: '45 a 60 min', donde: 'Interior del NUC',
      obj: 'Renovar el contacto entre el procesador y el disipador. Con 8 años de uso la pasta original probablemente está seca.',
      pasos: [
        "Hacé una copia manual, apagá el equipo y desconectalo como en la limpieza de polvo.",
        "Abrí y ubicá el disipador sobre el procesador. Desconectá con cuidado el cable del ventilador tirando del conector plástico, no del cable.",
        "Aflojá los tornillos del disipador de a poco y en cruz.",
        "Levantá el disipador con un movimiento parejo. Si está pegado por la pasta vieja, giralo suavemente.",
        "Limpiá la pasta vieja del procesador y del disipador con alcohol isopropílico (90 % o más) y un paño sin pelusa.",
        "Aplicá una gota del tamaño de un grano de arroz en el centro del procesador (por ejemplo Arctic MX-4 o Noctua NT-H1).",
        "Volvé a colocar el disipador y ajustá los tornillos en cruz, de a poco, hasta el tope.",
        "Reconectá el ventilador, cerrá y encendé.",
        "Vigilá la temperatura las primeras 24 a 48 horas, mientras la pasta se asienta."
      ],
      normal: ["La temperatura baja entre 10 y 15 °C si la pasta estaba seca.", "Queda estable en el tiempo."],
      anormal: [
        ["Temperatura más alta que antes", "El disipador quedó mal asentado o la cantidad de pasta no fue la correcta. Repetí el proceso."],
        ["El equipo se apaga solo o no enciende", "Revisá que el ventilador esté conectado y que el disipador esté firme."],
        ["Se dañó un conector", "Frená y consultá: no fuerces conectores."]
      ],
      prec: ["Con 47 °C en reposo no es urgente. Conviene hacerlo si la temperatura sube o cuando ya tengas el equipo abierto por otro motivo."]
    },
    {
      id: 'hw-cmos', cat: 'hardware', titulo: 'Cambio de la pila del BIOS (CR2032)',
      freq: 'multianual', frecTxt: 'Cada 3 a 5 años',
      prio: 'baja', dur: '15 min', donde: 'Interior del NUC y BIOS',
      obj: 'Evitar que el BIOS pierda su configuración (fecha, orden de arranque, encendido tras cortes de luz) cuando la pila se agota.',
      pasos: [
        "Hacé una copia manual.",
        "Con el equipo encendido, entrá al BIOS (F2 al arrancar) y sacale fotos a las pantallas de configuración: orden de arranque, energía, fecha y hora.",
        "Apagá desde Home Assistant, desconectá el cable y abrí la carcasa.",
        "Ubicá la pila redonda plateada sobre la placa y anotá hacia dónde mira el signo +.",
        "Sacala con cuidado con una uña o una herramienta plástica, nunca metálica.",
        "Colocá la nueva con el + en la misma posición. Confirmá el tipo en el manual de tu modelo (normalmente CR2032).",
        "Cerrá, reconectá y encendé.",
        "Entrá al BIOS y controlá fecha y hora, orden de arranque (que arranque del SSD) y la opción After Power Failure en Power On. Guardá con F10."
      ],
      normal: ["Home Assistant arranca solo desde el SSD.", "Fecha y hora del BIOS correctas.", "Después de un corte de luz el equipo vuelve solo."],
      anormal: [
        ["Aviso de fecha u hora, o el BIOS pierde la configuración al desenchufar", "La pila está agotada: reemplazala."],
        ["No arranca Home Assistant después del cambio", "Al quitar la pila el BIOS vuelve a valores de fábrica: revisá el orden de arranque (UEFI, disco SATA) y que Secure Boot esté desactivado."],
        ["Tras un corte de luz queda apagado", "Configurá After Power Failure en Power On (el nombre exacto varía según el modelo)."]
      ]
    },
    {
      id: 'hw-energia', cat: 'hardware', titulo: 'Energía y arranque tras cortes de luz',
      freq: 'semestral', prio: 'media', dur: '15 min', donde: 'BIOS y, si tenés UPS, la app NUT',
      obj: 'Asegurar que el sistema vuelve solo después de un corte y que el UPS, si lo usás, todavía responde.',
      pasos: [
        "Verificá en el BIOS que After Power Failure esté en Power On (o Last State).",
        "Si usás UPS (tenés instalada la app NUT), revisá el estado y la carga de su batería desde los sensores.",
        "Con una copia reciente, hacé una prueba: desconectá el UPS de la pared y comprobá cuánto dura y que apague el NUC de forma ordenada.",
        "Volvé a conectar el UPS y esperá a que cargue."
      ],
      normal: ["El NUC vuelve solo tras un corte.", "El UPS sostiene el equipo el tiempo esperado y apaga de forma ordenada.", "Batería del UPS con carga completa."],
      anormal: [
        ["Después del corte queda apagado", "Corregí After Power Failure en el BIOS."],
        ["El UPS dura mucho menos que antes", "La batería del UPS está vieja (suelen rendir 3 a 5 años): reemplazala."],
        ["Home Assistant arranca con errores de base de datos tras un corte", "Restaurá la última copia buena y revisá el UPS."]
      ],
      prec: ["Sin UPS, no pruebes cortando la energía con el equipo encendido: podés dañar el sistema de archivos. Apagá siempre desde Home Assistant."]
    },

    /* ------------------------------ SEGURIDAD ------------------------------ */
    {
      id: 'seg-apps', cat: 'seguridad', titulo: 'Apps con acceso privilegiado',
      freq: 'mensual', prio: 'alta', dur: '3 min', donde: 'Ajustes → Apps',
      obj: 'Que las apps con acceso total al sistema (como Advanced SSH & Web Terminal con el Modo de protección apagado) no queden corriendo sin necesidad.',
      pasos: [
        "Abrí Ajustes → Apps y buscá apps que hayas dejado con Modo de protección apagado (pestaña Información).",
        "Si no las necesitás, detenelas y desactivá Iniciar en el arranque.",
        "Volvé a activar Modo de protección cuando puedas.",
        "Comprobá que la contraseña de la app SSH sea única y que el puerto SSH no esté abierto a Internet en el router.",
        "Desinstalá las que ya no uses."
      ],
      normal: ["Apps privilegiadas detenidas cuando no se usan.", "Ningún puerto SSH expuesto a Internet."],
      anormal: [
        ["App con Modo de protección apagado corriendo sin motivo", "Detenela y reactivá el modo."],
        ["Puerto SSH abierto hacia Internet en el router", "Cerralo. Si necesitás acceso remoto, usá una VPN (por ejemplo ZeroTier, que tenés instalado)."]
      ]
    },
    {
      id: 'seg-usuarios', cat: 'seguridad', titulo: 'Usuarios, sesiones y tokens',
      freq: 'trimestral', prio: 'media', dur: '10 min', donde: 'Ajustes → Personas y tu Perfil',
      obj: 'Quitar accesos que ya no usás para reducir riesgos.',
      pasos: [
        "Abrí Ajustes → Personas → Usuarios y eliminá o desactivá los que ya no corresponden.",
        "Abrí tu Perfil (tu nombre, abajo a la izquierda) y entrá a la pestaña Seguridad.",
        "Revisá las sesiones activas y revocá las de dispositivos que no reconocés o que ya no usás.",
        "Revisá los tokens de acceso de larga duración y eliminá los de integraciones o apps que ya no existen.",
        "Confirmá que tu cuenta de administrador tenga una contraseña única y, si es posible, autenticación multifactor."
      ],
      normal: ["Solo hay usuarios y dispositivos que reconocés.", "Cada token tiene un nombre del que sabés para qué es."],
      anormal: [
        ["Sesión de un dispositivo o lugar desconocido", "Revocala, cambiá la contraseña y revisá los registros."],
        ["Token que no podés identificar", "Revocalo y observá qué deja de funcionar."]
      ]
    },

    /* ------------------------------ LIMPIEZA ------------------------------ */
    {
      id: 'lim-entidades', cat: 'limpieza', titulo: 'Entidades no disponibles y dispositivos desconectados',
      freq: 'mensual', prio: 'media', dur: '10 min', donde: 'Herramientas de desarrollo → Plantilla y Ajustes → Dispositivos y servicios',
      obj: 'Encontrar dispositivos caídos o entidades huérfanas que hacen fallar automatizaciones sin avisar.',
      pasos: [
        "Abrí Herramientas de desarrollo → Plantilla y pegá el primer código para contar las entidades no disponibles.",
        "Pegá el segundo código para ver la lista.",
        "Para cada una decidí si es un dispositivo apagado o sin batería, una integración caída o una entidad huérfana.",
        "Si es de batería, revisá su estado en el módulo Inventario de esta app.",
        "Recargá la integración o revisá el dispositivo (batería, Wi-Fi, red Zigbee).",
        "Eliminá las entidades huérfanas y corregí las automatizaciones que las usaban."
      ],
      cmds: [
        { l: 'Cantidad de entidades no disponibles o desconocidas',
          c: `{{ states | selectattr('state','in',['unavailable','unknown']) | map(attribute='entity_id') | list | count }}`,
          n: 'Se pega en la plantilla de Herramientas de desarrollo, no en el terminal.' },
        { l: 'Lista de esas entidades',
          c: `{{ states | selectattr('state','in',['unavailable','unknown']) | map(attribute='entity_id') | sort | list }}` }
      ],
      normal: ["Cero, o solo las de dispositivos que sabés que están apagados."],
      anormal: [
        ["Muchas entidades de la misma integración a la vez", "Integración o red caída: recargá la integración y revisá el router."],
        ["Un sensor a batería no disponible", "Probablemente batería agotada: cambiala y registralo en Inventario."],
        ["Una entidad no disponible que usa una automatización", "La automatización falla en silencio: corregila o quitá la entidad."]
      ]
    },
    {
      id: 'lim-automat', cat: 'limpieza', titulo: 'Automatizaciones y scripts con errores',
      freq: 'mensual', prio: 'media', dur: '10 min', donde: 'Ajustes → Automatizaciones y escenas',
      obj: 'Detectar automatizaciones que dejaron de funcionar sin que lo notes.',
      pasos: [
        "Abrí Ajustes → Automatizaciones y escenas y ordená por última activación.",
        "Abrí las que deberían haberse activado y no lo hicieron, y mirá sus Trazas (menú de tres puntos).",
        "Buscá en los registros líneas de error de automatizaciones (comando de abajo).",
        "Corregí entidades renombradas o borradas y condiciones que nunca se cumplen.",
        "Desactivá o eliminá las que ya no usás."
      ],
      cmds: [{ l: 'Buscar errores de automatizaciones en los registros', c: 'ha core logs -n 500 | grep -i automation' }],
      normal: ["Las automatizaciones se activan cuando corresponde y las trazas no muestran errores."],
      anormal: [
        ["Traza con error de entidad no encontrada", "La entidad se renombró o se borró: actualizá la automatización."],
        ["Se activa demasiadas veces", "Revisá el disparador y agregá una condición."],
        ["Nunca se activa", "El disparador o la condición están mal: probalos por separado en la traza."]
      ]
    }
  ];

  /* Tabla de valores de referencia: [concepto, normal, atención, actuar] */
  const REFS = [
    ['Temperatura del procesador en reposo', '35 a 55 °C (tu base: 47 °C)', '56 a 65 °C sostenido', 'Más de 65 a 70 °C sostenido, o más de 80 °C en cualquier momento'],
    ['Carga del procesador en reposo', '4 a 7 % (tu base)', '8 a 30 % sostenido', 'Más de 30 % sostenido sin motivo'],
    ['Memoria RAM', 'Menos de 70 %', '70 a 85 %', 'Más de 85 %'],
    ['Espacio en disco', 'Menos de 70 %', '70 a 85 %', 'Más de 85 %'],
    ['Antigüedad de la última copia de seguridad', 'Según tu programación (menos de 48 h)', '3 a 7 días', 'Más de 7 días, o sin copia en Drive'],
    ['SMART, estado general', 'PASSED', 'Sin nivel intermedio', 'FAILED'],
    ['Reallocated_Sector_Ct (5)', '0', 'Mayor a 0 pero estable', 'Sube entre chequeos'],
    ['Current_Pending_Sector (197) y Reported_Uncorrect (187)', '0', 'Sin nivel intermedio', 'Cualquier valor mayor a 0'],
    ['Media_Wearout_Indicator (233)', '100 a 50', '49 a 20', 'Menos de 20'],
    ['Tamaño de la base de datos', 'Estable', 'Crece de a poco', 'Crece sin parar semana tras semana'],
    ['Apps críticas', 'Iniciadas', 'Reinicios ocasionales', 'En Error o reiniciando en bucle'],
    ['Entidades no disponibles', 'Cero, o las que sabés', 'Unas pocas sin explicación', 'Muchas de golpe']
  ];

  /* ------------------------------------------------------------------ */
  /*  UTILIDADES                                                         */
  /* ------------------------------------------------------------------ */

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const pad = n => String(n).padStart(2, '0');
  const nowISO = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  // Siempre formato 24 h, sin AM/PM.
  const fmtDT = iso => {
    const d = new Date(iso);
    if (isNaN(d)) return '-';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  const fmtD = d => pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  const fmtSpan = n => (n < 60 ? n + ' d' : n < 730 ? Math.round(n / 30) + ' meses' : Math.round(n / 365) + ' años');

  const byId = {};
  TASKS.forEach(t => { byId[t.id] = t; });

  /* ------------------------------------------------------------------ */
  /*  ESTADO (fechas de realización)                                     */
  /* ------------------------------------------------------------------ */

  let ctx = null; // { root, key, onChange, state, ui }

  // Estado: { v: 2, tasks: { <id>: { done: 'AAAA-MM-DDTHH:MM' | null, history: [...], m: <ms> } } }
  // «m» es la marca de modificación de cada rutina: sirve para fusionar entre dispositivos
  // (gana el registro más reciente) y para que «Quitar último registro» también se propague.
  function seedState() {
    // Chequeo SMART del 19/09/2026 (WD Green 480 GB: PASSED, todo en 0). m: 0 para perder ante cualquier cambio real.
    return { v: 2, tasks: { 'hw-smart': { done: '2026-09-19T16:56', history: ['2026-09-19T16:56'], m: 0 } } };
  }

  function normalizeState(s) {
    const out = { v: 2, tasks: {} };
    const src = s && typeof s === 'object' && s.tasks && typeof s.tasks === 'object' ? s.tasks : {};
    Object.keys(src).forEach(id => {
      const r = src[id];
      if (!byId[id] || !r || typeof r !== 'object') return;
      out.tasks[id] = {
        done: typeof r.done === 'string' ? r.done : null,
        history: Array.isArray(r.history) ? r.history.filter(x => typeof x === 'string').slice(-10) : [],
        m: typeof r.m === 'number' ? r.m : 0
      };
    });
    return out;
  }

  function mergeStates(a, b) {
    const A = normalizeState(a), B = normalizeState(b), out = { v: 2, tasks: {} };
    new Set(Object.keys(A.tasks).concat(Object.keys(B.tasks))).forEach(id => {
      const x = A.tasks[id], y = B.tasks[id];
      out.tasks[id] = !x ? y : !y ? x : (y.m > x.m ? y : x);
    });
    return out;
  }

  function loadState(key, initial) {
    if (initial) return normalizeState(initial);
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeState(JSON.parse(raw));
    } catch (e) { /* almacenamiento no disponible */ }
    return seedState();
  }

  function saveState() {
    try { localStorage.setItem(ctx.key, JSON.stringify(ctx.state)); } catch (e) { /* sin almacenamiento */ }
    if (typeof ctx.onChange === 'function') {
      try { ctx.onChange(JSON.parse(JSON.stringify(ctx.state))); } catch (e) { /* error del callback */ }
    }
  }

  const recOf = id => ctx.state.tasks[id] || { done: null, history: [], m: 0 };

  function statusOf(t) {
    const last = recOf(t.id).done;
    if (!last) return { k: 'none', txt: 'Sin registro', next: null };
    const days = FREQS[t.freq].d;
    const due = new Date(new Date(last).getTime() + days * 86400000);
    const diff = Math.ceil((due.getTime() - Date.now()) / 86400000);
    if (diff < 0) return { k: 'late', txt: 'Vencida hace ' + fmtSpan(-diff), next: due };
    if (diff <= Math.max(2, Math.round(days * 0.15))) return { k: 'soon', txt: 'Vence en ' + fmtSpan(diff), next: due };
    return { k: 'ok', txt: 'Al día', next: due };
  }

  /* ------------------------------------------------------------------ */
  /*  ESTILOS                                                            */
  /* ------------------------------------------------------------------ */

  const CSS = `
.mnt{--mnt-card:var(--surface,#161b22);--mnt-card2:var(--surface2,#21262d);--mnt-line:var(--border,#30363d);--mnt-text:var(--text,#e6edf3);--mnt-mute:var(--text2,#a8b3bd);--mnt-accent:var(--primary-light,#4a9fd8);--mnt-ok:var(--green,#3fb950);--mnt-warn:var(--amber,#d29922);--mnt-bad:var(--red,#f85149);--mnt-r:var(--r,6px);--mnt-bg:var(--bg,#0d1117);
color:var(--mnt-text);font:inherit;font-size:13px;line-height:1.55;max-width:960px;margin:0;padding:0 0 32px}
.mnt,.mnt *,.mnt *::before,.mnt *::after{box-sizing:border-box}
.mnt h3{font-size:14px;margin:18px 0 8px;font-weight:700}
.mnt h4{font-size:13px;margin:12px 0 6px;font-weight:700}
.mnt-sub{margin:0;color:var(--mnt-mute)}
.mnt code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.88em;background:var(--mnt-bg);border:1px solid var(--mnt-line);border-radius:4px;padding:1px 5px}
.mnt-stats{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:12px 0 14px}
.mnt-stat{background:var(--mnt-card);border:1px solid var(--mnt-line);border-radius:var(--mnt-r);padding:10px 12px}
.mnt-stat b{display:block;font-size:22px;line-height:1.15}
.mnt-stat span{color:var(--mnt-mute);font-size:11px}
.mnt-stat.is-late b{color:var(--mnt-bad)}
.mnt-stat.is-soon b{color:var(--mnt-warn)}
.mnt-stat.is-ok b{color:var(--mnt-ok)}
.mnt-tabs{display:flex;gap:4px;border-bottom:1px solid var(--mnt-line);margin-bottom:14px;overflow-x:auto}
.mnt-tab{background:none;border:0;border-bottom:2px solid transparent;color:var(--mnt-mute);padding:9px 14px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.mnt-tab[aria-selected="true"]{color:var(--mnt-text);border-bottom-color:var(--mnt-accent)}
.mnt button:focus-visible,.mnt summary:focus-visible,.mnt input:focus-visible,.mnt select:focus-visible{outline:2px solid var(--mnt-accent);outline-offset:2px}
.mnt-intro{background:var(--mnt-card);border:1px solid var(--mnt-line);border-radius:var(--mnt-r);margin:0 0 12px}
.mnt-intro summary{cursor:pointer;padding:11px 14px;font-weight:600}
.mnt-intro ul{margin:0;padding:0 14px 12px 32px}
.mnt-intro li{margin:0 0 6px}
.mnt-filters{display:grid;gap:8px;grid-template-columns:1fr;margin-bottom:6px}
.mnt-filters input,.mnt-filters select{width:100%;background:var(--mnt-card);color:inherit;border:1px solid var(--mnt-line);border-radius:var(--mnt-r);padding:8px 12px;font:inherit;font-size:12px;min-height:38px}
.mnt-task{background:var(--mnt-card);border:1px solid var(--mnt-line);border-radius:var(--mnt-r);margin:0 0 8px}
.mnt-task>summary{list-style:none;cursor:pointer;padding:12px 14px 12px 38px;position:relative}
.mnt-task>summary::-webkit-details-marker{display:none}
.mnt-task>summary::before{content:"";position:absolute;left:15px;top:19px;width:8px;height:8px;border-right:2px solid var(--mnt-mute);border-bottom:2px solid var(--mnt-mute);transform:rotate(-45deg);transition:transform .15s}
.mnt-task[open]>summary::before{transform:rotate(45deg);top:16px}
.mnt-task-title{display:block;font-weight:600;margin-bottom:6px}
.mnt-chips{display:flex;flex-wrap:wrap;gap:6px}
.mnt-chip{display:inline-block;font-size:11px;line-height:1.5;padding:1px 9px;border-radius:999px;border:1px solid var(--mnt-line);color:var(--mnt-mute);background:var(--mnt-card2);white-space:nowrap}
.mnt-prio-critica{color:var(--mnt-bad);border-color:var(--mnt-bad)}
.mnt-prio-alta{color:var(--mnt-warn);border-color:var(--mnt-warn)}
.mnt-prio-media{color:var(--mnt-accent);border-color:var(--mnt-accent)}
.mnt-st-late{color:var(--mnt-bad);border-color:var(--mnt-bad)}
.mnt-st-soon{color:var(--mnt-warn);border-color:var(--mnt-warn)}
.mnt-st-ok{color:var(--mnt-ok);border-color:var(--mnt-ok)}
.mnt-st-none{border-style:dashed}
.mnt-body{padding:4px 14px 14px;border-top:1px solid var(--mnt-line)}
.mnt-goal{margin:10px 0}
.mnt-meta{display:grid;gap:6px;margin:0 0 4px}
.mnt-meta div{display:flex;gap:8px}
.mnt-meta dt{color:var(--mnt-mute);min-width:88px}
.mnt-meta dd{margin:0}
.mnt-steps{padding-left:22px;margin:4px 0 8px}
.mnt-steps li{margin:0 0 6px}
.mnt-cmd{margin:8px 0 12px}
.mnt-cmd-label{font-weight:600;margin:0 0 4px}
.mnt-cmd-box{display:flex;gap:8px;align-items:flex-start;background:var(--mnt-bg);border:1px solid var(--mnt-line);border-radius:var(--mnt-r);padding:8px 8px 8px 12px}
.mnt-cmd-box pre{flex:1;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--mnt-text)}
.mnt-cmd-note{color:var(--mnt-mute);font-size:12px;margin:4px 0 0}
.mnt-btn{font:inherit;font-size:12px;background:var(--mnt-card2);color:var(--mnt-text);border:1px solid var(--mnt-line);border-radius:var(--mnt-r);padding:6px 12px;min-height:36px;cursor:pointer}
.mnt-btn:hover{border-color:var(--text3,#6b7480)}
.mnt-btn-main{background:var(--primary,#1a6faa);border-color:var(--primary,#1a6faa);color:#fff}
.mnt-btn-main:hover{background:var(--primary-dark,#0d4a72);border-color:var(--primary-dark,#0d4a72)}
.mnt-res{display:grid;gap:10px;margin-top:6px}
.mnt-res-col{border-left:3px solid var(--mnt-line);padding:2px 0 2px 12px}
.mnt-res-ok{border-left-color:var(--mnt-ok)}
.mnt-res-bad{border-left-color:var(--mnt-bad)}
.mnt-res-col h4{margin-top:4px}
.mnt-res-col ul{margin:0;padding-left:18px}
.mnt-res-col li{margin:0 0 8px}
.mnt-res-col li strong{display:block}
.mnt-res-col li span{color:var(--mnt-mute)}
.mnt-note{margin-top:12px;border:1px solid var(--mnt-line);border-radius:var(--mnt-r);padding:2px 12px 10px;background:var(--mnt-card2)}
.mnt-note-warn{border-color:var(--mnt-warn)}
.mnt-note ul{margin:0;padding-left:18px}
.mnt-note li{margin:0 0 6px}
.mnt-note p{margin:0}
.mnt-log{margin-top:14px;padding-top:12px;border-top:1px solid var(--mnt-line);display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}
.mnt-log-txt{flex:1 1 220px;color:var(--mnt-mute);font-size:12px}
.mnt-empty{border:1px dashed var(--mnt-line);border-radius:var(--mnt-r);padding:18px;text-align:center;color:var(--mnt-mute)}
.mnt-sumlist{list-style:none;margin:0;padding:0}
.mnt-sumlist li{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--mnt-line)}
.mnt-link{background:none;border:0;padding:0;color:var(--mnt-accent);font:inherit;text-align:left;cursor:pointer;flex:1 1 220px}
.mnt-link:hover{text-decoration:underline}
.mnt-tablewrap{overflow-x:auto;border:1px solid var(--mnt-line);border-radius:var(--mnt-r)}
.mnt-table{width:100%;border-collapse:collapse;min-width:640px}
.mnt-table th,.mnt-table td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid var(--mnt-line)}
.mnt-table tr:last-child td{border-bottom:0}
.mnt-table th{background:var(--mnt-card2);font-weight:600}
.mnt-table td:nth-child(2){color:var(--mnt-ok)}
.mnt-table td:nth-child(3){color:var(--mnt-warn)}
.mnt-table td:nth-child(4){color:var(--mnt-bad)}
.mnt-table td:first-child{font-weight:600}
@media(min-width:640px){.mnt-stats{grid-template-columns:repeat(4,1fr)}.mnt-filters{grid-template-columns:1.6fr 1fr 1fr}}
@media(min-width:760px){.mnt-res{grid-template-columns:1fr 1fr}}
@media(prefers-reduced-motion:reduce){.mnt-task>summary::before{transition:none}}
`;

  function injectStyles() {
    if (document.getElementById('mnt-styles')) return;
    const st = document.createElement('style');
    st.id = 'mnt-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */

  function logInner(t) {
    const st = statusOf(t);
    const hist = recOf(t.id).history;
    const last = recOf(t.id).done;
    let txt;
    if (!last) {
      txt = 'Todavía no registraste esta rutina.';
    } else {
      txt = 'Última vez: ' + esc(fmtDT(last)) + '.';
      if (st.next) txt += ' Próxima: ' + esc(fmtD(st.next)) + '.';
      if (hist.length > 1) txt += ' Anteriores: ' + hist.slice(0, -1).slice(-3).reverse().map(x => esc(fmtD(new Date(x)))).join(', ') + '.';
    }
    return '<span class="mnt-log-txt">' + txt + '</span>' +
      '<button type="button" class="mnt-btn mnt-btn-main" data-act="done" data-id="' + t.id + '">Marcar como hecha</button>' +
      (last ? '<button type="button" class="mnt-btn" data-act="undo" data-id="' + t.id + '">Quitar último registro</button>' : '');
  }

  function taskHTML(t) {
    const st = statusOf(t);
    const cmds = (t.cmds || []).map(c =>
      '<div class="mnt-cmd">' +
        '<p class="mnt-cmd-label">' + esc(c.l) + '</p>' +
        '<div class="mnt-cmd-box"><pre>' + esc(c.c) + '</pre>' +
        '<button type="button" class="mnt-btn" data-act="copy" data-copy="' + esc(c.c) + '">Copiar</button></div>' +
        (c.n ? '<p class="mnt-cmd-note">' + fmt(c.n) + '</p>' : '') +
      '</div>').join('');
    const anormal = t.anormal.map(a => '<li><strong>' + fmt(a[0]) + '</strong><span>' + fmt(a[1]) + '</span></li>').join('');
    return '<details class="mnt-task" id="mnt-' + t.id + '" data-id="' + t.id + '">' +
      '<summary><span class="mnt-task-title">' + esc(t.titulo) + '</span>' +
        '<span class="mnt-chips">' +
          '<span class="mnt-chip mnt-prio-' + t.prio + '">' + PRIOS[t.prio] + '</span>' +
          '<span class="mnt-chip">' + esc(FREQS[t.freq].n) + '</span>' +
          '<span class="mnt-chip">' + esc(t.dur) + '</span>' +
          '<span class="mnt-chip mnt-st mnt-st-' + st.k + '" data-status-for="' + t.id + '">' + esc(st.txt) + '</span>' +
        '</span></summary>' +
      '<div class="mnt-body">' +
        '<p class="mnt-goal">' + fmt(t.obj) + '</p>' +
        '<dl class="mnt-meta">' +
          '<div><dt>Frecuencia</dt><dd>' + esc(t.frecTxt || FREQS[t.freq].sub) + '</dd></div>' +
          '<div><dt>Dónde</dt><dd>' + esc(t.donde) + '</dd></div>' +
          '<div><dt>Duración</dt><dd>' + esc(t.dur) + '</dd></div>' +
        '</dl>' +
        (t.pasos && t.pasos.length ? '<h4>Pasos</h4><ol class="mnt-steps">' + t.pasos.map(p => '<li>' + fmt(p) + '</li>').join('') + '</ol>' : '') +
        (cmds ? '<h4>Comandos</h4>' + cmds : '') +
        '<div class="mnt-res">' +
          '<div class="mnt-res-col mnt-res-ok"><h4>Resultado normal</h4><ul>' + t.normal.map(n => '<li>' + fmt(n) + '</li>').join('') + '</ul></div>' +
          '<div class="mnt-res-col mnt-res-bad"><h4>Resultado anormal</h4><ul>' + anormal + '</ul></div>' +
        '</div>' +
        (t.prec ? '<div class="mnt-note mnt-note-warn"><h4>Precauciones</h4><ul>' + t.prec.map(p => '<li>' + fmt(p) + '</li>').join('') + '</ul></div>' : '') +
        (t.ref ? '<div class="mnt-note"><h4>Referencia de tu equipo</h4><p>' + fmt(t.ref) + '</p></div>' : '') +
        '<div class="mnt-log" data-log-for="' + t.id + '">' + logInner(t) + '</div>' +
      '</div></details>';
  }

  function searchBlob(t) {
    return [t.titulo, t.obj, t.donde, (t.pasos || []).join(' '), (t.cmds || []).map(c => c.l + ' ' + c.c).join(' '),
      t.normal.join(' '), t.anormal.map(a => a.join(' ')).join(' ')].join(' ').toLowerCase();
  }

  function filteredTasks() {
    const q = ctx.ui.q.trim().toLowerCase();
    return TASKS.filter(t =>
      (!ctx.ui.cat || t.cat === ctx.ui.cat) &&
      (!ctx.ui.freq || t.freq === ctx.ui.freq) &&
      (!q || searchBlob(t).indexOf(q) !== -1));
  }

  function listHTML() {
    const list = filteredTasks();
    if (!list.length) {
      return '<div class="mnt-empty">No hay rutinas con ese filtro. Cambiá la búsqueda o quitá los filtros.<br><br>' +
        '<button type="button" class="mnt-btn" data-act="clear">Quitar filtros</button></div>';
    }
    return CATS.map(c => {
      const items = list.filter(t => t.cat === c.id);
      if (!items.length) return '';
      return '<section><h3>' + esc(c.nombre) + ' (' + items.length + ')</h3>' + items.map(taskHTML).join('') + '</section>';
    }).join('');
  }

  function rutinasHTML() {
    const catOpts = '<option value="">Todas las categorías</option>' +
      CATS.map(c => '<option value="' + c.id + '"' + (ctx.ui.cat === c.id ? ' selected' : '') + '>' + esc(c.nombre) + '</option>').join('');
    const usedFreqs = Object.keys(FREQS).filter(k => TASKS.some(t => t.freq === k));
    const freqOpts = '<option value="">Todas las frecuencias</option>' +
      usedFreqs.map(k => '<option value="' + k + '"' + (ctx.ui.freq === k ? ' selected' : '') + '>' + esc(FREQS[k].n) + '</option>').join('');
    return '<details class="mnt-intro"><summary>Antes de empezar</summary><ul>' + INTRO.map(i => '<li>' + fmt(i) + '</li>').join('') + '</ul></details>' +
      '<div class="mnt-filters">' +
        '<input type="search" data-role="q" placeholder="Buscar rutina, comando o síntoma" aria-label="Buscar" value="' + esc(ctx.ui.q) + '">' +
        '<select data-role="cat" aria-label="Categoría">' + catOpts + '</select>' +
        '<select data-role="freq" aria-label="Frecuencia">' + freqOpts + '</select>' +
      '</div>' +
      '<div data-role="list">' + listHTML() + '</div>';
  }

  function resumenHTML() {
    const blocks = Object.keys(FREQS).map(k => {
      const items = TASKS.filter(t => t.freq === k);
      if (!items.length) return '';
      return '<section><h3>' + esc(FREQS[k].n) + '</h3><p class="mnt-sub">' + esc(FREQS[k].sub) + '</p><ul class="mnt-sumlist">' +
        items.map(t => {
          const st = statusOf(t);
          return '<li><button type="button" class="mnt-link" data-act="goto" data-id="' + t.id + '">' + esc(t.titulo) + '</button>' +
            '<span class="mnt-chip">' + esc(t.dur) + '</span>' +
            '<span class="mnt-chip mnt-st mnt-st-' + st.k + '" data-status-for="' + t.id + '">' + esc(st.txt) + '</span></li>';
        }).join('') + '</ul></section>';
    }).join('');
    return '<p class="mnt-sub">Tocá una rutina para abrir su detalle.</p>' + blocks;
  }

  function valoresHTML() {
    return '<p class="mnt-sub">Umbrales para decidir si un valor está bien o hay que actuar.</p>' +
      '<h3>Valores de referencia</h3><div class="mnt-tablewrap"><table class="mnt-table"><thead><tr>' +
      '<th>Qué medir</th><th>Normal</th><th>Atención</th><th>Actuar</th></tr></thead><tbody>' +
      REFS.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function statsHTML() {
    return '<div class="mnt-stat is-late"><b data-stat="late">0</b><span>Vencidas</span></div>' +
      '<div class="mnt-stat is-soon"><b data-stat="soon">0</b><span>Por vencer</span></div>' +
      '<div class="mnt-stat"><b data-stat="none">0</b><span>Sin registro</span></div>' +
      '<div class="mnt-stat is-ok"><b data-stat="ok">0</b><span>Al día</span></div>';
  }

  function updateStats() {
    const c = { late: 0, soon: 0, none: 0, ok: 0 };
    TASKS.forEach(t => { c[statusOf(t).k]++; });
    Object.keys(c).forEach(k => {
      const el = ctx.root.querySelector('[data-stat="' + k + '"]');
      if (el) el.textContent = c[k];
    });
  }

  function refreshTask(id) {
    const t = byId[id];
    const st = statusOf(t);
    ctx.root.querySelectorAll('[data-status-for="' + id + '"]').forEach(el => {
      el.className = 'mnt-chip mnt-st mnt-st-' + st.k;
      el.textContent = st.txt;
    });
    const log = ctx.root.querySelector('[data-log-for="' + id + '"]');
    if (log) log.innerHTML = logInner(t);
    updateStats();
  }

  function renderTab() {
    const body = ctx.root.querySelector('[data-role="tabbody"]');
    body.innerHTML = ctx.ui.tab === 'resumen' ? resumenHTML() : ctx.ui.tab === 'valores' ? valoresHTML() : rutinasHTML();
    ctx.root.querySelectorAll('.mnt-tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === ctx.ui.tab)));
  }

  function renderAll() {
    ctx.root.innerHTML =
      '<div class="mnt">' +
        '<p class="mnt-sub">Manual de rutinas del servidor Home Assistant (NUC)</p>' +
        '<div class="mnt-stats">' + statsHTML() + '</div>' +
        '<div class="mnt-tabs" role="tablist">' +
          '<button type="button" class="mnt-tab" role="tab" data-act="tab" data-tab="rutinas">Rutinas</button>' +
          '<button type="button" class="mnt-tab" role="tab" data-act="tab" data-tab="resumen">Resumen por frecuencia</button>' +
          '<button type="button" class="mnt-tab" role="tab" data-act="tab" data-tab="valores">Valores de referencia</button>' +
        '</div>' +
        '<div data-role="tabbody"></div>' +
      '</div>';
    renderTab();
    updateStats();
  }

  /* ------------------------------------------------------------------ */
  /*  EVENTOS                                                            */
  /* ------------------------------------------------------------------ */

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
    const act = el.dataset.act;
    if (act === 'tab') {
      ctx.ui.tab = el.dataset.tab; renderTab();
    } else if (act === 'copy') {
      copyText(el.dataset.copy).then(ok => {
        const prev = el.textContent;
        el.textContent = ok ? 'Copiado' : 'No se pudo copiar';
        setTimeout(() => { el.textContent = prev; }, 1600);
      });
    } else if (act === 'done') {
      const id = el.dataset.id;
      const stamp = nowISO();
      ctx.state.tasks[id] = { done: stamp, history: recOf(id).history.concat(stamp).slice(-10), m: Date.now() };
      saveState(); refreshTask(id);
    } else if (act === 'undo') {
      const id = el.dataset.id;
      const h = recOf(id).history.slice(0, -1);
      ctx.state.tasks[id] = { done: h.length ? h[h.length - 1] : null, history: h, m: Date.now() };
      saveState(); refreshTask(id);
    } else if (act === 'clear') {
      ctx.ui.q = ''; ctx.ui.cat = ''; ctx.ui.freq = ''; renderTab();
    } else if (act === 'goto') {
      ctx.ui.tab = 'rutinas'; ctx.ui.q = ''; ctx.ui.cat = ''; ctx.ui.freq = ''; renderTab();
      const d = ctx.root.querySelector('#mnt-' + el.dataset.id);
      if (d) { d.open = true; if (d.scrollIntoView) d.scrollIntoView({ block: 'start' }); }
    }
  }

  function onInput(ev) {
    const role = ev.target.dataset && ev.target.dataset.role;
    if (!role || role === 'list' || role === 'tabbody') return;
    ctx.ui[role] = ev.target.value;
    const list = ctx.root.querySelector('[data-role="list"]');
    if (list) list.innerHTML = listHTML();
  }

  /* ------------------------------------------------------------------ */
  /*  API PÚBLICA                                                        */
  /* ------------------------------------------------------------------ */

  function render(container, opts) {
    opts = opts || {};
    if (!container) throw new Error('Mantenimiento.render: falta el contenedor');
    if (ctx && ctx.root) {
      ctx.root.removeEventListener('click', onClick);
      ctx.root.removeEventListener('input', onInput);
      ctx.root.removeEventListener('change', onInput);
    }
    injectStyles();
    const key = opts.storageKey || DEFAULT_KEY;
    ctx = { root: container, key: key, onChange: opts.onChange, state: loadState(key, opts.initialState), ui: { tab: 'rutinas', q: '', cat: '', freq: '' } };
    container.addEventListener('click', onClick);
    container.addEventListener('input', onInput);
    container.addEventListener('change', onInput);
    renderAll();
    return api;
  }

  function getState() { return ctx ? JSON.parse(JSON.stringify(ctx.state)) : null; }

  // setState(estado, { silent: true }) actualiza sin llamar a onChange (útil al recibir datos de Drive).
  function setState(s, opts) {
    if (!ctx) return;
    ctx.state = normalizeState(s);
    if (opts && opts.silent) {
      try { localStorage.setItem(ctx.key, JSON.stringify(ctx.state)); } catch (e) { /* sin almacenamiento */ }
    } else {
      saveState();
    }
    renderAll();
  }

  const api = { version: VERSION, render: render, getState: getState, setState: setState, merge: mergeStates, tasks: TASKS, categorias: CATS };
  global.Mantenimiento = api;
})(typeof window !== 'undefined' ? window : globalThis);
