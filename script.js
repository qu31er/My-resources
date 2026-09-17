const isTouch = window.matchMedia('(hover: none)').matches;

const blobs = document.querySelectorAll('.blob');
if (!isTouch) {
  document.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth  - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    blobs.forEach((blob, i) => {
      const depth = (i + 1) * 12;
      blob.style.transform = `translate(${x * depth}px, ${y * depth}px)`;
    });
  });
}

const API = '';

const audio    = document.getElementById('audio');
const player   = document.getElementById('player');
const vinyl    = document.getElementById('vinyl');
const btnPlay  = document.getElementById('btnPlay');
const btnPrev  = document.getElementById('btnPrev');
const btnNext  = document.getElementById('btnNext');
const btnRepeat= document.getElementById('btnRepeat');
const seek     = document.getElementById('seek');
const seekFill = document.getElementById('seekFill');
const seekKnob = document.getElementById('seekKnob');
const timeCur  = document.getElementById('timeCur');
const timeDur  = document.getElementById('timeDur');
const trackName= document.getElementById('trackName');
const trackSub = document.getElementById('trackSub');
const volInput = document.getElementById('vol');
const fileInput= document.getElementById('fileInput');

const btnPlaylist = document.getElementById('btnPlaylist');
const playlist    = document.getElementById('playlist');
const plList      = document.getElementById('plList');
const plEmpty     = document.getElementById('plEmpty');
const plCount     = document.getElementById('plCount');

let tracks = [];
let currentTrackId = null;
let repeatOne = localStorage.getItem('myTrack_repeat') === '1';

function fmt(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' КБ';
  return (bytes / 1024 / 1024).toFixed(1) + ' МБ';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

async function loadTracks() {
  try {
    const res = await fetch(API + '/api/tracks');
    tracks = await res.json();
    renderPlaylist();
  } catch (e) {
    console.warn('Не удалось загрузить треки', e);
    plEmpty.textContent = 'Сервер недоступен';
  }
}

function renderPlaylist() {
  plCount.textContent = tracks.length;
  plList.innerHTML = '';

  if (!tracks.length) {
    plEmpty.style.display = 'block';
    return;
  }
  plEmpty.style.display = 'none';

  tracks.forEach((t, i) => {
    const li = document.createElement('li');
    li.className = 'pl-item' + (t.id === currentTrackId ? ' active' : '');
    li.dataset.id = t.id;

    li.innerHTML = `
      <div class="pl-index">${i + 1}</div>
      <div class="pl-icon">
        ${t.id === currentTrackId
          ? `<div class="pl-eq"><span></span><span></span><span></span><span></span></div>`
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
               <path d="M9 18V6l10-2v12"/>
               <circle cx="6" cy="18" r="3"/>
               <circle cx="19" cy="16" r="3"/>
             </svg>`}
      </div>
      <div class="pl-title">${escapeHtml(t.title)}</div>
      <div class="pl-dur">${fmtSize(t.size)}</div>
      <button class="pl-del" data-del="${t.id}" title="Удалить">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12"/>
        </svg>
      </button>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.pl-del')) return;
      playTrack(t.id);
    });

    plList.appendChild(li);
  });

  plList.querySelectorAll('.pl-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.del, 10);
      if (!confirm('Удалить трек?')) return;
      try {
        await fetch(API + '/api/tracks/' + id, { method: 'DELETE' });
        if (currentTrackId === id) {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
          currentTrackId = null;
          trackName.textContent = 'Трек не выбран';
          trackSub.textContent = 'загрузи MP3 или выбери из плейлиста';
          seekFill.style.width = '0%';
          seekKnob.style.left = '0%';
          timeCur.textContent = '0:00';
          timeDur.textContent = '0:00';
          btnPlay.classList.remove('playing');
          player.classList.remove('playing');
          vinyl.classList.remove('spinning');
        }
        await loadTracks();
        toast('Трек удалён');
      } catch (err) {
        toast('Ошибка удаления');
      }
    });
  });
}

