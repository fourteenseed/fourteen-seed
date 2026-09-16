(function () {
  'use strict';

  var container = document.querySelector('.living-texture');
  var canvas = container && container.querySelector('canvas');
  if (!container || !canvas) return;

  // Safari runs deferred scripts before external stylesheets have finished
  // loading, so on a cold mobile load this script could read an unstyled
  // container (transparent background, 300x150 box) and paint a black,
  // stretched canvas. Wait until our own rules have applied before starting.
  function stylesReady() { return getComputedStyle(container).position === 'fixed'; }

  function readBase() {
    var fallback = [246, 248, 243];
    var match = getComputedStyle(container).backgroundColor.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s\/]+([\d.]+%?))?\s*\)$/);
    if (!match) return fallback;
    var alpha = match[4] === undefined ? 1 : parseFloat(match[4]);
    if (!(alpha > 0)) return fallback;
    return [match[1], match[2], match[3]].map(Number);
  }

  if (stylesReady()) {
    init();
  } else {
    var pending = 0;
    var start = function () {
      window.cancelAnimationFrame(pending);
      window.removeEventListener('load', start);
      init();
    };
    var poll = function () {
      if (stylesReady()) start();
      else pending = window.requestAnimationFrame(poll);
    };
    window.addEventListener('load', start);
    pending = window.requestAnimationFrame(poll);
  }

  function init() {
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) return;

    var vertexSource = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }';
    var fragmentSource = [
      'precision highp float;',
      'uniform vec2 u_size;',
      'uniform float u_dpr;',
      'uniform float u_radius;',
      'uniform vec3 u_base;',
      'uniform vec4 u_wake[16];',
      'float groove(float phase, float center, float aa) {',
      '  float distance = abs(mod(phase - center + 3.0, 6.0) - 3.0);',
      '  return 1.0 - smoothstep(0.35 - aa, 0.35 + aa, distance);',
      '}',
      'void main() {',
      '  vec2 point = vec2(gl_FragCoord.x / u_dpr, u_size.y - gl_FragCoord.y / u_dpr);',
      '  vec2 bend = vec2(0.0);',
      '  for (int i = 0; i < 16; i++) {',
      '    if (abs(u_wake[i].z) + abs(u_wake[i].w) > 0.0001) {',
      '      vec2 delta = (point - u_wake[i].xy) / u_radius;',
      '      float distanceSquared = dot(delta, delta);',
      '      if (distanceSquared < 4.0) {',
      '        vec2 flow = vec2(u_wake[i].z + 0.75 * u_wake[i].w, u_wake[i].w);',
      '        bend += flow * exp(-distanceSquared * 2.0);',
      '      }',
      '    }',
      '  }',
      '  bend = 16.0 * bend / (1.0 + length(bend));',
      '  float phase = dot(point + bend, vec2(0.997564, 0.069756));',
      '  float aa = 0.5 / u_dpr;',
      '  float dark = groove(phase, 0.35, aa);',
      '  float light = groove(phase, 1.05, aa);',
      '  float depth = 0.06 + 0.025 * min(length(bend) / 8.0, 1.0);',
      '  vec3 color = mix(u_base, vec3(21.0, 59.0, 55.0) / 255.0, dark * depth);',
      '  color = mix(color, vec3(1.0), light * 0.65);',
      '  gl_FragColor = vec4(color, 1.0);',
      '}'
    ].join('\n');

    function compile(type, source) {
      var shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      gl.deleteShader(shader);
      return null;
    }

    var vertex = compile(gl.VERTEX_SHADER, vertexSource);
    var fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
    var program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;

    var buffer = gl.createBuffer();
    if (!buffer) return;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var uniforms = {
      size: gl.getUniformLocation(program, 'u_size'),
      dpr: gl.getUniformLocation(program, 'u_dpr'),
      radius: gl.getUniformLocation(program, 'u_radius'),
      base: gl.getUniformLocation(program, 'u_base'),
      wake: gl.getUniformLocation(program, 'u_wake[0]')
    };
    var base = readBase();
    gl.uniform3f(uniforms.base, base[0] / 255, base[1] / 255, base[2] / 255);

    var MAX_WAKES = 16;
    var WAKE_LIFETIME = 1400;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var wakeData = new Float32Array(MAX_WAKES * 4);
    var wakes = [];
    var frame = 0;
    var width = 1;
    var height = 1;
    var pointer = null;
    var lastPointerTime = 0;
    var lastScrollY = window.scrollY;

    function draw(time) {
      frame = 0;
      if (document.hidden || reduceMotion.matches || gl.isContextLost()) return;
      wakes = wakes.filter(function (wake) { return time - wake.born < WAKE_LIFETIME; });
      wakeData.fill(0);
      wakes.forEach(function (wake, index) {
        var progress = Math.max(0, (time - wake.born) / WAKE_LIFETIME);
        var strength = Math.min(1, progress / 0.06) * Math.pow(1 - progress, 2);
        wakeData.set([wake.x, wake.y, wake.dx * strength, wake.dy * strength], index * 4);
      });
      gl.uniform4fv(uniforms.wake, wakeData);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      container.dataset.flowReady = 'true';
      if (wakes.length) frame = window.requestAnimationFrame(draw);
    }

    function requestDraw() {
      if (!frame && !document.hidden && !reduceMotion.matches && !gl.isContextLost()) {
        frame = window.requestAnimationFrame(draw);
      }
    }

    function addWake(x, y, dx, dy) {
      if (document.hidden || reduceMotion.matches || gl.isContextLost()) return;
      wakes.push({ x: x, y: y, dx: dx, dy: dy, born: performance.now() });
      if (wakes.length > MAX_WAKES) wakes.shift();
      requestDraw();
    }

    function onPointerMove(event) {
      var next = { x: event.clientX, y: event.clientY };
      if (pointer) {
        var now = performance.now();
        if (now - lastPointerTime < 50) return;
        var dx = next.x - pointer.x;
        var dy = next.y - pointer.y;
        var distance = Math.hypot(dx, dy);
        if (distance < 2) return;
        var speed = 0.6 + Math.min(0.4, distance / 60);
        addWake(next.x, next.y, dx / distance * speed, dy / distance * speed);
        lastPointerTime = now;
      }
      pointer = next;
    }

    function clearPointer() { pointer = null; }
    function onPointerOut(event) { if (event.relatedTarget === null) clearPointer(); }
    function onPointerUp(event) { if (event.pointerType !== 'mouse') clearPointer(); }
    function onScroll() {
      var delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      if (delta) addWake(pointer ? pointer.x : width * 0.5, pointer ? pointer.y : height * 0.5, 0, Math.max(-0.35, Math.min(0.35, delta / 100)));
    }
    function onKeydown(event) {
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp', 'Tab', ' '].includes(event.key)) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]')) return;
      addWake(width * 0.5, height * 0.45, event.key === 'ArrowLeft' ? -0.25 : 0.25, 0.1);
    }
    function resize() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      if (reduceMotion.matches || gl.isContextLost()) {
        wakes = [];
        pointer = null;
        delete container.dataset.flowReady;
        return;
      }
      var bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uniforms.size, width, height);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform1f(uniforms.radius, width <= 800 ? 42 : 56);
      draw(performance.now());
    }
    function onVisibilityChange() {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      wakes = [];
      pointer = null;
      if (!document.hidden) resize();
    }
    function onContextLost() {
      onVisibilityChange();
      delete container.dataset.flowReady;
    }

    resize();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', clearPointer, { passive: true });
    window.addEventListener('blur', clearPointer);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', resize);
    window.addEventListener('load', resize);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reduceMotion.addEventListener('change', resize);
    canvas.addEventListener('webglcontextlost', onContextLost);
  }
})();
