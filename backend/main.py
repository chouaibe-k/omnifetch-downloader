import os
import shutil
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import yt_dlp

from extractor import (
    get_video_info,
    start_download_job,
    active_jobs,
    DOWNLOADS_DIR
)

app = FastAPI(title="OmniFetch Video Downloader API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class InfoRequest(BaseModel):
    url: str

class DownloadRequest(BaseModel):
    url: str
    format_id: Optional[str] = "best"
    title: Optional[str] = "video"
    is_audio: Optional[bool] = False
    direct_url: Optional[str] = None
    ext: Optional[str] = "mp4"

@app.get("/api/health")
async def health_check():
    ffmpeg_available = shutil.which("ffmpeg") is not None
    return {
        "status": "healthy",
        "yt_dlp_version": yt_dlp.version.__version__,
        "ffmpeg": ffmpeg_available,
        "active_jobs_count": len(active_jobs)
    }

@app.post("/api/info")
async def fetch_info(req: InfoRequest):
    if not req.url or not req.url.strip():
        raise HTTPException(status_code=400, detail="URL cannot be empty")
    url = req.url.strip()
    try:
        data = await get_video_info(url)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to extract info: {str(e)}")

@app.post("/api/download")
async def create_download(req: DownloadRequest):
    if not req.url and not req.direct_url:
        raise HTTPException(status_code=400, detail="Missing video URL or direct URL")
    
    try:
        job_id = await start_download_job(
            url=req.url,
            format_id=req.format_id or "best",
            title=req.title or "video",
            is_audio=req.is_audio or False,
            direct_url=req.direct_url,
            ext=req.ext or "mp4"
        )
        return {"job_id": job_id, "status": "pending"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/job/{job_id}")
async def get_job_status(job_id: str):
    job = active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job

@app.get("/api/job/{job_id}/file")
async def download_job_file(job_id: str):
    job = active_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != "completed":
        raise HTTPException(status_code=400, detail=f"Job not ready. Current status: {job.get('status')}")
    
    filepath = job.get("filepath")
    if not filepath or not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File missing from disk")
    
    filename = job.get("filename") or os.path.basename(filepath)
    return FileResponse(
        filepath,
        filename=filename,
        media_type="application/octet-stream"
    )

@app.get("/api/subtitle")
async def fetch_subtitle(url: str = Query(...), lang: str = Query("en")):
    """Proxies subtitle text/file for direct download."""
    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="Unable to retrieve subtitle track")
            
            content_type = "text/vtt" if ".vtt" in url.lower() else "text/plain"
            ext = "vtt" if ".vtt" in url.lower() else "srt"
            return Response(
                content=resp.content,
                media_type=content_type,
                headers={"Content-Disposition": f'attachment; filename="subtitles_{lang}.{ext}"'}
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch subtitles: {str(e)}")

# Mount frontend files at root
FRONTEND_DIR = "/home/antigravity/omni-downloader/frontend"
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
