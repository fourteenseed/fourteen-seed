(function () {
  'use strict';

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href^="mailto:"]');
    if (link && typeof window.gtag === 'function') {
      window.gtag('event', 'contact_click', { link_url: link.getAttribute('href') });
    }
  });

  var trigger = document.querySelector('.mobile-nav button');
  var sheet = document.querySelector('.mobile-sheet');
  var closeButton = sheet && sheet.querySelector('.mobile-sheet-close');
  var lastFocused = null;

  function focusableElements() {
    return sheet ? Array.prototype.slice.call(sheet.querySelectorAll('a[href], button:not([disabled])')) : [];
  }

  function setNavigationOpen(open) {
    if (!trigger || !sheet) return;
    if (open) {
      lastFocused = document.activeElement;
      sheet.hidden = false;
      sheet.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-label', 'Close navigation');
      document.documentElement.style.overflow = 'hidden';
      window.requestAnimationFrame(function () { closeButton.focus(); });
    } else {
      sheet.hidden = true;
      sheet.setAttribute('aria-hidden', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-label', 'Open navigation');
      document.documentElement.style.overflow = '';
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }
  }

  if (trigger && sheet && closeButton) {
    trigger.addEventListener('click', function () {
      setNavigationOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });
    closeButton.addEventListener('click', function () { setNavigationOpen(false); });
    sheet.addEventListener('click', function (event) {
      if (event.target === sheet || event.target.closest('a')) setNavigationOpen(false);
    });
    document.addEventListener('keydown', function (event) {
      if (sheet.hidden) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      var elements = focusableElements();
      if (!elements.length) return;
      var first = elements[0];
      var last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  var heroTitle = document.getElementById('hero-title');
  var rotatingWords = heroTitle ? Array.prototype.slice.call(heroTitle.querySelectorAll('.rotating-word > span')) : [];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rotationTimer = 0;
  var currentWord = 0;

  function rotateWord() {
    if (reduceMotion.matches || rotatingWords.length < 2) return;
    var outgoing = rotatingWords[currentWord];
    currentWord = (currentWord + 1) % rotatingWords.length;
    var incoming = rotatingWords[currentWord];
    outgoing.classList.remove('is-current');
    outgoing.classList.add('is-leaving');
    incoming.classList.add('is-entering');
    window.setTimeout(function () {
      outgoing.classList.remove('is-leaving');
      incoming.classList.remove('is-entering');
      incoming.classList.add('is-current');
    }, 400);
  }

  function startRotation() {
    if (!rotationTimer && !reduceMotion.matches && rotatingWords.length > 1) {
      rotationTimer = window.setInterval(rotateWord, 2800);
    }
  }

  function stopRotation() {
    if (rotationTimer) window.clearInterval(rotationTimer);
    rotationTimer = 0;
  }

  if (heroTitle && rotatingWords.length) {
    startRotation();
    heroTitle.addEventListener('pointerenter', stopRotation);
    heroTitle.addEventListener('pointerleave', startRotation);
    reduceMotion.addEventListener('change', function () {
      stopRotation();
      rotatingWords.forEach(function (word, index) {
        word.classList.remove('is-current', 'is-entering', 'is-leaving');
        if (index === 0) word.classList.add('is-current');
      });
      currentWord = 0;
      startRotation();
    });
  }
})();