function playTrack(id) {
  const t = tracks.find(x => x.id === id);
  if (!t) return;

  audio.pause();
  audio.removeAttribute('src');
  audio.load();

  currentTrackId = id;
  audio.src = API + '/stream/' + id;

  trackName.textContent = t.title;
  trackSub.textContent = fmtSize(t.size) + ' • играет';

  audio.load();

  const p = audio.play();
  if (p && p.catch) {
    p.catch(() => {
      trackSub.textContent = fmtSize(t.size) + ' • нажми play';
    });
  }

  renderPlaylist();
}

btnPlaylist.addEventListener('click', () => {
  const open = playlist.classList.toggle('open');
  btnPlaylist.classList.toggle('open', open);
});

btnPlay.addEventListener('click', () => {
  if (!audio.src) {
    if (tracks.length) {
      playTrack(tracks[0].id);
    } else {
      toast('Выбери трек из плейлиста или загрузи новый');
      fileInput.click();
    }
    return;
  }
  if (audio.paused) audio.play();
  else audio.pause();
});

audio.addEventListener('play', () => {
  btnPlay.classList.add('playing');
  player.classList.add('playing');
  vinyl.classList.add('spinning');
  renderPlaylist();
});
audio.addEventListener('pause', () => {
  btnPlay.classList.remove('playing');
  player.classList.remove('playing');
  vinyl.classList.remove('spinning');
  renderPlaylist();
});

btnPrev.addEventListener('click', () => {
  if (!tracks.length) return;
  const idx = tracks.findIndex(t => t.id === currentTrackId);
  const prev = (idx > 0) ? tracks[idx - 1] : tracks[tracks.length - 1];
  playTrack(prev.id);
});

btnNext.addEventListener('click', () => {
  if (!tracks.length) return;
  const idx = tracks.findIndex(t => t.id === currentTrackId);
  const next = (idx >= 0 && idx < tracks.length - 1) ? tracks[idx + 1] : tracks[0];
  playTrack(next.id);
});

function updateRepeatBtn() {
  btnRepeat.classList.toggle('active', repeatOne);
}
updateRepeatBtn();

btnRepeat.addEventListener('click', () => {
  repeatOne = !repeatOne;
  localStorage.setItem('myTrack_repeat', repeatOne ? '1' : '0');
  updateRepeatBtn();
});

audio.addEventListener('loadedmetadata', () => {
  timeDur.textContent = fmt(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  const dur = audio.duration || 0;
  const pct = dur ? (audio.currentTime / dur) * 100 : 0;
  seekFill.style.width = pct + '%';
  seekKnob.style.left = pct + '%';
  timeCur.textContent = fmt(audio.currentTime);
});

audio.addEventListener('ended', () => {
  if (repeatOne) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
    return;
  }
  btnPlay.classList.remove('playing');
  player.classList.remove('playing');
  vinyl.classList.remove('spinning');
  const idx = tracks.findIndex(t => t.id === currentTrackId);
  if (idx >= 0 && idx < tracks.length - 1) {
    playTrack(tracks[idx + 1].id);
  } else if (tracks.length) {
    playTrack(tracks[0].id);
  } else {
    renderPlaylist();
  }
});

let dragging = false;
function seekFromEvent(e) {
  const rect = seek.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  let pct = (clientX - rect.left) / rect.width;
  pct = Math.min(1, Math.max(0, pct));
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
    seekFill.style.width = (pct * 100) + '%';
    seekKnob.style.left = (pct * 100) + '%';
  }
}
seek.addEventListener('pointerdown', (e) => {
  if (!audio.src) return;
  dragging = true;
  seek.classList.add('dragging');
  seek.setPointerCapture(e.pointerId);
  seekFromEvent(e);
});
seek.addEventListener('pointermove', (e) => { if (dragging) seekFromEvent(e); });
seek.addEventListener('pointerup', () => {
  dragging = false;
  seek.classList.remove('dragging');
});
seek.addEventListener('pointercancel', () => {
  dragging = false;
  seek.classList.remove('dragging');
});

