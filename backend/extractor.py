import os
import re
import json
import uuid
import asyncio
import urllib.parse
from typing import Dict, Any, List, Optional
import httpx
import yt_dlp

# Ensure no proxy parsing bugs on localhost
os.environ['no_proxy'] = 'localhost,127.0.0.1'
os.environ['NO_PROXY'] = 'localhost,127.0.0.1'

DOWNLOADS_DIR = "/home/antigravity/omni-downloader/downloads"
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Active jobs tracker: job_id -> status dict
active_jobs: Dict[str, Dict[str, Any]] = {}

def get_platform_name(url: str) -> str:
    url_lower = url.lower()
    if any(k in url_lower for k in ["tiktok.com", "douyin.com"]):
        return "tiktok"
    elif any(k in url_lower for k in ["youtube.com", "youtu.be"]):
        return "youtube"
    elif any(k in url_lower for k in ["facebook.com", "fb.watch", "fb.com"]):
        return "facebook"
    elif any(k in url_lower for k in ["dailymotion.com", "dai.ly"]):
        return "dailymotion"
    elif any(k in url_lower for k in ["instagram.com", "instagr.am"]):
        return "instagram"
    elif any(k in url_lower for k in ["twitter.com", "x.com"]):
        return "twitter"
    elif "vimeo.com" in url_lower:
        return "vimeo"
    elif "reddit.com" in url_lower:
        return "reddit"
    return "other"

def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "Unknown"
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def format_filesize(bytes_val: Optional[int]) -> str:
    if not bytes_val or bytes_val <= 0:
        return ""
    if bytes_val >= 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024 * 1024):.1f} GB"
    elif bytes_val >= 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    elif bytes_val >= 1024:
        return f"{bytes_val / 1024:.0f} KB"
    return f"{bytes_val} B"

async def extract_tiktok_info(url: str) -> Optional[Dict[str, Any]]:
    """Try TikWM API first for high-quality clean (no-watermark) vs watermarked streams & author info."""
    api_url = f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}"
    try:
        async with httpx.AsyncClient(verify=False, timeout=8.0) as client:
            resp = await client.get(api_url)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("code") == 0 and data.get("data"):
                    d = data["data"]
                    author = d.get("author", {})
                    author_name = author.get("unique_id") or "tiktok_user"
                    nickname = author.get("nickname") or author_name
                    avatar = author.get("avatar") or ""
                    title = d.get("title") or f"TikTok by @{author_name}"
                    cover = d.get("cover") or d.get("origin_cover") or ""
                    duration = d.get("duration", 0)

                    # Stream options
                    qualities = []
                    # Clean video (no watermark)
                    clean_url = d.get("play") or d.get("hdplay")
                    if clean_url:
                        if not clean_url.startswith("http"):
                            clean_url = f"https://www.tikwm.com{clean_url}"
                        qualities.append({
                            "format_id": "tiktok_clean",
                            "label": "Clean HD (No Watermark / Text)",
                            "resolution": "Original HD (Clean)",
                            "ext": "mp4",
                            "is_clean": True,
                            "direct_url": clean_url,
                            "filesize_str": format_filesize(d.get("size"))
                        })

                    # Original with watermark
                    wm_url = d.get("wmplay")
                    if wm_url:
                        if not wm_url.startswith("http"):
                            wm_url = f"https://www.tikwm.com{wm_url}"
                        qualities.append({
                            "format_id": "tiktok_watermarked",
                            "label": "Original (With Watermark & Handle)",
                            "resolution": "Original (Watermarked)",
                            "ext": "mp4",
                            "is_watermarked": True,
                            "direct_url": wm_url,
                            "filesize_str": format_filesize(d.get("wm_size"))
                        })

                    # Audio
                    music_url = d.get("music")
                    audio_options = []
                    if music_url:
                        if not music_url.startswith("http"):
                            music_url = f"https://www.tikwm.com{music_url}"
                        music_title = d.get("music_info", {}).get("title") or "Original Sound"
                        audio_options.append({
                            "format_id": "tiktok_music",
                            "label": f"Audio: {music_title}",
                            "ext": "mp3",
                            "direct_url": music_url
                        })

                    return {
                        "platform": "tiktok",
                        "title": title,
                        "description": title,
                        "uploader": f"@{author_name} ({nickname})",
                        "uploader_name": author_name,
                        "uploader_nickname": nickname,
                        "uploader_url": f"https://www.tiktok.com/@{author_name}",
                        "uploader_avatar": avatar,
                        "uploader_followers": author.get("follower_count") or author.get("followers"),
                        "thumbnail": cover,
                        "duration": duration,
                        "duration_str": format_duration(duration),
                        "has_watermark_options": True,
                        "qualities": qualities,
                        "audio_options": audio_options,
                        "subtitles": [],
                        "original_url": url
                    }
    except Exception as e:
        print(f"TikWM extract failed, falling back to yt-dlp: {e}")
    return None

