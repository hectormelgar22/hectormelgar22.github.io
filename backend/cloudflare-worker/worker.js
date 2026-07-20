/**
 * Sentia · Asistente de soporte — Cloudflare Worker (proxy de Gemini)
 *
 * La API key vive SOLO como secreto de Cloudflare (GEMINI_API_KEY).
 * El navegador llama a este Worker; el Worker llama a Gemini.
 *
 * Bindings necesarios (ver README-chat.md):
 *   - Secreto:      GEMINI_API_KEY
 *   - KV namespace: RATE_LIMIT
 */

/* ========== CONFIGURACIÓN (edita aquí) ========== */

// Orígenes permitidos. Añade/cambia tu dominio real cuando lo tengas.
var ALLOWED_ORIGINS = [
  "https://hectormelgar22.github.io",   // tu web en GitHub Pages
  "http://localhost:8123",              // desarrollo local
  "http://127.0.0.1:8123"
];

// Se prueban en orden hasta encontrar uno disponible para tu API key
var GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];
var workingModel = null; // se recuerda el que funcione
var RATE_PER_MINUTE = 8;    // mensajes por IP y minuto
var RATE_PER_DAY = 60;      // mensajes por IP y día
var MAX_MESSAGE_CHARS = 1000;
var MAX_HISTORY_TURNS = 8;  // últimos mensajes de contexto que se reenvían

/* ========== GUARDARRAÍLES DE CONTENIDO ========== */

var SYSTEM_PROMPT = [
  "Eres el asistente informativo de Sentia, un centro de psicología y terapias en Madrid (presencial y online).",
  "Tu función es orientar con calidez y honestidad a personas que se interesan por la terapia. Muchas atraviesan un mal momento: trátalas con cuidado, sin dramatismo y sin condescendencia.",
  "",
  "NORMAS NO NEGOCIABLES:",
  "1. NUNCA diagnostiques ni sugieras que alguien 'tiene' un trastorno. Puedes hablar de síntomas en general y animar a una evaluación profesional.",
  "2. NUNCA des plazos ni pronósticos de recuperación como hechos ('en 3 meses estarás bien'). Si preguntan cuánto tardarán en recuperarse, explica que depende de cada persona, de su situación y del tipo de proceso, y que en la primera consulta gratuita el equipo puede orientarles mejor.",
  "3. Sé honesto y transmite esperanza basada en evidencia general: la depresión, la ansiedad y la mayoría de los problemas psicológicos tienen tratamientos eficaces y mucha gente mejora. No prometas resultados concretos a nadie.",
  "4. NUNCA recomiendes medicación, dosis, retirar medicación ni pautas de tratamiento específicas. Eso corresponde a profesionales sanitarios.",
  "5. Si detectas ideación suicida, autolesiones o una crisis, no hagas terapia ni interrogues sobre el riesgo: indica con calidez que llamen YA al 024 (línea de atención a la conducta suicida, 24 h, gratuita y confidencial), al 112 si hay peligro inmediato, o al Teléfono de la Esperanza 717 003 717.",
  "6. No inventes datos del centro (precios, nombres de terapeutas, horarios exactos). Si no lo sabes, dilo y remite al formulario de contacto o al teléfono.",
  "7. PROTECCIÓN DE DATOS: nunca pidas ni animes a que la persona comparta datos personales por el chat (nombre completo, apellidos, DNI, dirección postal, email, teléfono, fecha de nacimiento, datos médicos concretos, datos bancarios, contraseñas, códigos, historia clínica detallada, nombres de otras personas). Si el usuario los escribe por su cuenta, NO los repitas nunca en tu respuesta, no los confirmes ni los cites. En su lugar, di con amabilidad que por privacidad no gestionamos esos datos por el chat y que los faciliten en el formulario de contacto o por teléfono, que son canales seguros.",
  "8. Termina siempre las frases. Si sientes que te vas a extender, sé más breve pero completa cada frase — nunca dejes una idea a medias.",
  "",
  "ESTILO: cálido, cercano, en español de España, tuteando. Respuestas breves: 2-5 frases, salvo que pidan expresamente más detalle. Cuando encaje de forma natural, recuerda que la primera consulta orientativa de 15 minutos es gratuita.",
  "Datos reales del centro que sí puedes usar: contacto en la sección de la web, horario Lun-Vie 9:00-20:00, terapia presencial en Madrid y online."
].join("\n");

// Detección de crisis en el backend: responde SIEMPRE con recursos, sin llamar al modelo.
var CRISIS_PATTERNS = [
  /suicid/i,
  /quitarme la vida/i,
  /matarme/i,
  /no quiero (seguir )?vivi/i,
  /no merece la pena vivir/i,
  /acabar con todo/i,
  /desaparecer para siempre/i,
  /hacerme da(ñ|n)o/i,
  /autolesi/i,
  /cortarme/i,
  /sobredosis/i,
  /me quiero morir/i,
  /quiero morirme/i
];

