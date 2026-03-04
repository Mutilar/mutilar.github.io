// ═══════════════════════════════════════════════════════════════
//  RADIO PLAYER — Ambient music with Web Audio API equalizer
//
//  Self-injecting: builds DOM from SETTINGS.json → media.playlist.
//  No playlist → adds radio-hidden class and returns.
//  Uses THEME.JS API to inject its own theme toggle clone.
// ═══════════════════════════════════════════════════════════════
(() => {
  // ── Resolve settings ──────────────────────────────────────
  var _s = window.__SETTINGS || {};
  var _playlist = (_s.media && _s.media.playlist) || [];
  if (!_playlist.length) {
    document.body.classList.add("radio-hidden");
    return;
  }

  // ── Self-inject radio player DOM ──────────────────────────
  var player = document.getElementById("radioPlayer");
  if (!player) {
    player = document.createElement("div");
    player.className = "radio-player";
    player.id = "radioPlayer";

    var _id = _s.identity || {};
    var eqBarsHtml = '';
    for (var _i = 0; _i < 16; _i++) eqBarsHtml += '<div class="radio-eq-bar" style="height:2px"></div>';

    player.innerHTML =
      '<div class="radio-brand-slot">' +
        '<a href="#home" class="radio-brand" id="radioBrand">' +
          '<span class="brand-icon">' + (_id.emoji || '') + '</span> ' +
          '<strong>' + (_id.name || '') + '</strong>' +
        '</a>' +
        '<span id="radioThemeSlot"></span>' +
      '</div>' +
      '<div class="radio-group">' +
        '<div class="radio-eq" id="radioEq">' + eqBarsHtml + '</div>' +
        '<div class="radio-song"><span class="radio-song-title" id="radioTitle">Radio</span></div>' +
        '<div class="radio-controls">' +
          '<button class="radio-btn" id="radioPrev" title="Previous" aria-label="Previous track"><i class="fa fa-step-backward"></i></button>' +
          '<button class="radio-btn radio-btn-play" id="radioPlayPause" title="Play" aria-label="Play" aria-pressed="false"><i class="fa fa-play" id="radioPlayIcon"></i></button>' +
          '<button class="radio-btn" id="radioNext" title="Next" aria-label="Next track"><i class="fa fa-step-forward"></i></button>' +
        '</div>' +
        '<div class="radio-volume">' +
          '<button class="radio-vol-btn" id="radioMute" title="Mute" aria-label="Toggle mute"><i class="fa fa-volume-up" id="radioVolIcon"></i></button>' +
          '<input type="range" class="radio-vol-slider" id="radioVolume" min="0" max="100" value="30" aria-label="Volume">' +
        '</div>' +
      '</div>';

    // Insert after nav, before page-content (for position:fixed on mobile)
    var _nav = document.getElementById("mainNav");
    if (_nav) {
      _nav.insertAdjacentElement("afterend", player);
    } else {
      document.body.prepend(player);
    }

    // Inject theme toggle via THEME.JS public API
    var slot = document.getElementById("radioThemeSlot");
    if (slot && window._createThemeToggle && window._registerThemeToggle) {
      var _themeBtn = window._createThemeToggle("themeToggleRadio", "theme-toggle-radio");
      slot.parentNode.replaceChild(_themeBtn, slot);
      window._registerThemeToggle(_themeBtn);
    }
  }

  const playlist = _playlist;

  let currentTrack = 0;
  let isPlaying = false;
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let gainNode = null;
  let animFrameId = null;

  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.volume = 0.3;
  audio.preload = "auto";

  const titleEl   = document.getElementById("radioTitle");
  const playBtn   = document.getElementById("radioPlayPause");
  const playIcon  = document.getElementById("radioPlayIcon");
  const prevBtn   = document.getElementById("radioPrev");
  const nextBtn   = document.getElementById("radioNext");
  const volSlider = document.getElementById("radioVolume");
  const muteBtn   = document.getElementById("radioMute");
  const volIcon   = document.getElementById("radioVolIcon");
  const eqBars    = document.querySelectorAll(".radio-eq-bar");

  let savedVolume = 0.3;

  function loadTrack(index) {
    currentTrack = ((index % playlist.length) + playlist.length) % playlist.length;
    const track = playlist[currentTrack];
    audio.src = track.src;
    titleEl.textContent = track.title;
    titleEl.title = track.title;
  }

  function initAudioContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 32;
    analyser.smoothingTimeConstant = 0.7;
    gainNode = audioCtx.createGain();
    sourceNode.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }

  function play() {
    initAudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    audio.play().then(() => {
      isPlaying = true;
      player.classList.add("playing");
      playIcon.className = "fa fa-pause";
      playBtn.title = "Pause";
      playBtn.setAttribute("aria-label", "Pause");
      playBtn.setAttribute("aria-pressed", "true");
      startEq();
    }).catch(() => {});
  }

  function pause() {
    audio.pause();
    isPlaying = false;
    player.classList.remove("playing");
    playIcon.className = "fa fa-play";
    playBtn.title = "Play";
    playBtn.setAttribute("aria-label", "Play");
    playBtn.setAttribute("aria-pressed", "false");
    stopEq();
  }

  function togglePlay() {
    if (isPlaying) pause();
    else play();
  }

  function nextTrackFn() {
    loadTrack(currentTrack + 1);
    if (isPlaying) play();
  }

  function prevTrackFn() {
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
    } else {
      loadTrack(currentTrack - 1);
    }
    if (isPlaying) play();
  }

  // Equalizer visualization — accent colors from settings
  let freqData = null;

  var _rawAccents = (_s.accents || []).slice(0, 4);
  const eqGradient = _rawAccents.length >= 4
    ? _rawAccents.map(function(a) { return a.split(',').map(function(n) { return parseInt(n.trim(), 10); }); })
    : [[242, 80, 34], [255, 185, 0], [127, 186, 0], [0, 164, 239]];

  function isLightMode() {
    return document.documentElement.classList.contains("light-mode");
  }
  function invertEqColor(c) {
    return [255 - c[0], 255 - c[1], 255 - c[2]];
  }

  function eqBarColor(t) {
    const seg = t * (eqGradient.length - 1);
    const i = Math.min(Math.floor(seg), eqGradient.length - 2);
    const f = seg - i;
    const a = eqGradient[i], b = eqGradient[i + 1];
    return [
      Math.round(a[0] + (b[0] - a[0]) * f),
      Math.round(a[1] + (b[1] - a[1]) * f),
      Math.round(a[2] + (b[2] - a[2]) * f)
    ];
  }

  function computeBarColors() {
    const colors = [];
    eqBars.forEach((bar, i) => {
      const c = eqBarColor(i / (eqBars.length - 1));
      colors.push(isLightMode() ? invertEqColor(c) : c);
    });
    return colors;
  }

  let barColors = computeBarColors();
  window.addEventListener("theme-changed", () => {
    barColors = computeBarColors();
    updateSliderGradient(audio.volume);
  });

  function updateEq() {
    if (!analyser) return;
    if (!freqData) freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const binCount = freqData.length;
    eqBars.forEach((bar, i) => {
      const idx = Math.floor((i / eqBars.length) * binCount);
      const val = freqData[idx] || 0;
      const height = Math.max(2, (val / 255) * 16);
      bar.style.height = height + "px";
      if (isPlaying) {
        const c = barColors[i];
        bar.style.background = `rgba(${c[0]},${c[1]},${c[2]},0.85)`;
      } else {
        bar.style.background = "";
      }
    });
    animFrameId = requestAnimationFrame(updateEq);
  }

  function startEq() {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    updateEq();
  }

  function stopEq() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    eqBars.forEach(bar => { bar.style.height = "2px"; bar.style.background = ""; });
  }

  function updateVolume(val) {
    audio.volume = val;
    if (gainNode) gainNode.gain.value = 1;
    if (val === 0) {
      volIcon.className = "fa fa-volume-off vol-muted";
    } else if (val <= 0.33) {
      volIcon.className = "fa fa-volume-off";
    } else if (val <= 0.66) {
      volIcon.className = "fa fa-volume-down";
    } else {
      volIcon.className = "fa fa-volume-up";
    }
    updateSliderGradient(val);
  }

  function updateSliderGradient(val) {
    const pct = (val * 100);
    const track = isLightMode() ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)";
    if (pct <= 0) {
      volSlider.style.background = track;
      return;
    }
    // Build gradient with stops at full-width positions, hard-cut to track at fill point
    const stops = [];
    eqGradient.forEach((c, i) => {
      const pos = (i / (eqGradient.length - 1)) * 100;
      if (pos <= pct) {
        const col = isLightMode() ? invertEqColor(c) : c;
        stops.push(`rgb(${col[0]},${col[1]},${col[2]}) ${pos}%`);
      }
    });
    // Interpolate the color at the exact fill point and hard-cut to track
    const fillColor = eqBarColor(val);
    const col = isLightMode() ? invertEqColor(fillColor) : fillColor;
    stops.push(`rgb(${col[0]},${col[1]},${col[2]}) ${pct}%`);
    stops.push(`${track} ${pct}%`);
    volSlider.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
  }

  function toggleMute() {
    if (audio.volume > 0) {
      savedVolume = audio.volume;
      volSlider.value = 0;
      updateVolume(0);
    } else {
      volSlider.value = savedVolume * 100;
      updateVolume(savedVolume);
    }
  }

  // Event listeners
  playBtn.addEventListener("click", togglePlay);
  nextBtn.addEventListener("click", nextTrackFn);
  prevBtn.addEventListener("click", prevTrackFn);
  muteBtn.addEventListener("click", toggleMute);

  volSlider.addEventListener("input", (e) => {
    const val = parseInt(e.target.value) / 100;
    updateVolume(val);
    savedVolume = val > 0 ? val : savedVolume;
  });

  audio.addEventListener("ended", nextTrackFn);

  // Initialize first track
  loadTrack(0);
  updateSliderGradient(audio.volume);
})();