def extract_general_info(url: str) -> Dict[str, Any]:
    """Universal extractor using yt-dlp."""
    platform = get_platform_name(url)
    ydl_opts = {
        'quiet': True,
        'skip_download': True,
        'nocheckcertificate': True,
        'js_runtimes': {'node': {'path': '/usr/local/bin/node'}},
        'extract_flat': False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)

    title = info.get("title") or "Unknown Video"
    uploader = info.get("uploader") or info.get("channel") or info.get("creator") or "Unknown Creator"
    uploader_url = info.get("uploader_url") or info.get("channel_url") or ""
    thumbnail = info.get("thumbnail") or ""
    duration = info.get("duration") or 0
    description = info.get("description") or ""

    # Subtitles
    subtitles_list = []
    subs = info.get("subtitles") or {}
    auto_subs = info.get("automatic_captions") or {}
    for lang, track_list in subs.items():
        vtt_or_srt = next((t.get("url") for t in track_list if t.get("ext") in ["vtt", "srt"]), None)
        subtitles_list.append({
            "lang": lang,
            "label": f"{lang.upper()} (Subtitles)",
            "url": vtt_or_srt or (track_list[0].get("url") if track_list else "")
        })
    for lang, track_list in auto_subs.items():
        if lang not in subs and len(subtitles_list) < 8:
            vtt_or_srt = next((t.get("url") for t in track_list if t.get("ext") in ["vtt", "srt"]), None)
            subtitles_list.append({
                "lang": lang,
                "label": f"{lang.upper()} (Auto-Generated)",
                "url": vtt_or_srt or (track_list[0].get("url") if track_list else "")
            })

    # Formats & Qualities
    raw_formats = info.get("formats", [])
    qualities_dict = {}

    # Sort formats from best to lowest
    for f in raw_formats:
        ext = f.get("ext", "mp4")
        height = f.get("height")
        vcodec = f.get("vcodec", "")
        # skip audio-only or invalid
        if vcodec == "none" or not height:
            continue
        # standardize height
        if height >= 2160:
            tier = "2160p (4K UHD)"
            tier_h = 2160
        elif height >= 1440:
            tier = "1440p (2K QHD)"
            tier_h = 1440
        elif height >= 1080:
            tier = "1080p (Full HD)"
            tier_h = 1080
        elif height >= 720:
            tier = "720p (HD)"
            tier_h = 720
        elif height >= 480:
            tier = "480p (SD)"
            tier_h = 480
        elif height >= 360:
            tier = "360p (Medium)"
            tier_h = 360
        else:
            tier = f"{height}p"
            tier_h = height

        # Select best format for this height tier
        existing = qualities_dict.get(tier_h)
        f_size = f.get("filesize") or f.get("filesize_approx")
        if not existing or (f_size and f_size > (existing.get("filesize") or 0)):
            qualities_dict[tier_h] = {
                "format_id": f.get("format_id"),
                "label": tier,
                "height": tier_h,
                "resolution": f"{f.get('width', '')}x{height}" if f.get('width') else f"{height}p",
                "filesize": f_size,
                "filesize_str": format_filesize(f_size),
                "fps": f.get("fps"),
                "ext": "mp4",
                "acodec": f.get("acodec", "")
            }

    # Order qualities descending
    sorted_qualities = [qualities_dict[k] for k in sorted(qualities_dict.keys(), reverse=True)]

    # Add a top "Best Available Video + Audio"
    best_item = {
        "format_id": "bestvideo+bestaudio/best",
        "label": "Best Available (Max Quality)",
        "resolution": "Auto (Highest)",
        "filesize": None,
        "filesize_str": "Auto",
        "ext": "mp4"
    }
    qualities = [best_item] + sorted_qualities

    # Audio options
    audio_options = [
        {
            "format_id": "bestaudio/best",
            "label": "High Quality Audio (MP3 320kbps)",
            "ext": "mp3",
            "is_audio": True
        },
        {
            "format_id": "bestaudio[ext=m4a]/bestaudio",
            "label": "Original Audio (M4A / AAC)",
            "ext": "m4a",
            "is_audio": True
        }
    ]

    has_watermark_options = (platform == "tiktok")

    return {
        "platform": platform,
        "title": title,
        "description": description[:1000] if description else "",
        "uploader": uploader,
        "uploader_name": uploader,
        "uploader_url": uploader_url,
        "uploader_avatar": "",
        "thumbnail": thumbnail,
        "duration": duration,
        "duration_str": format_duration(duration),
        "view_count": info.get("view_count"),
        "like_count": info.get("like_count"),
        "has_watermark_options": has_watermark_options,
        "qualities": qualities,
        "audio_options": audio_options,
        "subtitles": subtitles_list,
        "original_url": url
    }

async def get_video_info(url: str) -> Dict[str, Any]:
    platform = get_platform_name(url)
    if platform == "tiktok":
        tiktok_data = await extract_tiktok_info(url)
        if tiktok_data:
            return tiktok_data
    # Universal fallback via yt-dlp in executor
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, extract_general_info, url)

