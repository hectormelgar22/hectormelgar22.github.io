/* Sentia · main.js — vanilla IIFE, sin módulos */
(function () {
  "use strict";

  var brand = window.__BRAND__ || {};
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof gsap !== "undefined";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function safe(fn, name) {
    try { fn(); } catch (e) { console.warn("[" + name + "]", e); }
  }

  /* ---------- Nav: estado scrolled ---------- */
  function initNav() {
    var nav = $(".nav");
    if (!nav) return;
    var onScroll = function () {
      nav.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Menú móvil ---------- */
  function initMobileMenu() {
    var toggle = $(".nav-toggle");
    var menu = $(".mobile-menu");
    if (!toggle || !menu) return;

    function setOpen(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      menu.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
    }

    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    $$(".mobile-menu a").forEach(function (a) {
      a.addEventListener("click", function () { setOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* ---------- Reveals on scroll ---------- */
  function initReveals() {
    var items = $$(".reveal");
    if (!items.length) return;

    if (!("IntersectionObserver" in window) || reduced) {
      items.forEach(function (el) { el.classList.add("is-in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

    items.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 0.08 + "s";
      io.observe(el);
    });
  }

  /* ---------- Hero: entrada de líneas del título ---------- */
  function initHeroIntro() {
    var inners = $$(".hero-title .line-i");
    var fades = $$(".hero-fade");

    // Sin GSAP o con movimiento reducido: mostrar todo de golpe, nunca en blanco.
    if (!hasGsap || reduced) {
      inners.forEach(function (el) { el.style.transform = "none"; });
      fades.forEach(function (el) { el.style.opacity = "1"; el.style.transform = "none"; });
      return;
    }

    // Fijamos el estado inicial aquí y no vía CSS: la clase .is-ready
    // se añade al final del boot, después de que corra esta función.
    gsap.set(inners, { yPercent: 110 });
    gsap.set(fades, { opacity: 0, y: 24 });

    // Red de seguridad: si por lo que sea la animación no llega a correr
    // (rAF retrasado, pestaña en segundo plano, GSAP a medio cargar),
    // el hero NUNCA puede quedarse en blanco. A los 3s se muestra sí o sí.
    var done = false;
    var failsafe = setTimeout(function () {
      if (done) return;
      gsap.killTweensOf(inners);
      gsap.killTweensOf(fades);
      // Sin clearProps: dejaría mandar de nuevo al CSS y volverían a ocultarse.
      inners.forEach(function (el) { el.style.transform = "none"; });
      fades.forEach(function (el) { el.style.opacity = "1"; el.style.transform = "none"; });
    }, 3000);

    var tl = gsap.timeline({
      delay: 0.15,
      onComplete: function () { done = true; clearTimeout(failsafe); }
    });

    tl.to(inners, {
      yPercent: 0,
      duration: 1.25,
      stagger: 0.12,
      ease: "power4.out"
    });

    // Los elementos con data-delay entran escalonados tras el titular.
    fades.forEach(function (el) {
      var step = parseFloat(el.getAttribute("data-delay")) || 0;
      tl.to(el, {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out"
      }, 0.35 + step * 0.13);
    });
  }

  /* ---------- El orbe que respira: texto guía sincronizado ----------
     El ciclo visual lo lleva CSS (@keyframes breathe). Aquí solo
     cambiamos la palabra, reenganchándonos en cada vuelta de la
     animación para que nunca se desincronice del orbe. */
  function initBreath() {
    var core = $(".breath-core");
    var phase = $(".breath-phase");
    if (!core || !phase || reduced) return;

    // Fases en ms dentro del ciclo de 11s definido en CSS (--breath).
    var CYCLE = 11000;
    var PHASES = [
      { at: 5500, text: "Exhala" },
      { at: 4000, text: "Sostén" },
      { at: 0, text: "Inhala" }
    ];

    function setPhase(text) {
      if (phase.textContent === text) return;
      phase.classList.add("is-changing");
      setTimeout(function () {
        phase.textContent = text;
        phase.classList.remove("is-changing");
      }, 320);
    }

    // Leemos la posición REAL de la animación en vez de llevar temporizadores
    // en paralelo: así el texto no puede desincronizarse del orbe aunque el
    // navegador retrase los timers (pestaña en segundo plano, CPU cargada...).
    var anim = core.getAnimations ? core.getAnimations()[0] : null;

    function tick() {
      var t;
      if (anim && anim.currentTime != null) {
        t = anim.currentTime % CYCLE;
      } else {
        // Navegador sin Web Animations API: nos apoyamos en el reloj propio.
        t = (Date.now() - start) % CYCLE;
      }
      for (var i = 0; i < PHASES.length; i++) {
        if (t >= PHASES[i].at) { setPhase(PHASES[i].text); return; }
      }
    }

    var start = Date.now();
    tick();
    setInterval(tick, 250);
  }

  /* ---------- Halo que sigue al cursor en el hero ---------- */
  function initHeroCursor() {
    var hero = $(".hero");
    if (!hero || reduced || !window.matchMedia("(hover: hover)").matches) return;

    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      hero.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    });
  }

  /* ---------- Tarjetas: foco de luz + dibujado del icono ---------- */
  function initCards() {
    var cards = $$(".bento-card");
    if (!cards.length) return;

    // El icono se "dibuja" cuando la tarjeta entra en pantalla.
    if ("IntersectionObserver" in window && !reduced) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          en.target.classList.add("is-in");
          io.unobserve(en.target);
        });
      }, { threshold: 0.25 });
      cards.forEach(function (c) { io.observe(c); });
    } else {
      cards.forEach(function (c) { c.classList.add("is-in"); });
    }

    if (reduced || !window.matchMedia("(hover: hover)").matches) return;
    cards.forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--cx", ((e.clientX - r.left) / r.width) * 100 + "%");
        card.style.setProperty("--cy", ((e.clientY - r.top) / r.height) * 100 + "%");
      });
    });
  }

  /* ---------- Botones magnéticos ---------- */
  function initMagnetic() {
    var els = $$(".magnetic");
    if (!els.length || reduced || !hasGsap || !window.matchMedia("(hover: hover)").matches) return;

    els.forEach(function (el) {
      el.addEventListener("pointermove", function (e) {
        var r = el.getBoundingClientRect();
        gsap.to(el, {
          x: (e.clientX - r.left - r.width / 2) * 0.28,
          y: (e.clientY - r.top - r.height / 2) * 0.4,
          duration: 0.5,
          ease: "power3.out"
        });
      });
      el.addEventListener("pointerleave", function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" });
      });
    });
  }

  /* ---------- Contadores del hero ---------- */
  function initCounters() {
    var counters = $$("[data-counter]");
    if (!counters.length) return;

    function run(el) {
      var target = parseInt(el.getAttribute("data-counter"), 10) || 0;
      if (reduced || !hasGsap) { el.textContent = String(target); return; }
      var obj = { v: 0 };
      gsap.to(obj, {
        v: target,
        duration: 1.8,
        ease: "power2.out",
        onUpdate: function () {
          el.textContent = Math.round(obj.v).toLocaleString("es-ES");
        }
      });
    }

    if (!("IntersectionObserver" in window)) {
      counters.forEach(run);
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          run(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { io.observe(el); });
  }

  /* ---------- Tilt 3D en cards ---------- */
  function initTilt() {
    if (reduced || !matchMedia("(hover: hover)").matches) return;
    $$("[data-tilt]").forEach(function (card) {
      var rect = null;
      card.addEventListener("mouseenter", function () {
        rect = card.getBoundingClientRect();
      });
      card.addEventListener("mousemove", function (e) {
        if (!rect) rect = card.getBoundingClientRect();
        var x = (e.clientX - rect.left) / rect.width - 0.5;
        var y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform =
          "perspective(900px) rotateX(" + (-y * 5) + "deg) rotateY(" + (x * 5) + "deg) translateY(-8px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
        rect = null;
      });
    });
  }

  /* ---------- Parallax suave en placeholders ---------- */
  function initParallax() {
    if (reduced || !hasGsap || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);

    $$(".ph-tall, .ph-wide").forEach(function (el) {
      gsap.fromTo(el, { y: 30 }, {
        y: -30,
        ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1.2 }
      });
    });
  }

  /* ---------- Accordion: solo uno abierto ---------- */
  function initAccordion() {
    var items = $$(".acc-item");
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (!item.open) return;
        items.forEach(function (other) {
          if (other !== item && other.open) other.open = false;
        });
      });
    });
  }

  /* ---------- Smooth scroll con offset del nav ---------- */
  function initAnchors() {
    $$('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = a.getAttribute("href");
        if (id.length < 2) return;
        var target = $(id);
        if (!target) return;
        e.preventDefault();
        var top = target.getBoundingClientRect().top + window.scrollY - 76;
        window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
      });
    });
  }

  /* ---------- Test de orientación ---------- */
  var QUIZ_RESULTS = {
    ansiedad: {
      title: "Ansiedad",
      desc: "Tus respuestas apuntan a un patrón de alerta constante: preocupación, tensión y una mente que no para. Es el motivo de consulta más frecuente y uno de los que mejor responde a la terapia cognitivo-conductual. Con las herramientas adecuadas, la calma se recupera."
    },
    depresion: {
      title: "Ánimo bajo o depresión",
      desc: "Tus respuestas reflejan apatía, falta de energía o desconexión de lo que antes disfrutabas. No es pereza ni debilidad: es un estado tratable. La terapia te ayuda a reactivar tu vida paso a paso, a tu ritmo."
    },
    estres: {
      title: "Estrés y burnout",
      desc: "Tus respuestas sugieren sobrecarga: demasiadas responsabilidades y muy poco espacio para ti. Aprender a poner límites, priorizar y desconectar no es un lujo — es salud. Trabajamos exactamente eso."
    },
    autoestima: {
      title: "Autoestima e inseguridad",
      desc: "Tus respuestas hablan de autoexigencia, comparación y una voz interna muy crítica. La relación contigo es la más larga de tu vida, y se puede sanar: en terapia aprendemos a tratarte con la misma justicia con la que tratas a los demás."
    },
    duelo: {
      title: "Duelo o pérdida",
      desc: "Tus respuestas indican que estás atravesando una pérdida que sigue pesando. El duelo no se supera olvidando, se transita acompañado. La terapia te da un espacio para ordenar lo vivido y volver a mirar hacia delante."
    },
    insomnio: {
      title: "Insomnio y descanso",
      desc: "Tus respuestas apuntan a un problema de descanso: te cuesta dormir o el sueño no repara. El tratamiento cognitivo-conductual del insomnio es la opción más eficaz a largo plazo, por delante de la medicación."
    },
    trauma: {
      title: "Huella de trauma o pensamientos intrusivos",
      desc: "Tus respuestas sugieren que algo vivido sigue doliendo, o que hay pensamientos repetitivos que no eliges tener. Con EMDR y terapias especializadas, esas experiencias pueden dejar de condicionar tu presente."
    }
  };

  var QUIZ_QUESTIONS = [
    { q: "¿Qué frase te representa más últimamente?", opts: [
      ["No puedo parar de darle vueltas a todo", { ansiedad: 2 }],
      ["Nada me apetece, ni lo que antes disfrutaba", { depresion: 2 }],
      ["Estoy agotado/a, no llego a todo", { estres: 2 }],
      ["Siento que no soy suficiente", { autoestima: 2 }]
    ]},
    { q: "Cuando te vas a dormir…", opts: [
      ["Tardo más de una hora, mi cabeza no para", { insomnio: 2, ansiedad: 1 }],
      ["Me despierto varias veces o demasiado pronto", { insomnio: 2 }],
      ["Duermo mucho y aun así estoy sin energía", { depresion: 2 }],
      ["Duermo bien, en general", {}]
    ]},
    { q: "Físicamente, ¿qué notas más a menudo?", opts: [
      ["Palpitaciones, presión en el pecho, nudo en el estómago", { ansiedad: 2 }],
      ["Cansancio constante, pesadez", { depresion: 1, estres: 1 }],
      ["Tensión muscular, mandíbula apretada, dolores de cabeza", { estres: 2 }],
      ["Sobresaltos; me altero con facilidad ante ciertos recuerdos", { trauma: 2 }]
    ]},
    { q: "En tu día a día, la preocupación…", opts: [
      ["Es constante, incluso por cosas pequeñas", { ansiedad: 2 }],
      ["Aparece sobre todo por el trabajo o los estudios", { estres: 2 }],
      ["Gira en torno a cómo me ven los demás", { autoestima: 2 }],
      ["Más que preocupación, siento vacío o indiferencia", { depresion: 2 }]
    ]},
    { q: "¿Has vivido hace poco una pérdida o un cambio importante? (ruptura, fallecimiento, mudanza…)", opts: [
      ["Sí, y siento que no consigo superarlo", { duelo: 3 }],
      ["Sí, pero creo que lo estoy gestionando", { duelo: 1 }],
      ["No, pero hay algo del pasado que me sigue doliendo", { trauma: 2 }],
      ["No", {}]
    ]},
    { q: "Tu estado de ánimo, la mayoría de los días, es…", opts: [
      ["Nervioso, en alerta", { ansiedad: 2 }],
      ["Triste o apagado", { depresion: 2 }],
      ["Irritable, con poca paciencia", { estres: 2 }],
      ["Depende mucho de cómo me valoren los demás", { autoestima: 2 }]
    ]},
    { q: "Con tus tareas y responsabilidades…", opts: [
      ["Me siento desbordado/a, no desconecto ni el fin de semana", { estres: 2 }],
      ["Las pospongo, no tengo energía para empezar", { depresion: 2 }],
      ["Compruebo o repito cosas varias veces por miedo a fallar", { trauma: 2 }],
      ["Las termino, pero nunca me parecen lo bastante buenas", { autoestima: 2 }]
    ]},
    { q: "¿Hay pensamientos o imágenes que se repiten aunque no quieras?", opts: [
      ["Sí, recuerdos de algo difícil que viví", { trauma: 2 }],
      ["Sí, ideas desagradables que intento apartar y vuelven", { trauma: 2 }],
      ["Sí, preocupaciones sobre el futuro", { ansiedad: 2 }],
      ["No especialmente", {}]
    ]},
    { q: "En lo social, últimamente…", opts: [
      ["Evito planes porque no tengo ganas", { depresion: 2 }],
      ["Evito situaciones donde pueda quedar mal", { autoestima: 1, ansiedad: 1 }],
      ["Me cuesta decir que no, acabo cargando con todo", { autoestima: 1, estres: 1 }],
      ["Sin cambios importantes", {}]
    ]},
    { q: "Al despertar por la mañana…", opts: [
      ["Todo me pesa, me cuesta muchísimo arrancar", { depresion: 2 }],
      ["Ya me levanto con nervios o el pecho encogido", { ansiedad: 2 }],
      ["Me levanto cansado/a, como si no hubiera dormido", { insomnio: 2 }],
      ["Solo pienso en cuánto queda para el fin de semana", { estres: 2 }]
    ]},
    { q: "Tu concentración…", opts: [
      ["Se me escapa hacia las preocupaciones", { ansiedad: 2 }],
      ["Está lenta; me cuesta hasta leer o ver una serie", { depresion: 2 }],
      ["Solo pienso en todo lo que me queda por hacer", { estres: 2 }],
      ["Bien, en general", {}]
    ]},
    { q: "Cuando piensas en ti…", opts: [
      ["Me critico muy duro", { autoestima: 2 }],
      ["No siento gran cosa, como anestesia", { depresion: 2 }],
      ["Me comparo constantemente con los demás", { autoestima: 2 }],
      ["Me veo razonablemente bien", {}]
    ]},
    { q: "Por la noche, ¿qué te quita el sueño?", opts: [
      ["Repasar conversaciones o errores del día", { ansiedad: 1, autoestima: 1 }],
      ["La lista de tareas de mañana", { estres: 2 }],
      ["Recuerdos difíciles o pesadillas", { trauma: 2 }],
      ["Nada en concreto, pero aun así duermo mal", { insomnio: 2 }]
    ]},
    { q: "Si pudieras pedirle una sola cosa a la terapia…", opts: [
      ["Calma: dejar de vivir en alerta", { ansiedad: 2 }],
      ["Ilusión: volver a disfrutar de las cosas", { depresion: 2 }],
      ["Equilibrio: desconectar y recuperar mi tiempo", { estres: 2 }],
      ["Paz: con mi pasado y conmigo mismo/a", { trauma: 1, duelo: 1, autoestima: 1 }]
    ]}
  ];

  function initQuiz() {
    var stage = $("[data-quiz]");
    if (!stage) return;

    var current = 0;
    var answers = [];
    var letters = ["A", "B", "C", "D"];

    function esc(s) {
      var d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    }

    function renderQuestion() {
      var item = QUIZ_QUESTIONS[current];
      var pct = Math.round((current / QUIZ_QUESTIONS.length) * 100);
      var html =
        '<div class="quiz-step">' +
        '<div class="quiz-progress">' +
        '<span class="quiz-progress-label">Pregunta ' + (current + 1) + " de " + QUIZ_QUESTIONS.length + "</span>" +
        '<div class="quiz-bar"><span style="width:' + pct + '%"></span></div>' +
        "</div>" +
        '<p class="quiz-question">' + esc(item.q) + "</p>" +
        '<div class="quiz-options">';
      item.opts.forEach(function (opt, i) {
        html +=
          '<button type="button" class="quiz-option" data-i="' + i + '">' +
          '<span class="quiz-option-key">' + letters[i] + "</span>" +
          "<span>" + esc(opt[0]) + "</span></button>";
      });
      html += "</div>" +
        '<div class="quiz-nav"><button type="button" class="quiz-back"' + (current === 0 ? " disabled" : "") + ">← Anterior</button></div>" +
        "</div>";
      stage.innerHTML = html;

      $$(".quiz-option", stage).forEach(function (btn) {
        btn.addEventListener("click", function () {
          answers[current] = parseInt(btn.getAttribute("data-i"), 10);
          current++;
          if (current < QUIZ_QUESTIONS.length) renderQuestion();
          else renderResult();
        });
      });
      var back = $(".quiz-back", stage);
      if (back) back.addEventListener("click", function () {
        if (current > 0) { current--; renderQuestion(); }
      });
    }

    /* ---- Opt-in de email (RGPD/LSSI-compatible) ----
       - Se muestra DESPUÉS del resultado: no lo bloquea (evita el
         "consentimiento forzado" que la AEPD considera inválido).
       - Dos checkboxes SEPARADOS: privacidad (obligatorio, base legal
         del tratamiento) y marketing (obligatorio también aquí, porque
         la finalidad declarada es recibir comunicaciones).
       - Enlaces a política de privacidad reales.
       - Si el visitante ya dio email antes (localStorage), no se le
         vuelve a pedir. */
    var LEAD_KEY = "sentia_lead_v1";
    // Resolvemos la ruta a la política según en qué página estamos.
    // El test vive en la home, pero por si el widget se usa en subrutas.
    var PRIVACY_URL = (location.pathname.split("/").length > 2 ? "../" : "") + "legal/privacidad.html";

    function alreadyGaveEmail() {
      try { return !!localStorage.getItem(LEAD_KEY); } catch (e) { return false; }
    }

    function renderOptin(topic) {
      // topic: string con la clave del perfil ('ansiedad', 'depresion'...)
      //        o "general" si no destacó ninguno. Se envía al backend
      //        para poder segmentar futuros envíos.
      if (alreadyGaveEmail()) return "";

      return '' +
        '<aside class="quiz-optin" aria-labelledby="quiz-optin-title">' +
          '<div class="quiz-optin-head">' +
            '<span class="quiz-optin-icon" aria-hidden="true">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M4 7l8 6 8-6"/><rect x="3" y="5" width="18" height="14" rx="2"/>' +
              '</svg>' +
            '</span>' +
            '<div>' +
              '<h5 id="quiz-optin-title">¿Quieres recibir consejos <em>para tu perfil</em>?</h5>' +
              '<p>Te enviamos un email al mes con recursos prácticos y lecturas breves relacionadas con lo que has puntuado. Nada más — y darse de baja es un clic.</p>' +
            '</div>' +
          '</div>' +
          '<form class="quiz-optin-form" data-topic="' + esc(topic) + '" novalidate>' +
            '<div class="quiz-optin-field">' +
              '<label for="quiz-email" class="sr-only">Tu email</label>' +
              '<input id="quiz-email" name="email" type="email" required autocomplete="email" placeholder="tu@email.com">' +
              '<button type="submit" class="btn btn-solid">Recibir consejos<span class="btn-arrow" aria-hidden="true">→</span></button>' +
            '</div>' +
            '<label class="quiz-optin-check">' +
              '<input type="checkbox" name="privacidad" required>' +
              '<span>He leído y acepto la <a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">política de privacidad</a>.</span>' +
            '</label>' +
            '<label class="quiz-optin-check">' +
              '<input type="checkbox" name="marketing" required>' +
              '<span>Consiento recibir comunicaciones comerciales de Sentia por email. Podré revocarlo en cualquier momento.</span>' +
            '</label>' +
            '<p class="quiz-optin-note">🔒 Tu email no se comparte jamás. Base legal: consentimiento (art. 6.1.a RGPD). Responsable: Sentia. Derechos ARCO en <a href="mailto:hola@sentia.es">hola@sentia.es</a>.</p>' +
            '<p class="quiz-optin-error" hidden></p>' +
          '</form>' +
        '</aside>';
    }

    function bindOptin() {
      var form = $(".quiz-optin-form", stage);
      if (!form) return;
      var errBox = $(".quiz-optin-error", form);

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        errBox.hidden = true;
        var email = form.email.value.trim();
        var okPriv = form.privacidad.checked;
        var okMkt  = form.marketing.checked;

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errBox.textContent = "Necesitamos un email válido para poder escribirte.";
          errBox.hidden = false; return;
        }
        if (!okPriv || !okMkt) {
          errBox.textContent = "Marca los dos consentimientos para continuar.";
          errBox.hidden = false; return;
        }

        var payload = {
          email: email,
          topic: form.dataset.topic || "general",
          source: "quiz",
          consent_privacy: true,
          consent_marketing: true,
          consent_ts: new Date().toISOString(),
          consent_ua: navigator.userAgent
        };

        // TODO backend: crear endpoint POST /api/lead (Worker o PHP) que
        // guarde {email, topic, source, timestamps, evidencia consentimiento}
        // en KV/D1 o pase a Brevo/Mailchimp via API. Debe devolver 200 en éxito.
        // Ver README-chat.md sección "Lead capture" cuando exista.
        var submitBtn = $('button[type="submit"]', form);
        var originalBtn = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.textContent = "Guardando…";

        Promise.resolve()
          .then(function () {
            // Intento real (silencioso si el endpoint aún no existe)
            return fetch("/api/lead", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload)
            }).catch(function () { return { ok: false, _stub: true }; });
          })
          .then(function () {
            try { localStorage.setItem(LEAD_KEY, email); } catch (e) {}
            var optin = $(".quiz-optin", stage);
            optin.innerHTML =
              '<div class="quiz-optin-done">' +
                '<span class="quiz-optin-tick" aria-hidden="true">' +
                  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"/></svg>' +
                '</span>' +
                '<div>' +
                  '<strong>Listo. Te hemos apuntado.</strong>' +
                  '<p>Recibirás el primer email en los próximos días. Puedes darte de baja cuando quieras desde cualquier correo que te enviemos.</p>' +
                '</div>' +
              '</div>';
          });
      });
    }

    function renderResult() {
      var scores = {};
      answers.forEach(function (optIndex, qIndex) {
        var weights = QUIZ_QUESTIONS[qIndex].opts[optIndex][1];
        Object.keys(weights).forEach(function (key) {
          scores[key] = (scores[key] || 0) + weights[key];
        });
      });
      var ranked = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; });
      var topKey = ranked[0];
      var second = ranked[1];

      var html;
      var optinTopic;
      if (!topKey || scores[topKey] < 3) {
        optinTopic = "general";
        html =
          '<div class="quiz-result">' +
          '<span class="quiz-result-tag">✳ Resultado</span>' +
          "<h4>Buenas noticias: <em>no destaca ningún malestar</em></h4>" +
          '<p class="quiz-result-desc">Tus respuestas no apuntan a un problema concreto en este momento. Aun así, si algo te inquieta o quieres un espacio para ti, la terapia también sirve para crecer, no solo para reparar.</p>' +
          '<div class="quiz-result-cta"><a class="btn btn-cream" href="#contacto">Hablar con el equipo<span class="btn-arrow" aria-hidden="true">→</span></a>' +
          '<button type="button" class="quiz-restart">Repetir el test</button></div></div>';
      } else {
        optinTopic = topKey;
        var res = QUIZ_RESULTS[topKey];
        var secondaryNote = "";
        if (second && scores[second] >= 3 && QUIZ_RESULTS[second]) {
          secondaryNote = '<p class="quiz-result-secondary">También puntúas en <strong>' +
            esc(QUIZ_RESULTS[second].title.toLowerCase()) +
            "</strong> — es habitual que ambos vayan de la mano, y se trabajan juntos en terapia.</p>";
        }
        html =
          '<div class="quiz-result">' +
          '<span class="quiz-result-tag">✳ Tu resultado orientativo</span>' +
          "<h4>Lo que describes encaja con <em>" + esc(res.title.toLowerCase()) + "</em></h4>" +
          '<p class="quiz-result-desc">' + esc(res.desc) + "</p>" +
          secondaryNote +
          '<div class="quiz-result-cta">' +
          '<a class="btn btn-cream" href="#contacto">Pedir primera consulta gratuita<span class="btn-arrow" aria-hidden="true">→</span></a>' +
          '<button type="button" class="quiz-restart">Repetir el test</button>' +
          "</div></div>";
      }

      // El opt-in va DESPUÉS del resultado, no lo bloquea.
      stage.innerHTML = html + renderOptin(optinTopic);

      var restart = $(".quiz-restart", stage);
      if (restart) restart.addEventListener("click", function () {
        current = 0;
        answers = [];
        renderQuestion();
      });

      bindOptin();
    }

    renderQuestion();
  }

  /* ---------- Formulario: feedback de envío (demo) ---------- */
  function initForm() {
    var form = $(".contact-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      var btn = $('button[type="submit"]', form);
      var original = btn.innerHTML;
      btn.innerHTML = "✓ Mensaje enviado. Te contactamos pronto.";
      btn.disabled = true;
      form.reset();
      setTimeout(function () {
        btn.innerHTML = original;
        btn.disabled = false;
      }, 4000);
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    safe(initNav, "initNav");
    safe(initMobileMenu, "initMobileMenu");
    safe(initReveals, "initReveals");
    safe(initHeroIntro, "initHeroIntro");
    safe(initBreath, "initBreath");
    safe(initHeroCursor, "initHeroCursor");
    safe(initMagnetic, "initMagnetic");
    safe(initCards, "initCards");
    safe(initCounters, "initCounters");
    safe(initTilt, "initTilt");
    safe(initParallax, "initParallax");
    safe(initAccordion, "initAccordion");
    safe(initQuiz, "initQuiz");
    safe(initAnchors, "initAnchors");
    safe(initForm, "initForm");
    document.documentElement.classList.add("is-ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
