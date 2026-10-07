@echo off
rem Lance la visionneuse de portraits (http://127.0.0.1:8777)
cd /d "%~dp0"
start "" http://127.0.0.1:8777
"%USERPROFILE%\Documents\ComfyUI\.venv\Scripts\python.exe" app.py
