/**
 * OmniFetch Client Application Logic
 * Supports YouTube, TikTok (clean/watermarked), Facebook, Dailymotion, Instagram
 */

(() => {
  'use strict';

  // State
  let currentMedia = null;
  let selectedOption = {
    type: 'video', // 'video', 'clean_watermark', 'watermark', 'audio'
    format_id: 'best',
    label: 'Best Available (Max Quality)',
    ext: 'mp4',
    is_audio: false,
    direct_url: null
  };
  let activePollInterval = null;
  let deferredInstallPrompt = null;

  // DOM Elements
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const statusBanner = document.getElementById('statusBanner');
  const resultSection = document.getElementById('resultSection');

  // Media Overview Elements
  const mediaThumbnail = document.getElementById('mediaThumbnail');
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
  const selectedSummaryText = document.getElementById('selectedSummaryText');
  const startDownloadBtn = document.getElementById('startDownloadBtn');
  const startDownloadBtnText = document.getElementById('startDownloadBtnText');

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

  // Theme & Modals
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const historyBtn = document.getElementById('historyBtn');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const historyModal = document.getElementById('historyModal');
  const closeHistoryBtn = document.getElementById('closeHistoryBtn');
  const historyListContainer = document.getElementById('historyListContainer');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const installAppBtn = document.getElementById('installAppBtn');
  const installModal = document.getElementById('installModal');
  const closeInstallBtn = document.getElementById('closeInstallBtn');

  // Service Worker Registration for Android PWA
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('SW registration failed:', err);
      });
    });
  }

  // Capture PWA Install Prompt for Android
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installAppBtn.classList.remove('hidden');
  });

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
      historyListContainer.innerHTML = '<p class="empty-state">No downloads yet. Videos you download will appear here.</p>';
      return;
    }
    historyListContainer.innerHTML = history.map((item) => `
      <div class="history-item">
        <img src="${item.thumbnail || '/icons/favicon.png'}" alt="Thumb" class="history-thumb" />
        <div class="history-meta">
          <div class="history-title">${escapeHtml(item.title)}</div>
          <div class="history-sub">${item.platform.toUpperCase()} • ${item.label} • ${new Date(item.date).toLocaleDateString()}</div>
        </div>
        ${item.downloadUrl ? `<a href="${item.downloadUrl}" class="save-file-btn" download>Save</a>` : ''}
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

  // Install Modal
  installAppBtn.addEventListener('click', () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the PWA install prompt');
        }
        deferredInstallPrompt = null;
      });
    } else {
      installModal.classList.remove('hidden');
    }
  });
  closeInstallBtn.addEventListener('click', () => installModal.classList.add('hidden'));

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
    return null;
  }

  function updatePlatformChips(detected) {
    document.querySelectorAll('.chip').forEach((chip) => {
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

  // Paste Action
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        updatePlatformChips(detectPlatform(urlInput.value));
        analyzeVideo();
      }
    } catch {
      urlInput.focus();
    }
  });

  // Sample Links
  document.querySelectorAll('.sample-link-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      urlInput.value = btn.dataset.url;
      updatePlatformChips(detectPlatform(btn.dataset.url));
      analyzeVideo();
    });
  });

  // Show status banner
  function showStatus(msg, type = 'error') {
    statusBanner.className = `status-banner ${type}`;
    statusBanner.querySelector('.status-message').textContent = msg;
    statusBanner.classList.remove('hidden');
  }

  function hideStatus() {
    statusBanner.classList.add('hidden');
  }

  // Analyze Video
  fetchBtn.addEventListener('click', analyzeVideo);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeVideo();
  });

  async function analyzeVideo() {
    const url = urlInput.value.trim();
    if (!url) {
      showStatus('Please enter or paste a valid social media video URL.');
      return;
    }

    hideStatus();
    resultSection.classList.add('hidden');
    progressTracker.classList.add('hidden');
    fetchBtn.disabled = true;
    fetchBtn.querySelector('.btn-text').textContent = 'Analyzing...';
    fetchBtn.querySelector('.btn-spinner').classList.remove('hidden');

    try {
      let data = null;
      try {
        const resp = await fetch('/api/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        if (resp.ok) {
          data = await resp.json();
        }
      } catch (backendErr) {
        console.log('Local backend not reachable, using direct browser client extraction...', backendErr);
      }

      // If backend was not reachable (e.g. on GitHub Pages), use direct browser extraction
      if (!data) {
        data = await extractClientSide(url);
      }

      currentMedia = data;
      renderMediaData(data);
    } catch (err) {
      showStatus(err.message || 'Error extracting video information');
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.querySelector('.btn-text').textContent = 'Analyze Video';
      fetchBtn.querySelector('.btn-spinner').classList.add('hidden');
    }
  }

  // Direct client-side extractor for GitHub Pages (No server required)
  async function extractClientSide(url) {
    const platform = detectPlatform(url);

    // 1. TikTok Client Extraction via TikWM (CORS enabled)
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
            label: 'Original (With Watermark & Handle)',
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
          thumbnail: d.cover || d.origin_cover || '',
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

    // 2. YouTube Client Extraction via oEmbed + Invidious
    if (platform === 'youtube') {
      const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (!oembedResp.ok) throw new Error('Invalid YouTube video URL');
      const oe = await oembedResp.json();
      
      const vMatch = url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/);
      const vid = vMatch ? vMatch[1] : '';

      return {
        platform: 'youtube',
        title: oe.title || 'YouTube Video',
        description: `Video by ${oe.author_name}. Available in multiple resolutions.`,
        uploader: oe.author_name || 'YouTube Creator',
        uploader_name: oe.author_name || 'YouTube Creator',
        uploader_url: oe.author_url || url,
        uploader_avatar: '',
        thumbnail: oe.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : ''),
        duration: 0,
        duration_str: 'Full Video',
        has_watermark_options: false,
        qualities: [
          { format_id: '1080p', label: '1080p (Full HD)', resolution: '1920x1080', ext: 'mp4', direct_url: vid ? `https://inv.bp.projectsegfau.lt/latest_version?id=${vid}&itag=22` : null },
          { format_id: '720p', label: '720p (HD)', resolution: '1280x720', ext: 'mp4', direct_url: vid ? `https://inv.bp.projectsegfau.lt/latest_version?id=${vid}&itag=18` : null },
          { format_id: '480p', label: '480p (SD)', resolution: '854x480', ext: 'mp4', direct_url: null },
          { format_id: '360p', label: '360p (Data Saver)', resolution: '640x360', ext: 'mp4', direct_url: null }
        ],
        audio_options: [
          { format_id: 'mp3', label: 'Audio MP3 (320kbps)', ext: 'mp3', direct_url: vid ? `https://inv.bp.projectsegfau.lt/latest_version?id=${vid}&itag=140` : null }
        ],
        subtitles: [],
        original_url: url
      };
    }

    // 3. Fallback for other platforms (Dailymotion, Facebook, Instagram)
    return {
      platform: platform || 'social',
      title: `${(platform || 'Social').toUpperCase()} Media Stream`,
      description: `Target URL: ${url}`,
      uploader: `${(platform || 'Social')} Uploader`,
      uploader_name: 'Creator',
      uploader_url: url,
      uploader_avatar: '',
      thumbnail: '/icons/icon.svg',
      duration: 0,
      duration_str: 'Stream',
      has_watermark_options: false,
      qualities: [
        { format_id: 'best', label: 'Best Available Quality', resolution: 'Original HD', ext: 'mp4', direct_url: null },
        { format_id: '720p', label: '720p HD', resolution: '1280x720', ext: 'mp4', direct_url: null }
      ],
      audio_options: [
        { format_id: 'mp3', label: 'High Quality Audio (MP3)', ext: 'mp3', direct_url: null }
      ],
      subtitles: [],
      original_url: url
    };
  }

  // Render Media Information & Setup Option Panels
  function renderMediaData(data) {
    // 1. Overview
    mediaThumbnail.src = data.thumbnail || '/icons/icon.svg';
    mediaDuration.textContent = data.duration_str || '0:00';
    platformBadge.textContent = (data.platform || 'video').toUpperCase();

    // 2. Creator Profile
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

    // 3. Title & Description
    mediaTitle.textContent = data.title || 'Untitled Media';
    const desc = data.description || 'No description available for this video.';
    mediaDescription.textContent = desc;
    mediaDescription.classList.remove('expanded');

    if (desc.length > 120) {
      toggleDescBtn.classList.remove('hidden');
      toggleDescBtn.textContent = 'Show more';
    } else {
      toggleDescBtn.classList.add('hidden');
    }

    // 4. Watermark Mode (for TikTok)
    if (data.has_watermark_options && data.qualities.some(q => q.is_clean)) {
      watermarkControlGroup.classList.remove('hidden');
      setupWatermarkControls(data);
    } else {
      watermarkControlGroup.classList.add('hidden');
    }

    // 5. Video Qualities
    renderQualityPills(data);

    // 6. Audio Options
    renderAudioPills(data);

    // 7. Subtitles / Closed Captions
    if (data.subtitles && data.subtitles.length > 0) {
      subtitleControlGroup.classList.remove('hidden');
      subtitleSelect.innerHTML = data.subtitles.map(s => 
        `<option value="${escapeHtml(s.url)}" data-lang="${s.lang}">${escapeHtml(s.label)}</option>`
      ).join('');
    } else {
      subtitleControlGroup.classList.add('hidden');
    }

    // Set Default Selection
    selectDefaultOption(data);

    resultSection.classList.remove('hidden');
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Watermark Radio Handlers
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
          if (cleanQ) selectQuality(cleanQ);
        } else {
          const wmQ = data.qualities.find(q => q.is_watermarked) || data.qualities[0];
          if (wmQ) selectQuality(wmQ);
        }
      });
    });
  }

  // Render Quality Pills
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
      });

      qualityPillsContainer.appendChild(card);
    });
  }

  // Render Audio Pills
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
      });

      audioPillsContainer.appendChild(card);
    });
  }

  function selectDefaultOption(data) {
    // If TikTok with clean stream, default to Clean HD
    if (data.has_watermark_options) {
      const cleanQ = data.qualities.find(q => q.is_clean);
      if (cleanQ) {
        selectQuality(cleanQ);
        return;
      }
    }
    // Else default to first video quality
    if (data.qualities && data.qualities.length > 0) {
      selectQuality(data.qualities[0]);
    }
  }

  function selectQuality(q) {
    selectedOption = {
      type: q.is_clean ? 'clean_watermark' : (q.is_watermarked ? 'watermarked' : 'video'),
      format_id: q.format_id,
      label: q.label,
      ext: q.ext || 'mp4',
      is_audio: false,
      direct_url: q.direct_url || null
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
      direct_url: a.direct_url || null
    };
    updateSummary();
  }

  function updateSummary() {
    selectedSummaryText.textContent = `${selectedOption.label} — ${selectedOption.ext.toUpperCase()}`;
    startDownloadBtnText.textContent = `Download ${selectedOption.ext.toUpperCase()}`;
  }

  // Toggle Description Expand
  toggleDescBtn.addEventListener('click', () => {
    const isExp = mediaDescription.classList.toggle('expanded');
    toggleDescBtn.textContent = isExp ? 'Show less' : 'Show more';
  });

  // Copy Description Button
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
      alert('Unable to copy to clipboard.');
    }
  });

  // Subtitle Download
  downloadSubBtn.addEventListener('click', () => {
    const selectedUrl = subtitleSelect.value;
    const selectedOpt = subtitleSelect.options[subtitleSelect.selectedIndex];
    const lang = selectedOpt ? selectedOpt.dataset.lang : 'en';
    if (!selectedUrl) return;
    const downloadUrl = `/api/subtitle?url=${encodeURIComponent(selectedUrl)}&lang=${lang}`;
    window.open(downloadUrl, '_blank');
  });

  // Start Download Execution
  startDownloadBtn.addEventListener('click', initiateDownload);

  async function initiateDownload() {
    if (!currentMedia) return;

    if (activePollInterval) clearInterval(activePollInterval);

    // If direct download URL is available (e.g. TikTok Clean HD, Audio, or GitHub Pages client mode)
    if (selectedOption.direct_url) {
      progressTracker.classList.remove('hidden');
      progressStatusText.textContent = 'Opening direct stream download...';
      progressBarFill.style.width = '100%';
      progressPctText.textContent = '100%';
      progressDownloaded.textContent = selectedOption.filesize_str || 'Direct Stream';
      progressSpeed.textContent = 'High Speed';
      progressEta.textContent = 'Ready';

      const a = document.createElement('a');
      a.href = selectedOption.direct_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `${currentMedia.title || 'video'}.${selectedOption.ext || 'mp4'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      saveFileDirectLink.href = selectedOption.direct_url;
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
    }

    // Otherwise use backend download job
    progressTracker.classList.remove('hidden');
    downloadReadyCard.classList.add('hidden');
    progressStatusText.textContent = 'Initiating download...';
    progressPctText.textContent = '0%';
    progressBarFill.style.width = '0%';
    progressDownloaded.textContent = '0 B';
    progressSpeed.textContent = '';
    progressEta.textContent = '';
    startDownloadBtn.disabled = true;

    try {
      const payload = {
        url: currentMedia.original_url,
        format_id: selectedOption.format_id,
        title: currentMedia.title,
        is_audio: selectedOption.is_audio,
        direct_url: selectedOption.direct_url,
        ext: selectedOption.ext
      };

      const resp = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        throw new Error('Server rejected download request');
      }

      const { job_id } = await resp.json();
      pollJobStatus(job_id);
    } catch (err) {
      showStatus(err.message || 'Download failed to start');
      startDownloadBtn.disabled = false;
      progressTracker.classList.add('hidden');
    }
  }

  function pollJobStatus(jobId) {
    activePollInterval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/job/${jobId}`);
        if (!resp.ok) return;

        const job = await resp.json();

        // Update progress UI
        const pct = job.progress || 0;
        progressBarFill.style.width = `${pct}%`;
        progressPctText.textContent = `${Math.round(pct)}%`;

        if (job.status === 'downloading') {
          progressStatusText.textContent = 'Downloading media streams...';
          progressDownloaded.textContent = `${job.downloaded_str || '0 B'} / ${job.total_str || 'calc...'}`;
          if (job.speed_str) progressSpeed.textContent = job.speed_str;
          if (job.eta_str) progressEta.textContent = `ETA: ${job.eta_str}`;
        } else if (job.status === 'processing') {
          progressStatusText.textContent = 'Merging video & audio with FFmpeg...';
        } else if (job.status === 'completed') {
          clearInterval(activePollInterval);
          progressStatusText.textContent = 'Download Complete!';
          progressBarFill.style.width = '100%';
          progressPctText.textContent = '100%';
          startDownloadBtn.disabled = false;

          const fileUrl = `/api/job/${jobId}/file`;
          saveFileDirectLink.href = fileUrl;
          downloadReadyCard.classList.remove('hidden');

          // Auto-trigger browser download
          const a = document.createElement('a');
          a.href = fileUrl;
          a.download = job.filename || 'media.mp4';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          // Save to History
          saveHistoryItem({
            id: jobId,
            title: currentMedia.title,
            thumbnail: currentMedia.thumbnail,
            platform: currentMedia.platform,
            label: selectedOption.label,
            downloadUrl: fileUrl,
            date: new Date().toISOString()
          });
        } else if (job.status === 'error') {
          clearInterval(activePollInterval);
          progressStatusText.textContent = 'Download Failed';
          showStatus(job.error || 'Download failed during processing');
          startDownloadBtn.disabled = false;
        }
      } catch (err) {
        console.warn('Polling error:', err);
      }
    }, 600);
  }

  // Initial History Badge check
  updateHistoryBadge();

})();
