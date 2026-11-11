const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger({ level = 'info', stream = process.stderr } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function emit(name, args) {
    if (LEVELS[name] < threshold) return;
    stream.write(`[${name}] ${args.map(String).join(' ')}\n`);
  }

  return {
    debug: (...a) => emit('debug', a),
    info: (...a) => emit('info', a),
    warn: (...a) => emit('warn', a),
    error: (...a) => emit('error', a),
  };
}

export function redact(value) {
  const s = String(value ?? '');
  if (s.length <= 4) return '****';
  return s.slice(0, 2) + '*'.repeat(Math.max(1, s.length - 4)) + s.slice(-2);
}