def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    cleaned = re.sub(r'\s+', " ", cleaned).strip()
    return cleaned[:80] if cleaned else "video"

async def _download_direct_url(job_id: str, direct_url: str, title: str, ext: str):
    """Direct HTTP streaming download for TikTok / direct media links."""
    safe_title = sanitize_filename(title)
    filename = f"{safe_title}.{ext}"
    filepath = os.path.join(DOWNLOADS_DIR, f"{job_id}_{filename}")
    
    try:
        active_jobs[job_id]["status"] = "downloading"
        active_jobs[job_id]["filename"] = filename
        active_jobs[job_id]["filepath"] = filepath

        async with httpx.AsyncClient(verify=False, timeout=60.0) as client:
            async with client.stream("GET", direct_url) as resp:
                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                with open(filepath, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if total > 0:
                            pct = round((downloaded / total) * 100, 1)
                            active_jobs[job_id]["progress"] = pct
                            active_jobs[job_id]["downloaded_str"] = format_filesize(downloaded)
                            active_jobs[job_id]["total_str"] = format_filesize(total)
                        else:
                            active_jobs[job_id]["downloaded_str"] = format_filesize(downloaded)

        active_jobs[job_id]["status"] = "completed"
        active_jobs[job_id]["progress"] = 100.0
    except Exception as e:
        active_jobs[job_id]["status"] = "error"
        active_jobs[job_id]["error"] = str(e)

def _ytdlp_download_worker(job_id: str, url: str, format_id: str, is_audio: bool, title: str):
    """Worker running inside thread executor for yt-dlp downloads."""
    safe_title = sanitize_filename(title)
    outtmpl = os.path.join(DOWNLOADS_DIR, f"{job_id}_{safe_title}.%(ext)s")

    def progress_hook(d):
        if d.get("status") == "downloading":
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            downloaded = d.get("downloaded_bytes", 0)
            if total > 0:
                pct = round((downloaded / total) * 100, 1)
                active_jobs[job_id]["progress"] = min(pct, 99.0)
                active_jobs[job_id]["downloaded_str"] = format_filesize(downloaded)
                active_jobs[job_id]["total_str"] = format_filesize(total)
            
            speed = d.get("speed")
            if speed:
                active_jobs[job_id]["speed_str"] = f"{format_filesize(speed)}/s"
            eta = d.get("eta")
            if eta is not None:
                active_jobs[job_id]["eta_str"] = f"{eta}s"
            active_jobs[job_id]["status"] = "downloading"
        elif d.get("status") == "finished":
            active_jobs[job_id]["status"] = "processing"
            active_jobs[job_id]["progress"] = 99.0

    ydl_opts = {
        'outtmpl': outtmpl,
        'quiet': True,
        'nocheckcertificate': True,
        'js_runtimes': {'node': {'path': '/usr/local/bin/node'}},
        'progress_hooks': [progress_hook],
    }

    if is_audio:
        ydl_opts['format'] = 'bestaudio/best'
        ydl_opts['postprocessors'] = [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '320',
        }]
    else:
        # Merge best audio if needed
        if format_id and format_id != "best":
            ydl_opts['format'] = f"{format_id}+bestaudio/best/{format_id}"
        else:
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
        ydl_opts['merge_output_format'] = 'mp4'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        # Find the final file created with this job_id prefix
        matched_files = [f for f in os.listdir(DOWNLOADS_DIR) if f.startswith(f"{job_id}_")]
        if matched_files:
            final_file = matched_files[0]
            # Strip job_id for clean user filename
            user_filename = final_file.replace(f"{job_id}_", "")
            active_jobs[job_id]["filename"] = user_filename
            active_jobs[job_id]["filepath"] = os.path.join(DOWNLOADS_DIR, final_file)
            active_jobs[job_id]["status"] = "completed"
            active_jobs[job_id]["progress"] = 100.0
        else:
            active_jobs[job_id]["status"] = "error"
            active_jobs[job_id]["error"] = "Downloaded file not found on disk"
    except Exception as e:
        active_jobs[job_id]["status"] = "error"
        active_jobs[job_id]["error"] = str(e)

async def start_download_job(url: str, format_id: str, title: str, is_audio: bool = False, direct_url: Optional[str] = None, ext: str = "mp4") -> str:
    job_id = uuid.uuid4().hex[:12]
    active_jobs[job_id] = {
        "job_id": job_id,
        "status": "pending",
        "progress": 0.0,
        "title": title,
        "is_audio": is_audio,
        "downloaded_str": "0 B",
        "total_str": "Calculating...",
        "speed_str": "",
        "eta_str": "",
        "filename": None,
        "filepath": None,
        "error": None
    }

    if direct_url:
        asyncio.create_task(_download_direct_url(job_id, direct_url, title, ext))
    else:
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _ytdlp_download_worker, job_id, url, format_id, is_audio, title)

    return job_id

