// ═══════════════════════════════════════════════════════════════
//  RADIO PLAYER — Ambient music with Web Audio API equalizer
// ═══════════════════════════════════════════════════════════════
(() => {
  const playlist = [
    { src: "radio/freemusicforvideo-digital-corporate-technology-456291.mp3", title: "Corporate" },
    { src: "radio/freemusicforvideo-soft-background-music-401914.mp3", title: "Energetic" },
    { src: "radio/freemusicforvideo-happy-birthday-401919.mp3", title: "Care-free" },
    { src: "radio/freemusicforvideo-emotional-trap-beat-401962.mp3", title: "Emotional" }
  ];

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

  const player    = document.getElementById("radioPlayer");
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

  // Equalizer visualization
  let freqData = null;

  const eqGradient = [
    [242, 80, 34],   // MS Red
    [255, 185, 0],   // MS Yellow
    [127, 186, 0],   // MS Green
    [0, 164, 239]    // MS Blue
  ];

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