var CRISIS_REPLY = [
  "Siento mucho que estés pasando por un momento tan duro. Lo que sientes importa, y no tienes que sostenerlo en soledad.",
  "",
  "Por favor, busca ayuda ahora mismo:",
  "• 📞 024 — Línea de atención a la conducta suicida (24 h, gratuita y confidencial)",
  "• 🚨 112 — Emergencias, si estás en peligro inmediato",
  "• ☎️ 717 003 717 — Teléfono de la Esperanza",
  "",
  "Hablar con alguien ahora puede marcar la diferencia. Y cuando quieras, el equipo de Sentia también está aquí para acompañarte."
].join("\n");

/* ========== WORKER ========== */

export default {
  async fetch(request, env) {
    var origin = request.headers.get("Origin") || "";
    var cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    // Diagnóstico rápido: GET /health dice si la configuración está completa
    // (solo booleanos, nunca revela la key)
    if (request.method === "GET" && new URL(request.url).pathname === "/health") {
      return json({
        ok: Boolean(env.GEMINI_API_KEY) && Boolean(env.RATE_LIMIT),
        tiene_api_key: Boolean(env.GEMINI_API_KEY),
        tiene_kv_rate_limit: Boolean(env.RATE_LIMIT)
      }, 200, cors);
    }
    // Diagnóstico: GET /models lista los modelos que acepta tu API key
    if (request.method === "GET" && new URL(request.url).pathname === "/models") {
      try {
        var mres = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=50", {
          headers: { "x-goog-api-key": env.GEMINI_API_KEY }
        });
        var mdata = await mres.json();
        if (!mres.ok) {
          return json({ status: mres.status, error: (mdata.error && mdata.error.message) || "error" }, 200, cors);
        }
        var names = (mdata.models || [])
          .filter(function (m) { return (m.supportedGenerationMethods || []).indexOf("generateContent") !== -1; })
          .map(function (m) { return m.name.replace("models/", ""); });
        return json({ modelos_disponibles: names }, 200, cors);
      } catch (e) {
        return json({ error: e.message }, 200, cors);
      }
    }
    if (request.method !== "POST") {
      return json({ error: "Método no permitido" }, 405, cors);
    }
    if (ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return json({ error: "Origen no permitido" }, 403, cors);
    }

    // ---- Rate limiting por IP con Workers KV ----
    var ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.RATE_LIMIT) {
      var limited = await checkRateLimit(env.RATE_LIMIT, ip);
      if (limited) {
        return json({ error: limited }, 429, cors);
      }
    }

    // ---- Entrada ----
    var body;
    try { body = await request.json(); } catch (e) {
      return json({ error: "JSON inválido" }, 400, cors);
    }
    var message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return json({ error: "Mensaje vacío" }, 400, cors);
    if (message.length > MAX_MESSAGE_CHARS) {
      message = message.slice(0, MAX_MESSAGE_CHARS);
    }

    // ---- Detección de crisis (sin llamar al modelo) ----
    if (isCrisis(message)) {
      return json({ reply: CRISIS_REPLY, crisis: true }, 200, cors);
    }

    // ---- Historial (limitado) ----
    var history = Array.isArray(body.history) ? body.history.slice(-MAX_HISTORY_TURNS) : [];
    var contents = [];
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (!h || typeof h.text !== "string") continue;
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.text.slice(0, MAX_MESSAGE_CHARS) }]
      });
    }
    contents.push({ role: "user", parts: [{ text: message }] });

    // ---- Sanitizar entrada antes de mandarla al modelo ----
    // Redacta datos personales que el usuario pueda haber pegado, para que:
    //   a) no queden en el historial que se reenvía a Google,
    //   b) el modelo no los pueda repetir de vuelta ni ampliar sobre ellos.
    contents.forEach(function (c) {
      if (c.parts && c.parts[0] && typeof c.parts[0].text === "string") {
        c.parts[0].text = redactPersonalData(c.parts[0].text);
      }
    });

    // ---- Llamada a Gemini ----
    var geminiBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: {
        temperature: 0.6,
        // 900 tokens ≈ 600-700 palabras: suficiente para respuestas cerradas
        // sin cortarse a mitad de frase.
        maxOutputTokens: 900
      }
    };

    // Lista de candidatos: primero el que ya sabemos que funciona, si lo hay.
    var candidates = workingModel ? [workingModel] : GEMINI_MODELS.slice();
    var lastStatus = 0;
    var lastDetail = "";

    for (var c = 0; c < candidates.length; c++) {
      var model = candidates[c];
      try {
        var res = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify(geminiBody)
          }
        );

        if (res.ok) {
          workingModel = model; // lo recordamos para las siguientes peticiones
          var data = await res.json();
          var reply = extractText(data);
          if (!reply) {
            return json({ reply: "No he podido responder a eso. ¿Quieres contarme de otra forma en qué puedo ayudarte, o prefieres escribir directamente al equipo por el formulario?" }, 200, cors);
          }
          // Doble red de seguridad: filtro también la salida por si el modelo
          // se ha inventado o ha ecoado datos personales.
          reply = redactPersonalData(reply);
          return json({ reply: reply }, 200, cors);
        }

        lastStatus = res.status;
        lastDetail = (await res.text()).slice(0, 200);
        console.log("Modelo " + model + " -> " + res.status + ": " + lastDetail);

        // 404 = ese modelo no existe para esta key: probamos el siguiente.
        if (res.status === 404) {
          if (workingModel === model) workingModel = null; // el cacheado dejó de valer
          continue;
        }
        if (res.status === 429) {
          return json({ error: "El asistente está muy solicitado ahora mismo. Prueba en un minuto, o escríbenos por el formulario." }, 503, cors);
        }
        // Otros errores (403 key inválida, 400 petición mal formada…) no se arreglan cambiando de modelo.
        break;
      } catch (e) {
        lastDetail = e.message;
        console.log("Fetch a Gemini falló (" + model + "): " + e.message);
      }
    }

    return json({
      error: "El asistente no está disponible en este momento. Puedes escribirnos por el formulario de contacto.",
      diagnostico: { codigo: lastStatus, detalle: lastDetail }
    }, 502, cors);
  }
};

