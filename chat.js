/* Sentia · Widget de chat con IA — vanilla IIFE, sin frameworks.
   Llama SIEMPRE a tu backend (Worker o PHP), nunca a Gemini directamente. */
(function () {
  "use strict";

  /* ===== CONFIGURACIÓN — única línea a cambiar al migrar de backend ===== */
  var CHAT_BACKEND = "https://sentia-chat.hector22melgar.workers.dev";
  // Al migrar a Hostinger:  var CHAT_BACKEND = "https://tudominio.com/api/chat.php";

  var MAX_INPUT = 1000;
  var history = []; // {role: "user"|"assistant", text}
  var busy = false;

  function build() {
    var root = document.createElement("div");
    root.className = "chat-root";
    root.innerHTML =
      '<button type="button" class="chat-fab" aria-label="Abrir asistente con IA de Sentia" aria-expanded="false">' +
      '<span class="chat-fab-icon" aria-hidden="true">' +
      // Icono propio: nodo/cerebro estilizado con chispas ("sparkles" = IA generativa
      // en el lenguaje visual actual, evita confusión con burbuja de WhatsApp).
      '<svg viewBox="0 0 26 26" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 5.2c2.5 0 4.6 1.6 4.6 3.9 0 1.1-.5 2-1.3 2.7.8.5 1.3 1.4 1.3 2.4 0 1.9-1.9 3.5-4.2 3.5H10c-2.3 0-4.2-1.6-4.2-3.5 0-1 .5-1.9 1.3-2.4-.8-.7-1.3-1.6-1.3-2.7 0-2.3 2.1-3.9 4.6-3.9"/>' +
      '<path d="M9.5 11.7h5M11 8.5v6.4"/>' +
      // 3 chispas alrededor: la marca visual de "IA"
      '<path d="M20.5 6.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>' +
      '<path d="M20.5 16.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor" stroke="none"/>' +
      '<path d="M4.5 5.5l.4 1 1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="currentColor" stroke="none"/>' +
      "</svg>" +
      "</span>" +
      '<span class="chat-fab-close" aria-hidden="true">×</span>' +
      "</button>" +
      '<section class="chat-panel" hidden aria-label="Asistente con IA de Sentia">' +
      '<header class="chat-header">' +
      // Avatar con el mismo icono, pequeño, sobre gradiente de marca
      '<span class="chat-header-avatar" aria-hidden="true">' +
      '<svg viewBox="0 0 26 26" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M13 5.2c2.5 0 4.6 1.6 4.6 3.9 0 1.1-.5 2-1.3 2.7.8.5 1.3 1.4 1.3 2.4 0 1.9-1.9 3.5-4.2 3.5H10c-2.3 0-4.2-1.6-4.2-3.5 0-1 .5-1.9 1.3-2.4-.8-.7-1.3-1.6-1.3-2.7 0-2.3 2.1-3.9 4.6-3.9"/>' +
      '<path d="M9.5 11.7h5M11 8.5v6.4"/>' +
      "</svg>" +
      "</span>" +
      "<div><strong>Asistente IA de Sentia</strong>" +
      "<small>Respuestas informativas · en segundos</small></div>" +
      "</header>" +
      '<div class="chat-messages" role="log" aria-live="polite"></div>' +
      '<form class="chat-form">' +
      '<label class="sr-only" for="chat-input">Escribe tu mensaje</label>' +
      '<textarea id="chat-input" class="chat-input" rows="1" maxlength="' + MAX_INPUT + '" placeholder="Escribe tu duda…"></textarea>' +
      '<button type="submit" class="chat-send" aria-label="Enviar">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>' +
      "</button>" +
      "</form>" +
      '<p class="chat-disclaimer">Asistente informativo con IA — no sustituye atención profesional. En crisis llama al <a href="tel:024">024</a>.</p>' +
      "</section>";
    document.body.appendChild(root);
    return root;
  }

  function addMessage(container, role, text) {
    var msg = document.createElement("div");
    msg.className = "chat-msg chat-msg-" + role;
    // solo texto plano — nunca innerHTML con contenido del modelo o del usuario
    var lines = String(text).split("\n");
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) msg.appendChild(document.createElement("br"));
      msg.appendChild(document.createTextNode(lines[i]));
    }
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
  }

  function addTyping(container) {
    var el = document.createElement("div");
    el.className = "chat-msg chat-msg-assistant chat-typing";
    el.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
    return el;
  }

  function send(messages, input, sendBtn) {
    var text = input.value.trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = "";
    input.style.height = "";

    addMessage(messages, "user", text);
    history.push({ role: "user", text: text });
    var typing = addTyping(messages);

    fetch(CHAT_BACKEND, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: history.slice(0, -1).slice(-8) })
    })
      .then(function (res) { return res.json().then(function (d) { return { ok: res.ok, data: d }; }); })
      .then(function (r) {
        typing.remove();
        var reply = r.data && (r.data.reply || r.data.error) ||
          "No he podido conectar. Inténtalo de nuevo o escríbenos por el formulario de contacto.";
        addMessage(messages, "assistant", reply);
        if (r.ok && r.data && r.data.reply) {
          history.push({ role: "assistant", text: r.data.reply });
        }
      })
      .catch(function () {
        typing.remove();
        addMessage(messages, "assistant",
          "Ahora mismo no puedo conectar con el asistente. Puedes escribirnos por el formulario de contacto y te respondemos en menos de 24 h laborables.");
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }

  function init() {
    var root = build();
    var fab = root.querySelector(".chat-fab");
    var panel = root.querySelector(".chat-panel");
    var messages = root.querySelector(".chat-messages");
    var form = root.querySelector(".chat-form");
    var input = root.querySelector(".chat-input");
    var sendBtn = root.querySelector(".chat-send");
    var greeted = false;

    fab.addEventListener("click", function () {
      var open = panel.hidden;
      panel.hidden = !open;
      fab.setAttribute("aria-expanded", String(open));
      root.classList.toggle("is-open", open);
      if (open) {
        if (!greeted) {
          greeted = true;
          addMessage(messages, "assistant",
            "Hola 👋 Soy el asistente de Sentia. Puedo resolver dudas sobre la terapia, cómo trabajamos o por dónde empezar. ¿En qué te puedo ayudar?");
        }
        input.focus();
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        fab.setAttribute("aria-expanded", "false");
        root.classList.remove("is-open");
        fab.focus();
      }
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(messages, input, sendBtn);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(messages, input, sendBtn);
      }
    });
    input.addEventListener("input", function () {
      input.style.height = "";
      input.style.height = Math.min(input.scrollHeight, 110) + "px";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
