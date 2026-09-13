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
  var rotatingWord = heroTitle && heroTitle.querySelector('.rotating-word');
  var rotatingWords = rotatingWord ? Array.prototype.slice.call(rotatingWord.children) : [];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var rotationTimer = 0;
  var transitionTimer = 0;
  var currentWord = 0;

  function appendRotatingWords() {
    if (!rotatingWord || reduceMotion.matches || rotatingWords.length > 1) return;
    ['business', 'work', 'life'].forEach(function (label) {
      var word = document.createElement('span');
      word.textContent = label;
      rotatingWord.appendChild(word);
    });
    rotatingWords = Array.prototype.slice.call(rotatingWord.children);
  }

  function resetRotatingWords() {
    stopRotation();
    if (transitionTimer) window.clearTimeout(transitionTimer);
    transitionTimer = 0;
    rotatingWords.slice(1).forEach(function (word) { word.remove(); });
    rotatingWords = rotatingWord ? Array.prototype.slice.call(rotatingWord.children) : [];
    if (rotatingWords[0]) {
      rotatingWords[0].classList.remove('is-entering', 'is-leaving');
      rotatingWords[0].classList.add('is-current');
    }
    currentWord = 0;
  }

  function rotateWord() {
    if (reduceMotion.matches || rotatingWords.length < 2) return;
    var outgoing = rotatingWords[currentWord];
    currentWord = (currentWord + 1) % rotatingWords.length;
    var incoming = rotatingWords[currentWord];
    outgoing.classList.remove('is-current');
    outgoing.classList.add('is-leaving');
    incoming.classList.add('is-entering');
    transitionTimer = window.setTimeout(function () {
      outgoing.classList.remove('is-leaving');
      incoming.classList.remove('is-entering');
      incoming.classList.add('is-current');
      transitionTimer = 0;
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

  function initialiseHeroRotation() {
    if (!heroTitle || !rotatingWord || reduceMotion.matches) return;
    appendRotatingWords();
    startRotation();
  }

  if (heroTitle && rotatingWord) {
    heroTitle.addEventListener('pointerenter', stopRotation);
    heroTitle.addEventListener('pointerleave', startRotation);
    reduceMotion.addEventListener('change', function () {
      resetRotatingWords();
      if (!reduceMotion.matches) {
        appendRotatingWords();
        startRotation();
      }
    });
    if (document.readyState === 'complete') initialiseHeroRotation();
    else window.addEventListener('load', initialiseHeroRotation, { once: true });
  }

  var journey = document.querySelector('.restaurant-journey');

  if (journey) {
    var chapters = [
      {
        id: 'welcome', number: '01', label: 'Come in', x: 22.2, y: 62,
        eyebrow: 'Cornwall / A new chapter', title: 'Pull up a chair.',
        introduction: 'I’m Wendy Harris. I explore what AI makes possible, then build the things that work for people.',
        paragraphs: [
          'I’ve grown a business from an idea into a company, built a team, and brought products to market. Fourteen Seed is where I bring that experience to what comes next, from my base in Cornwall.',
          'Think of this little restaurant as a way into my world. There’s a seat at the table, a kitchen to explore, and a corner where new ideas are taking shape.'
        ],
        note: 'Founder. Builder. AI power user.'
      },
      {
        id: 'table', number: '02', label: 'The table', x: 50.5, y: 55.5,
        eyebrow: 'People / 25 years alongside the internet', title: 'It starts with people.',
        introduction: 'The interesting part is how technology meets people.',
        paragraphs: [
          'I’ve spent 25 years growing alongside the internet. I’ve seen how it changes what we can build, how businesses work, and the expectations people bring with them.',
          'AI opens up another set of possibilities. I’m interested in how we make those possibilities useful, understandable, and worth making room for in everyday life.'
        ],
        note: 'The question behind the work: how does this help?'
      },
      {
        id: 'kitchen', number: '03', label: 'The kitchen', x: 71.6, y: 33.6,
        eyebrow: 'Business + product / 15 years in SaaS', title: 'Where ideas meet service.',
        introduction: 'I’ve spent 15 years building a software business and shaping its products.',
        paragraphs: [
          'I co-founded Anytime Booking, grew the business, and built a team before exiting operationally in 2025. I bring that experience of both business and product into Fourteen Seed.',
          'With gobblr, James brings a chef’s understanding of kitchens, service, and the people behind them. Together, we’re building around venues, menus, and events, and the day-to-day realities of running a food venue.'
        ],
        note: 'Business experience. Product instinct.'
      },
      {
        id: 'workbench', number: '04', label: 'The workbench', x: 28.5, y: 30.3,
        eyebrow: 'AI / Room to experiment', title: 'What happens if…',
        introduction: 'I’m an AI power user. I love experimenting and exploring what I can build.',
        paragraphs: [
          'I build with coding agents, experiment with private apps, and turn promising ideas into products such as glassmark. Fourteen Seed leaves room for the ideas I haven’t had yet.'
        ],
        note: 'Curiosity is part of the work.'
      }
    ];
    var tabTriggers = Array.prototype.slice.call(journey.querySelectorAll('.journey-station'));
    var hotspots = Array.prototype.slice.call(journey.querySelectorAll('.restaurant-hotspot'));
    var camera = journey.querySelector('.restaurant-camera');
    var overview = journey.querySelector('.restaurant-overview');
    var story = journey.querySelector('.journey-story');
    var previous = journey.querySelector('.journey-previous');
    var progress = journey.querySelector('.journey-progress');
    var initialNext = journey.querySelector('.journey-next');
    var nextClassName = initialNext ? initialNext.className : 'journey-next';
    var currentChapter = 0;
    var zoomed = false;

    function createTextElement(tagName, className, value) {
      var element = document.createElement(tagName);
      if (className) element.className = className;
      element.textContent = value;
      return element;
    }

    function createJourneyIcon(kind, size) {
      var namespace = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(namespace, 'svg');
      size = size || 18;
      var paths = kind === 'left'
        ? ['m12 19-7-7 7-7', 'M19 12H5']
        : kind === 'right'
          ? ['M5 12h14', 'm12 5 7 7-7 7']
          : ['M7 7h10v10', 'M7 17 17 7'];
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.setAttribute('class', 'lucide lucide-arrow-' + kind);
      svg.setAttribute('aria-hidden', 'true');
      paths.forEach(function (definition) {
        var path = document.createElementNS(namespace, 'path');
        path.setAttribute('d', definition);
        svg.appendChild(path);
      });
      return svg;
    }

    function createProductLink(href, label) {
      var link = document.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.className = 'text-link journey-product';
      link.appendChild(document.createTextNode(label + ' '));
      link.appendChild(createJourneyIcon('up-right', 16));
      link.appendChild(createTextElement('span', 'sr-only', '(opens in a new tab)'));
      return link;
    }

    function buildChapterPanel(chapter, trigger) {
      var panel = document.createElement('div');
      panel.id = 'journey-panel';
      panel.className = 'flex-1 text-sm outline-none journey-chapter';
      panel.setAttribute('data-orientation', 'horizontal');
      panel.setAttribute('data-activation-direction', 'none');
      panel.setAttribute('data-index', '-1');
      panel.setAttribute('data-slot', 'tabs-content');
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('tabindex', '0');
      panel.setAttribute('aria-labelledby', trigger.id);
      panel.appendChild(createTextElement('p', 'eyebrow', chapter.eyebrow));
      panel.appendChild(createTextElement('h2', '', chapter.title));
      panel.appendChild(createTextElement('p', 'journey-lead', chapter.introduction));
      chapter.paragraphs.forEach(function (paragraph) {
        panel.appendChild(createTextElement('p', 'journey-paragraph', paragraph));
      });
      if (chapter.id === 'kitchen') {
        panel.appendChild(createProductLink('https://gobblr.co.uk/', 'Explore gobblr'));
      }
      if (chapter.id === 'workbench') {
        panel.appendChild(createProductLink('https://glassmark.ai/', 'Explore glassmark'));
        var signals = document.createElement('aside');
        signals.className = 'journey-signals';
        signals.setAttribute('aria-labelledby', 'journey-signals-title');
        var signalsTitle = createTextElement('h3', '', 'The Signals Between Us');
        signalsTitle.id = 'journey-signals-title';
        signals.appendChild(signalsTitle);
        signals.appendChild(createTextElement('p', '', 'I’m fascinated by how people talk to each other and to agents, how agents respond to us, and how they talk among themselves. What happens to meaning as the language and the medium evolve? That’s where much of my writing is heading.'));
        panel.appendChild(signals);
      }
      panel.appendChild(createTextElement('p', 'journey-note', chapter.note));
      return panel;
    }

    function cameraOffset(coordinate, scale) {
      var limit = (scale - 1) * 50;
      return Math.max(-limit, Math.min(limit, (50 - coordinate) * scale));
    }

    function updateCamera() {
      var chapter = chapters[currentChapter];
      var scale = zoomed ? 1.55 : 1;
      var x = zoomed ? cameraOffset(chapter.x, scale) : 0;
      var y = zoomed ? cameraOffset(chapter.y, scale) : 0;
      camera.style.transform = 'translate(' + x + '%, ' + y + '%) scale(' + scale + ')';
      hotspots.forEach(function (hotspot) {
        hotspot.style.scale = String(1 / scale);
      });
      overview.setAttribute('aria-label', zoomed ? 'Show the whole restaurant' : 'Look closer at this part of the restaurant');
      overview.lastChild.nodeValue = zoomed ? 'Whole room' : 'Look closer';
    }

    function createNextControl() {
      var control;
      if (currentChapter < chapters.length - 1) {
        control = document.createElement('button');
        control.type = 'button';
        control.appendChild(document.createTextNode(chapters[currentChapter + 1].label));
        control.appendChild(createJourneyIcon('right'));
        control.addEventListener('click', function () { selectChapter(currentChapter + 1, true); });
      } else {
        control = document.createElement('a');
        control.href = 'mailto:wendy@fourteenseed.com';
        control.appendChild(document.createTextNode('Let’s talk '));
        control.appendChild(createJourneyIcon('up-right'));
      }
      control.className = nextClassName;
      return control;
    }

    function updateJourney() {
      var chapter = chapters[currentChapter];
      tabTriggers.forEach(function (trigger, index) {
        var selected = index === currentChapter;
        trigger.setAttribute('aria-selected', String(selected));
        trigger.tabIndex = selected ? 0 : -1;
        if (selected) {
          trigger.setAttribute('data-active', '');
          trigger.setAttribute('data-composite-item-active', '');
        } else {
          trigger.removeAttribute('data-active');
          trigger.removeAttribute('data-composite-item-active');
        }
      });
      hotspots.forEach(function (hotspot, index) {
        hotspot.setAttribute('aria-pressed', String(index === currentChapter));
      });
      story.setAttribute('aria-label', chapter.label + ': Wendy’s story');
      var oldPanel = story.querySelector('.journey-chapter');
      oldPanel.replaceWith(buildChapterPanel(chapter, tabTriggers[currentChapter]));
      previous.disabled = currentChapter === 0;
      if (previous.disabled) previous.setAttribute('data-disabled', '');
      else previous.removeAttribute('data-disabled');
      progress.textContent = chapter.number + ' / 04';
      var oldNext = story.querySelector('.journey-next');
      oldNext.replaceWith(createNextControl());
      updateCamera();
    }

    function selectChapter(index, focusStory) {
      if (index < 0 || index >= chapters.length) return;
      currentChapter = index;
      zoomed = index !== 0;
      updateJourney();
      if (focusStory) {
        window.requestAnimationFrame(function () { story.focus({ preventScroll: true }); });
      }
    }

    tabTriggers.forEach(function (trigger, index) {
      trigger.tabIndex = index === 0 ? 0 : -1;
      trigger.setAttribute('aria-controls', 'journey-panel');
      trigger.addEventListener('click', function () { selectChapter(index, false); });
      trigger.addEventListener('keydown', function (event) {
        var nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % chapters.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + chapters.length) % chapters.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = chapters.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        selectChapter(nextIndex, false);
        tabTriggers[nextIndex].focus();
      });
    });
    hotspots.forEach(function (hotspot, index) {
      hotspot.addEventListener('click', function () { selectChapter(index, true); });
    });
    previous.addEventListener('click', function () { selectChapter(currentChapter - 1, true); });
    initialNext.addEventListener('click', function () { selectChapter(currentChapter + 1, true); });
    overview.addEventListener('click', function () {
      zoomed = !zoomed;
      updateCamera();
    });
    var initialPanel = story.querySelector('.journey-chapter');
    initialPanel.id = 'journey-panel';
    initialPanel.setAttribute('aria-labelledby', tabTriggers[0].id);
  }
})();