/* ========== Helpers ========== */

function corsHeaders(origin) {
  var allowed = ALLOWED_ORIGINS.indexOf(origin) !== -1 ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(obj, status, cors) {
  var headers = Object.assign({ "Content-Type": "application/json; charset=utf-8" }, cors);
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}

function isCrisis(text) {
  for (var i = 0; i < CRISIS_PATTERNS.length; i++) {
    if (CRISIS_PATTERNS[i].test(text)) return true;
  }
  return false;
}

async function checkRateLimit(kv, ip) {
  var now = new Date();
  var minuteKey = "rl:m:" + ip + ":" + Math.floor(now.getTime() / 60000);
  var dayKey = "rl:d:" + ip + ":" + now.toISOString().slice(0, 10);

  var minuteCount = parseInt((await kv.get(minuteKey)) || "0", 10);
  if (minuteCount >= RATE_PER_MINUTE) {
    return "Vas muy rápido 🙂 Espera un minuto y seguimos hablando.";
  }
  var dayCount = parseInt((await kv.get(dayKey)) || "0", 10);
  if (dayCount >= RATE_PER_DAY) {
    return "Has llegado al límite diario del asistente. Si quieres seguir, escríbenos por el formulario de contacto y te respondemos en persona.";
  }
  await kv.put(minuteKey, String(minuteCount + 1), { expirationTtl: 120 });
  await kv.put(dayKey, String(dayCount + 1), { expirationTtl: 90000 });
  return null;
}

/**
 * Redacta datos personales (defensa en profundidad, complementa el prompt).
 * Sustituye por [dato eliminado por privacidad] cualquier:
 *   - email
 *   - teléfono español (fijos y móviles, con o sin +34, con espacios/guiones)
 *   - DNI/NIE español
 *   - IBAN
 *   - tarjeta de crédito (Luhn no, simple 13-19 dígitos consecutivos)
 * Whitelisted: los teléfonos oficiales de emergencia que el asistente SÍ debe dar.
 */
var PHONE_WHITELIST = ["024", "112", "717003717", "717 003 717"];

function redactPersonalData(text) {
  if (!text) return text;
  var out = text;

  // Email
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[dato eliminado por privacidad]");

  // IBAN español (o cualquier IBAN con 2 letras + 22-32 alfanum)
  out = out.replace(/\b[A-Z]{2}\d{2}[ \-]?(?:[A-Z0-9]{4}[ \-]?){3,7}[A-Z0-9]{1,4}\b/g,
    "[dato eliminado por privacidad]");

  // DNI/NIE: 8 dígitos + letra, o [XYZ] + 7 dígitos + letra
  out = out.replace(/\b[XYZ]?\d{7,8}[A-HJ-NP-TV-Z]\b/gi,
    "[dato eliminado por privacidad]");

  // Tarjeta bancaria: 13-19 dígitos con posibles espacios/guiones
  out = out.replace(/\b(?:\d[ -]?){13,19}\b/g,
    "[dato eliminado por privacidad]");

  // Teléfono ES: opcional +34/0034, 9 dígitos empezando 6/7/8/9 con separadores
  out = out.replace(/(?:(?:\+|00)34[\s.\-]?)?[6789](?:[\s.\-]?\d){8}/g, function (m) {
    var digits = m.replace(/\D/g, "");
    // El número puede venir con prefijo 34; quítalo para comparar
    var national = digits.replace(/^(?:00)?34/, "");
    for (var i = 0; i < PHONE_WHITELIST.length; i++) {
      var w = PHONE_WHITELIST[i].replace(/\D/g, "");
      if (national === w || digits === w) return m;
    }
    return "[dato eliminado por privacidad]";
  });

  return out;
}

function extractText(data) {
  try {
    var parts = data.candidates[0].content.parts;
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].text) out.push(parts[i].text);
    }
    return out.join("").trim();
  } catch (e) {
    return "";
  }
}