volInput.addEventListener('input', () => {
  audio.volume = parseFloat(volInput.value);
  localStorage.setItem('myTrack_vol', volInput.value);
});
const savedVol = localStorage.getItem('myTrack_vol');
if (savedVol !== null) {
  volInput.value = savedVol;
  audio.volume = parseFloat(savedVol);
}

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  trackSub.textContent = 'Загружаю: ' + file.name;

  const fd = new FormData();
  fd.append('file', file);

  const xhr = new XMLHttpRequest();
  xhr.open('POST', API + '/api/upload', true);

  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) {
      const pct = Math.round((ev.loaded / ev.total) * 100);
      trackSub.textContent = `Загружаю ${file.name} — ${pct}%`;
    }
  };

  xhr.onload = async () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (err) {}
      await loadTracks();
      if (data && data.id) {
        playTrack(data.id);
        playlist.classList.add('open');
        btnPlaylist.classList.add('open');
      }
      toast('Трек загружен');
    } else {
      trackSub.textContent = 'Ошибка загрузки (код ' + xhr.status + ')';
      toast('Не удалось загрузить файл');
    }
    fileInput.value = '';
  };

  xhr.onerror = () => {
    trackSub.textContent = 'Ошибка сети при загрузке';
    toast('Нет соединения с сервером');
    fileInput.value = '';
  };

  xhr.send(fd);
});

loadTracks();

/* ============================================
   НАСТРОЙКИ ИНТЕРФЕЙСА
   ============================================ */
const btnSettings    = document.getElementById('btnSettings');
const settingsModal  = document.getElementById('settingsModal');
const rngR           = document.getElementById('rngR');
const rngG           = document.getElementById('rngG');
const rngB           = document.getElementById('rngB');
const rngBright      = document.getElementById('rngBright');
const valR           = document.getElementById('valR');
const valG           = document.getElementById('valG');
const valB           = document.getElementById('valB');
const valBright      = document.getElementById('valBright');
const hexInput       = document.getElementById('hexInput');
const btnSettingsReset = document.getElementById('btnSettingsReset');

const DEFAULTS = { r: 160, g: 68, b: 255, bright: 100 };

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : null;
}

function applyAccent(r, g, b, bright) {
  document.documentElement.style.setProperty('--r', r);
  document.documentElement.style.setProperty('--g', g);
  document.documentElement.style.setProperty('--b', b);
  document.documentElement.style.setProperty('--brightness', (bright / 100).toFixed(2));

  rngR.value = r; rngG.value = g; rngB.value = b; rngBright.value = bright;
  valR.textContent = r;
  valG.textContent = g;
  valB.textContent = b;
  valBright.textContent = bright + '%';
  hexInput.value = rgbToHex(r, g, b);

  localStorage.setItem('ui_r', r);
  localStorage.setItem('ui_g', g);
  localStorage.setItem('ui_b', b);
  localStorage.setItem('ui_bright', bright);
}

(function restoreAccent() {
  const r = parseInt(localStorage.getItem('ui_r') ?? DEFAULTS.r, 10);
  const g = parseInt(localStorage.getItem('ui_g') ?? DEFAULTS.g, 10);
  const b = parseInt(localStorage.getItem('ui_b') ?? DEFAULTS.b, 10);
  const bright = parseInt(localStorage.getItem('ui_bright') ?? DEFAULTS.bright, 10);
  applyAccent(r, g, b, bright);
})();

function onRgbChange() {
  applyAccent(
    parseInt(rngR.value, 10),
    parseInt(rngG.value, 10),
    parseInt(rngB.value, 10),
    parseInt(rngBright.value, 10)
  );
}
rngR.addEventListener('input', onRgbChange);
rngG.addEventListener('input', onRgbChange);
rngB.addEventListener('input', onRgbChange);
rngBright.addEventListener('input', onRgbChange);

hexInput.addEventListener('change', () => {
  const c = hexToRgb(hexInput.value);
  if (!c) { hexInput.value = rgbToHex(+rngR.value, +rngG.value, +rngB.value); return; }
  applyAccent(c.r, c.g, c.b, parseInt(rngBright.value, 10));
});

document.querySelectorAll('.preset').forEach(p => {
  p.addEventListener('click', () => {
    applyAccent(
      parseInt(p.dataset.r, 10),
      parseInt(p.dataset.g, 10),
      parseInt(p.dataset.b, 10),
      parseInt(rngBright.value, 10)
    );
  });
});

