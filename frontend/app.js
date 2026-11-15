/**
 * OmniFetch Client Application Logic
 * Supports TikTok (Clean No-Watermark & Original), YouTube, Facebook, Dailymotion, Instagram
 */

(() => {
  'use strict';

  // State
  let currentMedia = null;
  let selectedOption = {
    type: 'clean_watermark',
    format_id: 'clean_hd',
    label: 'Clean HD (No Watermark)',
    ext: 'mp4',
    is_audio: false,
    direct_url: null
  };
  let activePollInterval = null;

  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const qualitySelect = document.getElementById('qualitySelect');
  const watermarkSelect = document.getElementById('watermarkSelect');
  const statusBanner = document.getElementById('statusBanner');
  const resultSection = document.getElementById('resultSection');

  // Media Overview Elements
  const mediaThumbnail = document.getElementById('mediaThumbnail');
  const embedPlayerContainer = document.getElementById('embedPlayerContainer');
  const thumbPlayBtn = document.getElementById('thumbPlayBtn');
  const mediaDuration = document.getElementById('mediaDuration');
  const platformBadge = document.getElementById('platformBadge');
  const creatorAvatar = document.getElementById('creatorAvatar');
  const creatorAvatarFallback = document.getElementById('creatorAvatarFallback');
  const creatorName = document.getElementById('creatorName');
  const creatorHandle = document.getElementById('creatorHandle');
  const creatorLink = document.getElementById('creatorLink');
  const mediaTitle = document.getElementById('mediaTitle');
  const mediaDescription = document.getElementById('mediaDescription');
  const toggleDescBtn = document.getElementById('toggleDescBtn');
  const copyDescBtn = document.getElementById('copyDescBtn');

  // Config Elements
  const watermarkControlGroup = document.getElementById('watermarkControlGroup');
  const qualityPillsContainer = document.getElementById('qualityPillsContainer');
  const audioPillsContainer = document.getElementById('audioPillsContainer');
  const subtitleControlGroup = document.getElementById('subtitleControlGroup');
  const subtitleSelect = document.getElementById('subtitleSelect');
  const downloadSubBtn = document.getElementById('downloadSubBtn');

  // Progress Elements
  const progressTracker = document.getElementById('progressTracker');
  const progressStatusText = document.getElementById('progressStatusText');
  const progressPctText = document.getElementById('progressPctText');
  const progressBarFill = document.getElementById('progressBarFill');
  const progressDownloaded = document.getElementById('progressDownloaded');
  const progressSpeed = document.getElementById('progressSpeed');
  const progressEta = document.getElementById('progressEta');
  const downloadReadyCard = document.getElementById('downloadReadyCard');
  const saveFileDirectLink = document.getElementById('saveFileDirectLink');
  const completeMessageText = document.getElementById('completeMessageText');
  const downloadButtonsContainer = document.getElementById('downloadButtonsContainer');

  // Theme & History
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const historyBtn = document.getElementById('historyBtn');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const historyModal = document.getElementById('historyModal');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyListContainer = document.getElementById('historyListContainer');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');

  // Purge any stale Service Workers and Caches immediately
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) reg.unregister();
    });
  }
  if ('caches' in window) {
    caches.keys().then((names) => {
      for (const name of names) caches.delete(name);
    });
  }

  // Theme Management
  const savedTheme = localStorage.getItem('omnifetch_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
  }

  themeToggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      document.body.classList.remove('theme-dark');
      document.body.classList.add('theme-light');
      localStorage.setItem('omnifetch_theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      document.body.classList.add('theme-dark');
      localStorage.setItem('omnifetch_theme', 'dark');
    }
  });

  // History Management
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem('omnifetch_history') || '[]');
    } catch {
      return [];
    }
  }

  function saveHistoryItem(item) {
    const history = getHistory();
    history.unshift(item);
    if (history.length > 30) history.pop();
    localStorage.setItem('omnifetch_history', JSON.stringify(history));
    updateHistoryBadge();
  }

  function updateHistoryBadge() {
    const count = getHistory().length;
    if (count > 0) {
      historyCountBadge.textContent = count;
      historyCountBadge.classList.remove('hidden');
    } else {
      historyCountBadge.classList.add('hidden');
    }
  }

  function renderHistory() {
    const history = getHistory();
    if (history.length === 0) {
      historyListContainer.innerHTML = '<p class="empty-text">No downloads yet. Videos you download will appear here.</p>';
      return;
    }
    historyListContainer.innerHTML = history.map((item) => `
      <div class="history-item">
        <img src="${item.thumbnail || './icons/favicon.png'}" alt="Thumb" class="history-thumb" />
        <div class="history-meta">
          <div class="history-title">${escapeHtml(item.title)}</div>
          <div class="history-sub">${item.platform.toUpperCase()} • ${item.label} • ${new Date(item.date).toLocaleDateString()}</div>
        </div>
        ${item.downloadUrl ? `<a href="${item.downloadUrl}" class="save-file-link" download target="_blank" rel="noopener noreferrer">Save</a>` : ''}
      </div>
    `).join('');
  }

  historyBtn.addEventListener('click', () => {
    renderHistory();
    historyModal.classList.remove('hidden');
  });
  closeHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
  clearHistoryBtn.addEventListener('click', () => {
    localStorage.removeItem('omnifetch_history');
    renderHistory();
    updateHistoryBadge();
  });

  // Utility: Escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  // Utility: Detect Platform
  function detectPlatform(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('tiktok.com') || u.includes('douyin.com')) return 'tiktok';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('facebook.com') || u.includes('fb.watch') || u.includes('fb.com')) return 'facebook';
    if (u.includes('dailymotion.com') || u.includes('dai.ly')) return 'dailymotion';
    if (u.includes('instagram.com') || u.includes('instagr.am')) return 'instagram';
    return 'social';
  }

  function updatePlatformChips(detected) {
    document.querySelectorAll('.platform-chip').forEach((chip) => {
      if (chip.dataset.platform === detected) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  }

  urlInput.addEventListener('input', () => {
    const p = detectPlatform(urlInput.value);
    updatePlatformChips(p);
  });

  // Bulletproof Paste Action
  pasteBtn.addEventListener('click', async () => {
    let text = '';
    if (navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (err) {
        console.warn('Clipboard readText restricted by browser:', err);
      }
    }

    if (text && text.trim()) {
      urlInput.value = text.trim();
      updatePlatformChips(detectPlatform(urlInput.value));
      processDownload();
      return;
    }

    // Direct fallback: prompt user so they can paste with right-click or Ctrl+V
    const manualText = window.prompt('Paste your video link below:', urlInput.value || '');
    if (manualText && manualText.trim()) {
      urlInput.value = manualText.trim();
      updatePlatformChips(detectPlatform(urlInput.value));
      processDownload();
    } else {
      urlInput.focus();
      urlInput.select();
    }
  });

  // Also detect native paste events (right-click -> paste or Ctrl+V / Cmd+V)
  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      const val = urlInput.value.trim();
      if (val) {
        updatePlatformChips(detectPlatform(val));
      }
    }, 50);
  });

  // Sample Links
  document.querySelectorAll('.sample-link-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      urlInput.value = btn.dataset.url;
      updatePlatformChips(detectPlatform(btn.dataset.url));
      processDownload();
    });
  });

  function showStatus(msg, type = 'error') {
    statusBanner.className = `status-banner ${type}`;
    statusBanner.querySelector('.status-message').textContent = msg;
    statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    statusBanner.classList.add('hidden');
  }

  // Main Action: Download Video
  downloadBtn.addEventListener('click', processDownload);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') processDownload();
  });

  async function processDownload() {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus('Please paste a valid video URL first (e.g. TikTok, YouTube, Facebook, Dailymotion).');
      return;
    }

    hideStatus();
    downloadBtn.disabled = true;
    downloadBtn.querySelector('.btn-text').textContent = 'Connecting...';
    downloadBtn.querySelector('.btn-spinner').classList.remove('hidden');

    // Show Progress Tracker Immediately
    progressTracker.classList.remove('hidden');
    downloadReadyCard.classList.add('hidden');
    progressStatusText.textContent = 'Connecting to video source...';
    progressPctText.textContent = '15%';
    progressBarFill.style.width = '15%';
    progressDownloaded.textContent = 'Analyzing...';
    progressSpeed.textContent = 'High Speed';
    progressEta.textContent = 'Calculating...';

    const desiredQuality = qualitySelect.value;
    const desiredWm = watermarkSelect.value;

    try {
      let data = null;

      // 1. Try Local Backend if reachable
      try {
        const resp = await fetch('/api/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (resp.ok) {
          data = await resp.json();
          data.backend_available = true;
          data.original_url = url;
        }
      } catch (e) {
        console.log('Local backend not reachable, using direct client extractor');
      }

      // 2. Client-side extraction if no local backend (e.g. GitHub Pages)
      if (!data) {
        progressBarFill.style.width = '45%';
        progressPctText.textContent = '45%';
        progressStatusText.textContent = 'Extracting media streams & metadata...';
        data = await extractClientSide(url);
      }

      currentMedia = data;
      renderMediaData(data);

      progressBarFill.style.width = '80%';
      progressPctText.textContent = '80%';
      progressStatusText.textContent = 'Triggering direct download...';

      // Apply User's Pre-Selected Format
      applyUserPreferences(data, desiredQuality, desiredWm);

      // Trigger Download Immediately
      await executeDownload();

    } catch (err) {
      showStatus(err.message || 'Error processing video download');
      progressTracker.classList.add('hidden');
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.querySelector('.btn-text').textContent = 'Download Video';
      downloadBtn.querySelector('.btn-spinner').classList.add('hidden');
    }
  }

  // Client-side Extractor for GitHub Pages
  async function extractClientSide(url) {
    const platform = detectPlatform(url);

    // TikTok Direct Extraction via TikWM API (Open CORS)
    if (platform === 'tiktok') {
      const resp = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`);
      const res = await resp.json();
      if (res.code === 0 && res.data) {
        const d = res.data;
        const author = d.author || {};
        const authorName = author.unique_id || 'creator';
        const nickname = author.nickname || authorName;
        const cleanUrl = (d.play && !d.play.startsWith('http')) ? `https://www.tikwm.com${d.play}` : d.play;
        const wmUrl = (d.wmplay && !d.wmplay.startsWith('http')) ? `https://www.tikwm.com${d.wmplay}` : d.wmplay;
        const musicUrl = (d.music && !d.music.startsWith('http')) ? `https://www.tikwm.com${d.music}` : d.music;

        const qualities = [];
        if (cleanUrl) {
          qualities.push({
            format_id: 'clean_hd',
            label: 'Clean HD (No Watermark)',
            resolution: 'Original HD (Clean)',
            ext: 'mp4',
            is_clean: true,
            direct_url: cleanUrl,
            filesize_str: d.size ? `${(d.size / (1024 * 1024)).toFixed(1)} MB` : ''
          });
        }
        if (wmUrl) {
          qualities.push({
            format_id: 'watermarked',
            label: 'Original (With Watermark)',
            resolution: 'Original (Watermarked)',
            ext: 'mp4',
            is_watermarked: true,
            direct_url: wmUrl,
            filesize_str: d.wm_size ? `${(d.wm_size / (1024 * 1024)).toFixed(1)} MB` : ''
          });
        }

        const audioOptions = [];
        if (musicUrl) {
          audioOptions.push({
            format_id: 'tiktok_audio',
            label: `Audio: ${d.music_info?.title || 'Original Sound'}`,
            ext: 'mp3',
            is_audio: true,
            direct_url: musicUrl
          });
        }

        return {
          platform: 'tiktok',
          title: d.title || `TikTok by @${authorName}`,
          description: d.title || '',
          uploader: `@${authorName} (${nickname})`,
          uploader_name: authorName,
          uploader_nickname: nickname,
          uploader_url: `https://www.tiktok.com/@${authorName}`,
          uploader_avatar: author.avatar || '',
          thumbnail: d.cover || d.origin_cover || './icons/icon.svg',
          duration: d.duration || 0,
          duration_str: `${Math.floor((d.duration || 0) / 60)}:${((d.duration || 0) % 60).toString().padStart(2, '0')}`,
          has_watermark_options: true,
          qualities: qualities,
          audio_options: audioOptions,
          subtitles: [],
          original_url: url
        };
      }
      throw new Error(res.msg || 'Unable to parse TikTok video link');
    }

    // YouTube Extraction
    if (platform === 'youtube') {
      const vMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      const vid = vMatch ? vMatch[1] : '';

      let title = 'YouTube Video';
      let author = 'YouTube Creator';
      let authorUrl = url;
      let thumb = vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : './icons/icon.svg';

      try {
        const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (oembedResp.ok) {
          const oe = await oembedResp.json();
          title = oe.title || title;
          author = oe.author_name || author;
          authorUrl = oe.author_url || authorUrl;
        }
      } catch (e) {
        console.warn('oEmbed lookup skipped');
      }

      return {
        platform: 'youtube',
        vid: vid,
        title: title,
        description: `Video by ${author}. High-definition streams available.`,
        uploader: author,
        uploader_name: author,
        uploader_url: authorUrl,
        uploader_avatar: '',
        thumbnail: thumb,
        duration: 0,
        duration_str: 'Full Video',
        embed_url: vid ? `https://www.youtube.com/embed/${vid}?autoplay=1` : null,
        has_watermark_options: false,
        is_mirror_required: true,
        qualities: [
          { format_id: '1080p', label: '1080p (Full HD)', resolution: '1920x1080', ext: 'mp4', direct_url: null },
          { format_id: '720p', label: '720p (HD)', resolution: '1280x720', ext: 'mp4', direct_url: null },
          { format_id: '480p', label: '480p (SD)', resolution: '854x480', ext: 'mp4', direct_url: null },
          { format_id: '360p', label: '360p (Data Saver)', resolution: '640x360', ext: 'mp4', direct_url: null }
        ],
        audio_options: [
          { format_id: 'mp3', label: 'Audio MP3 (320kbps)', ext: 'mp3', is_audio: true, direct_url: null }
        ],
        subtitles: [],
        original_url: url
      };
    }

    // Dailymotion Extraction via Public API
    if (platform === 'dailymotion') {
      const dmMatch = url.match(/(?:video\/|dai\.ly\/)([a-zA-Z0-9]+)/);
      const dmId = dmMatch ? dmMatch[1] : '';
      let title = 'Dailymotion Video';
      let description = '';
      let uploader = 'Dailymotion Creator';
      let uploaderName = 'Creator';
      let uploaderAvatar = '';
      let uploaderUrl = url;
      let thumbnail = './icons/icon.svg';
      let duration = 0;
      let durationStr = 'Stream';

      if (dmId) {
        try {
          const apiResp = await fetch(`https://api.dailymotion.com/video/${dmId}?fields=id,title,description,duration,thumbnail_720_url,owner.screenname,owner.avatar_80_url,owner.url`);
          if (apiResp.ok) {
            const d = await apiResp.json();
            title = d.title || title;
            description = d.description || '';
            uploader = d['owner.screenname'] || uploader;
            uploaderName = d['owner.screenname'] || uploaderName;
            uploaderAvatar = d['owner.avatar_80_url'] || '';
            uploaderUrl = d['owner.url'] || uploaderUrl;
            thumbnail = d.thumbnail_720_url || thumbnail;
            duration = d.duration || 0;
            if (duration) {
              durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`;
            }
          }
        } catch (e) {
          console.warn('Dailymotion metadata lookup error:', e);
        }
      }

      return {
        platform: 'dailymotion',
        vid: dmId,
        title: title,
        description: description || `Uploaded by ${uploader} on Dailymotion.`,
        uploader: uploader,
        uploader_name: uploaderName,
        uploader_url: uploaderUrl,
        uploader_avatar: uploaderAvatar,
        thumbnail: thumbnail,
        duration: duration,
        duration_str: durationStr,
        embed_url: dmId ? `https://www.dailymotion.com/embed/video/${dmId}?autoplay=1` : null,
        has_watermark_options: false,
        qualities: [
          { format_id: '1080p', label: '1080p (Full HD)', resolution: '1920x1080', ext: 'mp4', direct_url: null },
          { format_id: '720p', label: '720p (HD)', resolution: '1280x720', ext: 'mp4', direct_url: null },
          { format_id: '480p', label: '480p (SD)', resolution: '854x480', ext: 'mp4', direct_url: null }
        ],
        audio_options: [
          { format_id: 'mp3', label: 'Audio Only (MP3)', ext: 'mp3', is_audio: true, direct_url: null }
        ],
        subtitles: [],
        original_url: url
      };
    }

    // Facebook / Instagram Generic Fallback
    return {
      platform: platform,
      title: `${platform.toUpperCase()} Video Stream`,
      description: `Target URL: ${url}`,
      uploader: `${platform} Creator`,
      uploader_name: 'Creator',
      uploader_url: url,
      uploader_avatar: '',
      thumbnail: './icons/icon.svg',
      duration: 0,
      duration_str: 'Stream',
      embed_url: null,
      has_watermark_options: false,
      qualities: [
        { format_id: 'best', label: 'Best Available (Max Quality)', resolution: 'Original HD', ext: 'mp4', direct_url: null },
        { format_id: '720p', label: '720p HD', resolution: '1280x720', ext: 'mp4', direct_url: null }
      ],
      audio_options: [
        { format_id: 'mp3', label: 'High Quality Audio (MP3)', ext: 'mp3', is_audio: true, direct_url: null }
      ],
      subtitles: [],
      original_url: url
    };
  }

  // Apply Preferences
  function applyUserPreferences(data, desiredQuality, desiredWm) {
    if (desiredQuality === 'mp3') {
      const audioOpt = (data.audio_options && data.audio_options[0]) || { format_id: 'mp3', label: 'Audio MP3', ext: 'mp3', is_audio: true };
      selectAudio(audioOpt);
      return;
    }

    if (data.has_watermark_options) {
      if (desiredWm === 'clean') {
        const cleanQ = data.qualities.find(q => q.is_clean) || data.qualities[0];
        selectQuality(cleanQ);
        return;
      } else {
        const wmQ = data.qualities.find(q => q.is_watermarked) || data.qualities[0];
        selectQuality(wmQ);
        return;
      }
    }

    if (desiredQuality === '720p') {
      const q720 = data.qualities.find(q => q.format_id.includes('720') || (q.label && q.label.includes('720')));
      if (q720) { selectQuality(q720); return; }
    }

    if (data.qualities && data.qualities.length > 0) {
      selectQuality(data.qualities[0]);
    }
  }

  // Render Metadata Card
  function renderMediaData(data) {
    mediaThumbnail.src = data.thumbnail || './icons/icon.svg';
    mediaDuration.textContent = data.duration_str || '0:00';
    platformBadge.textContent = (data.platform || 'video').toUpperCase();

    creatorName.textContent = data.uploader_name || data.uploader || 'Creator';
    creatorHandle.textContent = data.uploader_name ? `@${data.uploader_name}` : `@${data.platform}`;
    if (data.uploader_url) {
      creatorLink.href = data.uploader_url;
      creatorLink.classList.remove('hidden');
    } else {
      creatorLink.classList.add('hidden');
    }

    if (data.uploader_avatar) {
      creatorAvatar.src = data.uploader_avatar;
      creatorAvatar.classList.remove('hidden');
      creatorAvatarFallback.classList.add('hidden');
    } else {
      creatorAvatar.classList.add('hidden');
      creatorAvatarFallback.classList.remove('hidden');
    }

    mediaTitle.textContent = data.title || 'Untitled Video';
    const desc = data.description || 'No description available for this video.';
    mediaDescription.textContent = desc;
    mediaDescription.classList.remove('expanded');

    if (desc.length > 120) {
      toggleDescBtn.classList.remove('hidden');
      toggleDescBtn.textContent = 'Show more';
    } else {
      toggleDescBtn.classList.add('hidden');
    }

    // Watermark options
    if (data.has_watermark_options) {
      watermarkControlGroup.classList.remove('hidden');
      setupWatermarkControls(data);
    } else {
      watermarkControlGroup.classList.add('hidden');
    }

    // Quality Grid
    renderQualityPills(data);

    // Audio Grid
    renderAudioPills(data);

    // Subtitles
    if (data.subtitles && data.subtitles.length > 0) {
      subtitleControlGroup.classList.remove('hidden');
      subtitleSelect.innerHTML = data.subtitles.map(s => 
        `<option value="${escapeHtml(s.url)}" data-lang="${s.lang}">${escapeHtml(s.label)}</option>`
      ).join('');
    } else {
      subtitleControlGroup.classList.add('hidden');
    }

    // Embedded Video Player Preview
    if (embedPlayerContainer) {
      embedPlayerContainer.innerHTML = '';
      embedPlayerContainer.classList.add('hidden');
    }
    if (thumbPlayBtn) {
      if (data.embed_url) {
        thumbPlayBtn.classList.remove('hidden');
        thumbPlayBtn.onclick = () => startEmbedPlayer(data.embed_url);
      } else {
        thumbPlayBtn.classList.add('hidden');
      }
    }

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function startEmbedPlayer(url) {
    if (!embedPlayerContainer || !url) return;
    embedPlayerContainer.innerHTML = `<iframe src="${url}" class="preview-iframe" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    embedPlayerContainer.classList.remove('hidden');
    if (thumbPlayBtn) thumbPlayBtn.classList.add('hidden');
  }

  function setupWatermarkControls(data) {
    const radioCards = watermarkControlGroup.querySelectorAll('.radio-card');
    radioCards.forEach(card => {
      card.addEventListener('click', () => {
        radioCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        const choice = card.dataset.wm;
        const input = card.querySelector('input');
        if (input) input.checked = true;

        if (choice === 'clean') {
          const cleanQ = data.qualities.find(q => q.is_clean);
          if (cleanQ) { selectQuality(cleanQ); executeDownload(); }
        } else {
          const wmQ = data.qualities.find(q => q.is_watermarked) || data.qualities[0];
          if (wmQ) { selectQuality(wmQ); executeDownload(); }
        }
      });
    });
  }

  function renderQualityPills(data) {
    qualityPillsContainer.innerHTML = '';
    const qualities = data.qualities || [];

    qualities.forEach((q, idx) => {
      const card = document.createElement('div');
      card.className = `quality-card ${idx === 0 ? 'selected' : ''}`;
      card.dataset.formatId = q.format_id;

      card.innerHTML = `
        <div class="qc-header">
          <span class="qc-label">${escapeHtml(q.label)}</span>
          <span class="qc-ext">${q.ext || 'MP4'}</span>
        </div>
        <div class="qc-meta">
          <span>${q.resolution || ''}</span>
          <span>${q.filesize_str || ''}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.quality-card, .audio-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectQuality(q);
        executeDownload();
      });

      qualityPillsContainer.appendChild(card);
    });
  }

  function renderAudioPills(data) {
    audioPillsContainer.innerHTML = '';
    const audios = data.audio_options || [];

    audios.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'quality-card audio-card';
      card.dataset.formatId = a.format_id;

      card.innerHTML = `
        <div class="qc-header">
          <span class="qc-label">${escapeHtml(a.label)}</span>
          <span class="qc-ext">${a.ext || 'MP3'}</span>
        </div>
        <div class="qc-meta">
          <span>High Quality Audio</span>
          <span>Audio Only</span>
        </div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.quality-card, .audio-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectAudio(a);
        executeDownload();
      });

      audioPillsContainer.appendChild(card);
    });
  }

  function selectQuality(q) {
    selectedOption = {
      type: q.is_clean ? 'clean_watermark' : (q.is_watermarked ? 'watermarked' : 'video'),
      format_id: q.format_id,
      label: q.label,
      ext: q.ext || 'mp4',
      is_audio: false,
      direct_url: q.direct_url || null,
      filesize_str: q.filesize_str || ''
    };
    updateSummary();
  }

  function selectAudio(a) {
    selectedOption = {
      type: 'audio',
      format_id: a.format_id,
      label: a.label,
      ext: a.ext || 'mp3',
      is_audio: true,
      direct_url: a.direct_url || null,
      filesize_str: ''
    };
    updateSummary();
  }

  function updateSummary() {
    const summaryEl = document.getElementById('selectedSummaryText');
    if (summaryEl) {
      summaryEl.textContent = `${selectedOption.label} — ${selectedOption.ext.toUpperCase()}`;
    }
  }

  // Execute Download Trigger
  async function executeDownload() {
    if (!currentMedia) return;

    if (activePollInterval) clearInterval(activePollInterval);

    const safeTitle = (currentMedia.title || 'video').replace(/[/\\?%*:|"<>]/g, '_').trim() || 'video';
    const filename = `${safeTitle}.${selectedOption.ext || 'mp4'}`;

    // A. Backend Engine is Available (Local laptop engine or self-hosted API)
    if (currentMedia.backend_available) {
      progressStatusText.textContent = `Starting download for ${selectedOption.label}...`;
      progressBarFill.style.width = '20%';
      progressPctText.textContent = '20%';
      progressDownloaded.textContent = 'Initializing engine...';
      progressSpeed.textContent = 'High Speed';
      progressEta.textContent = 'Calculating...';

      try {
        const dlResp = await fetch('/api/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: currentMedia.original_url || currentMedia.webpage_url,
            format_id: selectedOption.format_id || 'best',
            title: currentMedia.title || 'video',
            is_audio: selectedOption.is_audio || false,
            direct_url: selectedOption.direct_url,
            ext: selectedOption.ext || 'mp4'
          })
        });
        if (dlResp.ok) {
          const dlData = await dlResp.json();
          if (dlData.job_id) {
            pollJobStatus(dlData.job_id);
            return;
          }
        }
      } catch (err) {
        console.warn('Backend download call failed:', err);
      }
    }

    // B. Direct Stream URL Available (e.g. TikTok Clean HD, Watermarked, Audio)
    if (selectedOption.direct_url) {
      progressStatusText.textContent = `Downloading ${selectedOption.label}...`;
      progressBarFill.style.width = '30%';
      progressPctText.textContent = '30%';
      progressDownloaded.textContent = selectedOption.filesize_str || 'Connecting...';
      progressSpeed.textContent = 'High Speed';
      progressEta.textContent = 'Streaming...';

      const success = await triggerStreamDownload(selectedOption.direct_url, filename);

      if (success) {
        progressBarFill.style.width = '100%';
        progressPctText.textContent = '100%';
        progressStatusText.textContent = 'Download Complete!';
        completeMessageText.textContent = `File saved to your Downloads folder: ${filename}`;
        
        downloadButtonsContainer.innerHTML = `
          <button type="button" class="direct-dl-btn primary" id="redownloadBtn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Download File Again
          </button>
        `;
        document.getElementById('redownloadBtn')?.addEventListener('click', () => {
          triggerStreamDownload(selectedOption.direct_url, filename);
        });
        downloadReadyCard.classList.remove('hidden');

        saveHistoryItem({
          id: Date.now().toString(),
          title: currentMedia.title,
          thumbnail: currentMedia.thumbnail,
          platform: currentMedia.platform,
          label: selectedOption.label,
          downloadUrl: selectedOption.direct_url,
          date: new Date().toISOString()
        });
        return;
      } else {
        // Direct stream ready without popup
        progressBarFill.style.width = '100%';
        progressPctText.textContent = '100%';
        progressStatusText.textContent = 'Direct Stream Ready!';
        completeMessageText.textContent = `Click below to save ${filename} directly into your Downloads folder:`;
        downloadButtonsContainer.innerHTML = `
          <a href="${selectedOption.direct_url}" class="direct-dl-btn primary" download="${filename}">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Save ${filename} to Downloads
          </a>
        `;
        downloadReadyCard.classList.remove('hidden');
        return;
      }
    }

    // C. Static Web App Details & Stream Preview for YouTube / Dailymotion
    progressBarFill.style.width = '100%';
    progressPctText.textContent = 'Ready';
    progressStatusText.textContent = 'Media Details & Stream Ready';
    completeMessageText.innerHTML = `<strong>${escapeHtml(currentMedia.title)}</strong>`;

    downloadButtonsContainer.innerHTML = `
      <div class="direct-notice-box">
        <div class="notice-header">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10b981" stroke-width="2.3">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <strong>Video Information & Stream Preview</strong>
        </div>
        <p class="notice-text">
          Uploader: <strong>${escapeHtml(currentMedia.uploader || 'Creator')}</strong> • Platform: <strong>${escapeHtml(currentMedia.platform.toUpperCase())}</strong>
        </p>
        <div class="stream-action-row">
          ${currentMedia.embed_url ? `
            <button type="button" class="direct-dl-btn primary" id="launchPlayerBtn">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              Watch Video Stream
            </button>
          ` : ''}
          <button type="button" class="direct-dl-btn secondary" id="copyDetailsBtn">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy Video Info
          </button>
        </div>
        <div class="mobile-app-callout">
          <div class="callout-icon">📱</div>
          <div class="callout-content">
            <div class="callout-title">Direct File Downloads on Mobile (Android App)</div>
            <p class="callout-desc">
              Your <strong>OmniFetch Android App</strong> is available in your Google Drive. It downloads videos from all platforms directly into your phone's <strong>Download</strong> folder without web browser limitations.
            </p>
            <a href="https://drive.google.com/file/d/1hUPF-z_yKGQMhpLYaA-R6e5PlwyIK9kL/view?usp=drivesdk" target="_blank" rel="noopener noreferrer" class="drive-apk-link">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
              Open Android APK in Google Drive
            </a>
          </div>
        </div>
      </div>
    `;

    document.getElementById('launchPlayerBtn')?.addEventListener('click', () => {
      startEmbedPlayer(currentMedia.embed_url);
      resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    document.getElementById('copyDetailsBtn')?.addEventListener('click', async () => {
      const text = `Title: ${currentMedia.title}\nPlatform: ${currentMedia.platform.toUpperCase()}\nUploader: ${currentMedia.uploader}\nURL: ${currentMedia.original_url || ''}\n\nDescription:\n${currentMedia.description}`;
      try {
        await navigator.clipboard.writeText(text);
        const btn = document.getElementById('copyDetailsBtn');
        if (btn) btn.innerHTML = `<span>Copied to Clipboard!</span>`;
        setTimeout(() => {
          if (btn) btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Copy Video Info`;
        }, 2000);
      } catch {
        alert('Could not copy to clipboard.');
      }
    });

    downloadReadyCard.classList.remove('hidden');
  }

  async function triggerStreamDownload(url, filename) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      
      if (!response.body || !totalBytes) {
        const blob = await response.blob();
        saveBlobLocally(blob, filename);
        return true;
      }

      const reader = response.body.getReader();
      let receivedBytes = 0;
      const chunks = [];
      const startTime = Date.now();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;
        
        const pct = Math.min(99, Math.round((receivedBytes / totalBytes) * 100));
        progressBarFill.style.width = `${pct}%`;
        progressPctText.textContent = `${pct}%`;
        progressDownloaded.textContent = `${(receivedBytes / (1024 * 1024)).toFixed(1)} MB / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
        
        const elapsedSec = (Date.now() - startTime) / 1000;
        if (elapsedSec > 0.4) {
          const speedMBs = ((receivedBytes / (1024 * 1024)) / elapsedSec).toFixed(1);
          progressSpeed.textContent = `${speedMBs} MB/s`;
          const remainingSec = Math.max(1, Math.round((totalBytes - receivedBytes) / (receivedBytes / elapsedSec)));
          progressEta.textContent = `ETA: ${remainingSec}s`;
        }
      }

      const blob = new Blob(chunks, { type: 'video/mp4' });
      saveBlobLocally(blob, filename);
      return true;

    } catch (err) {
      console.warn('Direct blob fetch failed:', err);
      return false;
    }
  }

  function saveBlobLocally(blob, filename) {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }

  function pollJobStatus(jobId) {
    activePollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/job/${jobId}`);
        if (!resp.ok) return;

        const job = await resp.json();
        const pct = job.progress || 0;
        progressBarFill.style.width = `${pct}%`;
        progressPctText.textContent = `${Math.round(pct)}%`;

        if (job.status === 'downloading') {
          progressStatusText.textContent = 'Downloading media streams...';
          progressDownloaded.textContent = `${job.downloaded_str || '0 B'} / ${job.total_str || 'calc...'}`;
          if (job.speed_str) progressSpeed.textContent = job.speed_str;
          if (job.eta_str) progressEta.textContent = `ETA: ${job.eta_str}`;
        } else if (job.status === 'completed') {
          clearInterval(activePollInterval);
          progressStatusText.textContent = 'Download Complete!';
          progressBarFill.style.width = '100%';
          progressPctText.textContent = '100%';

          const fileUrl = `/api/job/${jobId}/file`;
          saveFileDirectLink.href = fileUrl;
          downloadReadyCard.classList.remove('hidden');

          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = job.filename || 'media.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          saveHistoryItem({
            id: jobId,
            title: currentMedia.title,
            thumbnail: currentMedia.thumbnail,
            platform: currentMedia.platform,
            label: selectedOption.label,
            downloadUrl: fileUrl,
            date: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 600);
  }

  // Description Toggle & Copy
  toggleDescBtn.addEventListener('click', () => {
    const isExp = mediaDescription.classList.toggle('expanded');
    toggleDescBtn.textContent = isExp ? 'Show less' : 'Show more';
  });

  copyDescBtn.addEventListener('click', async () => {
    if (!currentMedia) return;
    const fullText = `Title: ${currentMedia.title}\nUploader: ${currentMedia.uploader}\n\nDescription:\n${currentMedia.description}`;
    try {
      await navigator.clipboard.writeText(fullText);
      const originalText = copyDescBtn.querySelector('span').textContent;
      copyDescBtn.querySelector('span').textContent = 'Copied!';
      setTimeout(() => {
        copyDescBtn.querySelector('span').textContent = originalText;
      }, 2000);
    } catch {
      alert('Unable to copy text to clipboard.');
    }
  });

  // Subtitle Download
  downloadSubBtn.addEventListener('click', () => {
    const selectedUrl = subtitleSelect.value;
    if (selectedUrl) {
      const safeTitle = (currentMedia?.title || 'subtitles').replace(/[/\\?%*:|"<>]/g, '_').trim();
      const a = document.createElement('a');
      a.href = selectedUrl;
      a.download = `${safeTitle}_subtitles.vtt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  });

  updateHistoryBadge();

})();
