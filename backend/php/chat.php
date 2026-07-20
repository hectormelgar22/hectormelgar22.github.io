<?php
/**
 * Sentia · Asistente de soporte — versión PHP (Hostinger u otro hosting)
 *
 * Mismo comportamiento que el Cloudflare Worker: el navegador llama aquí,
 * y este script llama a Gemini. La API key NUNCA va en el frontend.
 *
 * La key se lee, por este orden:
 *   1. Variable de entorno GEMINI_API_KEY (si tu panel lo permite)
 *   2. Archivo config.php junto a este script (ver config.example.php)
 *
 * Para migrar desde el Worker solo cambia CHAT_BACKEND en chat.js
 * a la URL de este archivo (p. ej. https://tudominio.com/api/chat.php).
 */

/* ========== CONFIGURACIÓN (edita aquí) ========== */

$ALLOWED_ORIGINS = [
    'https://hectormelgar22.github.io',  // tu web en GitHub Pages
    'https://tudominio.com',             // ← tu dominio definitivo cuando lo tengas
];
// Si la web y este PHP están en el MISMO dominio, las peticiones llegan sin
// cabecera Origin o con el propio dominio: se permite automáticamente.

$GEMINI_MODEL = 'gemini-2.5-flash';
$RATE_PER_MINUTE = 8;
$RATE_PER_DAY = 60;
$MAX_MESSAGE_CHARS = 1000;
$MAX_HISTORY_TURNS = 8;

/* ========== GUARDARRAÍLES (idénticos al Worker) ========== */

$SYSTEM_PROMPT = implode("\n", [
    'Eres el asistente informativo de Sentia, un centro de psicología y terapias en Madrid (presencial y online).',
    'Tu función es orientar con calidez y honestidad a personas que se interesan por la terapia. Muchas atraviesan un mal momento: trátalas con cuidado, sin dramatismo y sin condescendencia.',
    '',
    'NORMAS NO NEGOCIABLES:',
    "1. NUNCA diagnostiques ni sugieras que alguien 'tiene' un trastorno. Puedes hablar de síntomas en general y animar a una evaluación profesional.",
    "2. NUNCA des plazos ni pronósticos de recuperación como hechos ('en 3 meses estarás bien'). Si preguntan cuánto tardarán en recuperarse, explica que depende de cada persona, de su situación y del tipo de proceso, y que en la primera consulta gratuita el equipo puede orientarles mejor.",
    '3. Sé honesto y transmite esperanza basada en evidencia general: la depresión, la ansiedad y la mayoría de los problemas psicológicos tienen tratamientos eficaces y mucha gente mejora. No prometas resultados concretos a nadie.',
    '4. NUNCA recomiendes medicación, dosis, retirar medicación ni pautas de tratamiento específicas. Eso corresponde a profesionales sanitarios.',
    '5. Si detectas ideación suicida, autolesiones o una crisis, no hagas terapia ni interrogues sobre el riesgo: indica con calidez que llamen YA al 024 (línea de atención a la conducta suicida, 24 h, gratuita y confidencial), al 112 si hay peligro inmediato, o al Teléfono de la Esperanza 717 003 717.',
    '6. No inventes datos del centro (precios, nombres de terapeutas, horarios exactos). Si no lo sabes, dilo y remite al formulario de contacto o al teléfono.',
    '',
    'ESTILO: cálido, cercano, en español de España, tuteando. Respuestas breves: 2-5 frases, salvo que pidan expresamente más detalle. Cuando encaje de forma natural, recuerda que la primera consulta orientativa de 15 minutos es gratuita.',
    'Datos reales del centro que sí puedes usar: contacto en la sección de la web, horario Lun-Vie 9:00-20:00, terapia presencial en Madrid y online.',
]);

$CRISIS_PATTERNS = [
    '/suicid/i',
    '/quitarme la vida/i',
    '/matarme/i',
    '/no quiero (seguir )?vivi/i',
    '/no merece la pena vivir/i',
    '/acabar con todo/i',
    '/desaparecer para siempre/i',
    '/hacerme da(ñ|n)o/iu',
    '/autolesi/i',
    '/cortarme/i',
    '/sobredosis/i',
    '/me quiero morir/i',
    '/quiero morirme/i',
];

$CRISIS_REPLY = implode("\n", [
    'Siento mucho que estés pasando por un momento tan duro. Lo que sientes importa, y no tienes que sostenerlo en soledad.',
    '',
    'Por favor, busca ayuda ahora mismo:',
    '• 📞 024 — Línea de atención a la conducta suicida (24 h, gratuita y confidencial)',
    '• 🚨 112 — Emergencias, si estás en peligro inmediato',
    '• ☎️ 717 003 717 — Teléfono de la Esperanza',
    '',
    'Hablar con alguien ahora puede marcar la diferencia. Y cuando quieras, el equipo de Sentia también está aquí para acompañarte.',
]);

/* ========== CORS ========== */

$origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
$sameHost = ($origin === '' ||
    (isset($_SERVER['HTTP_HOST']) && parse_url($origin, PHP_URL_HOST) === $_SERVER['HTTP_HOST']));
$originAllowed = $sameHost || in_array($origin, $ALLOWED_ORIGINS, true);

