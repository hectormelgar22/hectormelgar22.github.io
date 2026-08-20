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
      '<section class="chat-panel" hidden aria-label="Asistente con IA de Sentia">' +
      '<header class="chat-header">' +
      // Avatar con el mismo icono, pequeño, sobre gradiente de marca
      '<span class="chat-header-avatar" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9.8 17.5c-3.9 0-7-2.9-7-6.5S5.9 4.5 9.8 4.5c3.9 0 7 2.9 7 6.5 0 .9-.2 1.8-.6 2.6l1.3 3.4-3.5-1.1c-1.2.7-2.6 1.1-4.2 1.1z"/>' +
      '<path d="M19 2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>' +
      '<path d="M7.5 11h.01M10 11h.01M12.5 11h.01" stroke-width="2.5" stroke-linecap="round"/>' +
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
      "</section>" +
      '<div class="chat-floating-actions">' +
      '<a href="https://wa.me/34600000000?text=Hola%2C%20me%20gustar%C3%ADa%20recibir%20informaci%C3%B3n%20sobre%20las%20sesiones." class="floating-btn whatsapp-fab" target="_blank" rel="noopener noreferrer" aria-label="Contactar por WhatsApp">' +
      '<span class="floating-tooltip">WhatsApp</span>' +
      '<span class="floating-btn-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">' +
      '<path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm0 18.14c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.106 8.106 0 01-1.25-4.52c0-4.5 3.66-8.16 8.16-8.16 2.18 0 4.23.85 5.77 2.39a8.093 8.093 0 012.39 5.77c0 4.5-3.66 8.16-8.16 8.16zm4.47-6.1c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.44.06-.66.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.02 2.6.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z"/>' +
      "</svg>" +
      "</span>" +
      "</a>" +
      '<button type="button" class="floating-btn chat-fab" aria-label="Abrir asistente con IA de Sentia" aria-expanded="false">' +
      '<span class="floating-tooltip">Asistente IA</span>' +
      '<span class="chat-fab-badge" aria-hidden="true">IA</span>' +
      '<span class="chat-fab-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9.8 17.5c-3.9 0-7-2.9-7-6.5S5.9 4.5 9.8 4.5c3.9 0 7 2.9 7 6.5 0 .9-.2 1.8-.6 2.6l1.3 3.4-3.5-1.1c-1.2.7-2.6 1.1-4.2 1.1z"/>' +
      '<path d="M19 2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" stroke="none"/>' +
      '<path d="M7.5 11h.01M10 11h.01M12.5 11h.01" stroke-width="2.5" stroke-linecap="round"/>' +
      "</svg>" +
      "</span>" +
      '<span class="chat-fab-close" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
      '<line x1="18" y1="6" x2="6" y2="18"></line>' +
      '<line x1="6" y1="6" x2="18" y2="18"></line>' +
      "</svg>" +
      "</span>" +
      "</button>" +
      "</div>";
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
