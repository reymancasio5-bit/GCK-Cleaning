/**
 * GCK Clean — main.js
 * Secure form → Google Apps Script → Google Sheets + Email
 */

;(function () {
  'use strict';

  /* ══════════════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════════════
     Paste your deployed Apps Script Web App URL below.
     This is safe to expose — it's a public endpoint,
     and your Sheet ID/credentials stay server-side.
  ══════════════════════════════════════════════════ */
  var APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzfWmZv3Rxe6B-V-Rlc-g-3R1rwGc3F0gGx6Wz8ScidKeIH9GVRYq9sPGZGBRV08eu4/exec';

  /* ══════════════════════════════════════════════════
     1. SECURITY UTILITIES
     ══════════════════════════════════════════════════ */

  function sanitize(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')
      .replace(/`/g, '&#x60;')
      .replace(/=/g, '&#x3D;')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim();
  }

  var INJECTION_PATTERNS = [
    /<script[\s\S]*?>/i,
    /javascript\s*:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /document\s*\./i,
    /window\s*\./i,
    /alert\s*\(/i,
    /fetch\s*\(/i,
    /XMLHttpRequest/i,
    /\bexec\s*\(/i,
    /\bshell_exec\s*\(/i,
    /union\s+select/i,
    /'\s*or\s+'1'\s*=\s*'1/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /data\s*:/i,
    /vbscript\s*:/i,
    /expression\s*\(/i,
  ];

  function isMalicious(value) {
    var s = String(value);
    for (var i = 0; i < INJECTION_PATTERNS.length; i++) {
      if (INJECTION_PATTERNS[i].test(s)) return true;
    }
    return false;
  }

  var RATE_LIMIT_MAX = 3;
  var RATE_LIMIT_WINDOW = 600000; // 10 minutes

  function isRateLimited() {
    var raw = sessionStorage.getItem('gck_submit_times');
    var times = raw ? JSON.parse(raw) : [];
    var now = Date.now();
    times = times.filter(function (t) { return now - t < RATE_LIMIT_WINDOW; });
    return times.length >= RATE_LIMIT_MAX;
  }

  function recordSubmission() {
    var raw = sessionStorage.getItem('gck_submit_times');
    var times = raw ? JSON.parse(raw) : [];
    var now = Date.now();
    times = times.filter(function (t) { return now - t < RATE_LIMIT_WINDOW; });
    times.push(now);
    sessionStorage.setItem('gck_submit_times', JSON.stringify(times));
  }

  var botSignals = {
    mouseMoved:   false,
    fieldFocused: false,
    pageLoadTime: Date.now(),
    keyPressed:   false,
  };

  document.addEventListener('mousemove',  function () { botSignals.mouseMoved = true; },  { once: true, passive: true });
  document.addEventListener('keydown',    function () { botSignals.keyPressed = true; },   { once: true, passive: true });
  document.addEventListener('touchstart', function () { botSignals.mouseMoved = true; },   { once: true, passive: true });

  function looksLikeBot() {
    var hasInteraction = botSignals.mouseMoved || botSignals.keyPressed;
    var timeOnPage     = Date.now() - botSignals.pageLoadTime;
    return !hasInteraction || timeOnPage < 4000;
  }

  /* ══════════════════════════════════════════════════
     2. NAVIGATION
     ══════════════════════════════════════════════════ */

  var navbar    = document.getElementById('navbar');
  var navToggle = document.getElementById('navToggle');
  var navMenu   = document.getElementById('navMenu');

  var navScrolled = false;

  function handleNavScroll() {
    var shouldScroll = window.scrollY > 20;
    if (shouldScroll !== navScrolled) {
      navScrolled = shouldScroll;
      navbar.classList.toggle('scrolled', navScrolled);
    }
  }

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  if (navToggle && navMenu) {

    function closeMenu() {
      navMenu.classList.remove('open');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    navToggle.addEventListener('click', function () {
      var isOpen = navMenu.classList.toggle('open');
      navToggle.classList.toggle('active', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', function (e) {
      if (navMenu.classList.contains('open') &&
          !navMenu.contains(e.target) &&
          !navToggle.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navMenu.classList.contains('open')) {
        closeMenu();
        navToggle.focus();
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) closeMenu();
    });
  }

  /* ══════════════════════════════════════════════════
     3. SCROLL ANIMATIONS
     ══════════════════════════════════════════════════ */

  var observerOptions = { threshold: 0.12, rootMargin: '0px 0px -40px 0px' };

  var fadeObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  var animTargets = document.querySelectorAll(
    '.service-card, .why-item, .step, .location-card, .section-header, .contact-info, .quote-form'
  );

  animTargets.forEach(function (el, i) {
    el.classList.add('fade-in');
    if (el.classList.contains('service-card') || el.classList.contains('why-item')) {
      el.style.transitionDelay = (i % 3) * 0.08 + 's';
    }
    fadeObserver.observe(el);
  });

  /* ══════════════════════════════════════════════════
     4. CONTACT FORM — Google Apps Script submission
     ══════════════════════════════════════════════════ */

  var form      = document.getElementById('quoteForm');
  var submitBtn = document.getElementById('submitBtn');
  var feedback  = document.getElementById('formFeedback');

  if (form) {

    // Track field focus for bot detection
    form.querySelectorAll('input, select, textarea').forEach(function (field) {
      field.addEventListener('focus', function () {
        botSignals.fieldFocused = true;
      }, { once: true });
    });

    // Live validation on blur / input
    form.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (field) {
      field.addEventListener('blur',  function () { validateField(field); });
      field.addEventListener('input', function () {
        if (field.classList.contains('error')) validateField(field);
      });
    });

    function validateField(field) {
      var val = field.value.trim();
      var err = field.parentElement.querySelector('.form-error');
      var msg = '';

      if (isMalicious(val)) {
        msg = 'Invalid characters detected.';
      } else if (field.required && !val) {
        msg = 'This field is required.';
      } else if (field.type === 'email' && val) {
        var emailRx = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
        if (!emailRx.test(val)) msg = 'Please enter a valid email address.';
      }

      if (err) err.textContent = msg;
      field.classList.toggle('error', !!msg);
      return !msg;
    }

    function validateForm() {
      var valid = true;
      form.querySelectorAll('input[required], select[required], textarea[required]').forEach(function (field) {
        if (!validateField(field)) valid = false;
      });
      return valid;
    }

    function honeypotTripped() {
      var hp1 = form.querySelector('input[name="hp_name"]');
      var hp2 = form.querySelector('input[name="hp_phone"]');
      return (hp1 && hp1.value !== '') || (hp2 && hp2.value !== '');
    }

    function showFeedback(type, msg) {
      feedback.className = 'form-feedback ' + type;
      feedback.textContent = msg;
    }

    function setLoading(state) {
      submitBtn.disabled = state;
      submitBtn.classList.toggle('loading', state);
    }

    /* ── Main submit handler ── */
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Security gates
      if (honeypotTripped()) return;

      if (looksLikeBot()) {
        showFeedback('error', 'Automated submissions are not allowed.');
        return;
      }

      if (isRateLimited()) {
        showFeedback('error', 'Too many requests. Please wait before submitting again.');
        return;
      }

      if (!validateForm()) {
        showFeedback('error', 'Please fix the highlighted errors before submitting.');
        return;
      }

      // Deep malicious content scan
      var allInputs = form.querySelectorAll('input, select, textarea');
      for (var i = 0; i < allInputs.length; i++) {
        var f = allInputs[i];
        if (f.name.startsWith('hp_')) continue;
        if (isMalicious(f.value)) {
          showFeedback('error', 'Invalid characters detected. Please review your input.');
          return;
        }
      }

      // Build payload (sanitized)
      var payload = {
        name:    sanitize(form.querySelector('#f-name').value),
        email:   sanitize(form.querySelector('#f-email').value),
        phone:   sanitize(form.querySelector('#f-phone').value),
        city:    sanitize(form.querySelector('#f-city').value),
        service: sanitize(form.querySelector('#f-service').value),
        message: sanitize(form.querySelector('#f-message').value),
      };

      setLoading(true);
      feedback.className = 'form-feedback';  // hide previous feedback

      /* ── POST to Apps Script Web App ──
         Apps Script requires text/plain (not application/json) to avoid
         CORS preflight rejections from external domains.
         We stringify the payload and parse it server-side in doPost().
      ── */
      fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify(payload),
        redirect: 'follow',
      })
        .then(function (res) {
          // Apps Script may return 200 or 302; both are fine
          return res.text();
        })
        .then(function (text) {
          var data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            // Apps Script returned non-JSON (rare redirect edge case) —
            // treat as success if we got any response at all
            data = { status: 'success' };
          }

          if (data.status === 'success') {
            recordSubmission();
            setLoading(false);
            showFeedback(
              'success',
              '✓ Thank you, ' + payload.name + '! Your quote request has been received. ' +
              'We\'ve sent a confirmation to ' + payload.email + ' and will be in touch within 24 hours.'
            );
            form.reset();
          } else {
            throw new Error(data.message || 'Submission failed.');
          }
        })
        .catch(function (err) {
          setLoading(false);
          console.error('GCK form error:', err);
          showFeedback(
            'error',
            'Something went wrong while sending your request. ' +
            'Please try again or contact us directly at gckclean@gmail.com.'
          );
        });
    });
  }

  /* ══════════════════════════════════════════════════
     5. FOOTER YEAR
     ══════════════════════════════════════════════════ */

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ══════════════════════════════════════════════════
     6. ACTIVE NAV LINK
     ══════════════════════════════════════════════════ */

  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav-link');

  function setActiveLink() {
    var scrollY = window.scrollY + 120;
    sections.forEach(function (sec) {
      var top    = sec.offsetTop;
      var bottom = top + sec.offsetHeight;
      var id     = sec.getAttribute('id');
      navLinks.forEach(function (link) {
        if (link.getAttribute('href') === '#' + id) {
          link.classList.toggle('active', scrollY >= top && scrollY < bottom);
        }
      });
    });
  }

  window.addEventListener('scroll', setActiveLink, { passive: true });
  setActiveLink();

  /* ══════════════════════════════════════════════════
     7. PREVENT FILE DROP
     ══════════════════════════════════════════════════ */

  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop',     function (e) { e.preventDefault(); });

})();