if ($origin !== '' && $originAllowed) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { fail(405, 'Método no permitido'); }
if (!$originAllowed) { fail(403, 'Origen no permitido'); }

/* ========== API KEY ========== */

$apiKey = getenv('GEMINI_API_KEY');
if (!$apiKey && file_exists(__DIR__ . '/config.php')) {
    $config = include __DIR__ . '/config.php';
    if (is_array($config) && !empty($config['GEMINI_API_KEY'])) {
        $apiKey = $config['GEMINI_API_KEY'];
    }
}
if (!$apiKey) { fail(500, 'El asistente no está configurado todavía.'); }

/* ========== RATE LIMITING (archivos en tmp) ========== */

$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
$rlDir = sys_get_temp_dir() . '/sentia-rl';
if (!is_dir($rlDir)) { @mkdir($rlDir, 0700, true); }

$minuteLeft = rate_check($rlDir, 'm' . floor(time() / 60) . '-' . md5($ip), $RATE_PER_MINUTE, 120);
if (!$minuteLeft) { fail(429, 'Vas muy rápido 🙂 Espera un minuto y seguimos hablando.'); }
$dayLeft = rate_check($rlDir, 'd' . date('Ymd') . '-' . md5($ip), $RATE_PER_DAY, 90000);
if (!$dayLeft) { fail(429, 'Has llegado al límite diario del asistente. Si quieres seguir, escríbenos por el formulario de contacto y te respondemos en persona.'); }

/* ========== ENTRADA ========== */

$body = json_decode(file_get_contents('php://input'), true);
if (!is_array($body)) { fail(400, 'JSON inválido'); }

$message = isset($body['message']) && is_string($body['message']) ? trim($body['message']) : '';
if ($message === '') { fail(400, 'Mensaje vacío'); }
$message = mb_substr($message, 0, $MAX_MESSAGE_CHARS);

/* ---- Detección de crisis (sin llamar al modelo) ---- */
foreach ($CRISIS_PATTERNS as $pattern) {
    if (preg_match($pattern, $message)) {
        echo json_encode(['reply' => $CRISIS_REPLY, 'crisis' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

/* ---- Historial ---- */
$contents = [];
$history = isset($body['history']) && is_array($body['history'])
    ? array_slice($body['history'], -$MAX_HISTORY_TURNS) : [];
foreach ($history as $h) {
    if (!is_array($h) || !isset($h['text']) || !is_string($h['text'])) { continue; }
    $contents[] = [
        'role' => (isset($h['role']) && $h['role'] === 'assistant') ? 'model' : 'user',
        'parts' => [['text' => mb_substr($h['text'], 0, $MAX_MESSAGE_CHARS)]],
    ];
}
$contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];

/* ========== LLAMADA A GEMINI ========== */

$payload = [
    'system_instruction' => ['parts' => [['text' => $SYSTEM_PROMPT]]],
    'contents' => $contents,
    'generationConfig' => [
        'temperature' => 0.6,
        'maxOutputTokens' => 512,
        'thinkingConfig' => ['thinkingBudget' => 0],
    ],
];

$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . $GEMINI_MODEL . ':generateContent');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'Content-Type: application/json',
        'x-goog-api-key: ' . $apiKey,
    ],
    CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
]);
$response = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);

if ($response === false || $status >= 400) {
    if ($status === 429) {
        fail(503, 'El asistente está muy solicitado ahora mismo. Prueba en un minuto, o escríbenos por el formulario.');
    }
    fail(502, 'El asistente no está disponible en este momento. Puedes escribirnos por el formulario de contacto.');
}

$data = json_decode($response, true);
$reply = '';
if (isset($data['candidates'][0]['content']['parts'])) {
    foreach ($data['candidates'][0]['content']['parts'] as $part) {
        if (isset($part['text'])) { $reply .= $part['text']; }
    }
}
$reply = trim($reply);
if ($reply === '') {
    $reply = 'No he podido responder a eso. ¿Quieres contarme de otra forma en qué puedo ayudarte, o prefieres escribir directamente al equipo por el formulario?';
}
echo json_encode(['reply' => $reply], JSON_UNESCAPED_UNICODE);
exit;

/* ========== Helpers ========== */

function fail($status, $msg) {
    http_response_code($status);
    echo json_encode(['error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/** Cuenta peticiones en un archivo con lock; true si aún queda cupo. */
function rate_check($dir, $bucket, $limit, $ttl) {
    $file = $dir . '/' . $bucket;
    // limpieza ocasional de buckets caducados (1 de cada ~50 peticiones)
    if (mt_rand(1, 50) === 1) {
        foreach ((array) glob($dir . '/*') as $old) {
            if (@filemtime($old) < time() - 90000) { @unlink($old); }
        }
    }
    $fp = @fopen($file, 'c+');
    if (!$fp) { return true; } // si no se puede escribir, no bloqueamos el chat
    flock($fp, LOCK_EX);
    $count = (int) stream_get_contents($fp);
    if ($count >= $limit) {
        flock($fp, LOCK_UN);
        fclose($fp);
        return false;
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string) ($count + 1));
    flock($fp, LOCK_UN);
    fclose($fp);
    return true;
}