btnSettingsReset.addEventListener('click', () => {
  applyAccent(DEFAULTS.r, DEFAULTS.g, DEFAULTS.b, DEFAULTS.bright);
});

btnSettings.addEventListener('click', () => {
  settingsModal.classList.add('open');
});
settingsModal.querySelectorAll('[data-close-settings]').forEach(el => {
  el.addEventListener('click', () => settingsModal.classList.remove('open'));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') settingsModal.classList.remove('open');
});

/* ============================================
   КОНТЕКСТНОЕ МЕНЮ
   ============================================ */
const ctxMenu = document.getElementById('ctxMenu');
const ctxBackdrop = document.getElementById('ctxBackdrop');
let activeBubble = null;

document.querySelectorAll('.bubble').forEach(bubble => {
  bubble.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu(bubble, e.clientX, e.clientY);
  });

  let tapTimer = null, startX = 0, startY = 0;
  bubble.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tapTimer = setTimeout(() => {
      openMenu(bubble, touch.clientX, touch.clientY);
      if (navigator.vibrate) navigator.vibrate(15);
    }, 450);
  }, { passive: true });

  const cancel = () => clearTimeout(tapTimer);
  bubble.addEventListener('touchend', cancel);
  bubble.addEventListener('touchcancel', cancel);
  bubble.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10) cancel();
  }, { passive: true });
});

function openMenu(bubble, x, y) {
  activeBubble = bubble;
  if (isTouch) {
    ctxBackdrop.classList.add('open');
    ctxMenu.classList.add('open');
    return;
  }
  ctxMenu.classList.add('open');
  const rect = ctxMenu.getBoundingClientRect();
  const pad = 10;
  const maxX = window.innerWidth  - rect.width  - pad;
  const maxY = window.innerHeight - rect.height - pad;
  ctxMenu.style.left = Math.min(x, maxX) + 'px';
  ctxMenu.style.top  = Math.min(y, maxY) + 'px';
}

function closeMenu() {
  ctxMenu.classList.remove('open');
  ctxBackdrop.classList.remove('open');
  activeBubble = null;
}

ctxMenu.querySelectorAll('.ctx-item').forEach(item => {
  item.addEventListener('click', () => {
    if (!activeBubble) return;
    const action = item.dataset.action;
    const href = activeBubble.getAttribute('href') || '#';

    switch (action) {
      case 'open':   if (href && href !== '#') window.location.href = href; break;
      case 'newtab': if (href && href !== '#') window.open(href, '_blank', 'noopener'); break;
      case 'copy':   copyText(href); break;
      case 'hide':   activeBubble.classList.add('hidden'); break;
    }
    closeMenu();
  });
});

document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target)) closeMenu();
});
ctxBackdrop.addEventListener('click', closeMenu);
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('.bubble')) e.preventDefault();
});
window.addEventListener('blur', closeMenu);
window.addEventListener('resize', closeMenu);
window.addEventListener('scroll', closeMenu, { passive: true });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      () => toast('Ссылка скопирована'),
      () => fallbackCopy(text)
    );
  } else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('Ссылка скопирована'); }
  catch { toast('Не удалось скопировать'); }
  ta.remove();
}

function toast(text) {
  const t = document.createElement('div');
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(28px + env(safe-area-inset-bottom))',
    transform: 'translateX(-50%) translateY(20px)',
    padding: '12px 22px',
    borderRadius: '16px',
    background: 'rgba(60,25,110,.78)',
    backdropFilter: 'blur(18px)',
    webkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(180,130,255,.35)',
    color: '#e9dcff',
    fontSize: '.9rem',
    fontWeight: 500,
    boxShadow: '0 12px 30px rgba(0,0,0,.5), 0 0 24px rgba(123,47,247,.35)',
    opacity: '0',
    transition: 'opacity .3s ease, transform .3s ease',
    zIndex: 1200,
    pointerEvents: 'none',
    maxWidth: 'calc(100vw - 40px)',
    textAlign: 'center'
  });
  document.body.appendChild(t);

  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });

  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => t.remove(), 300);
  }, 1800);
}