@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [1/3] Gerando audios novos...
python tools\gerar_audio.py || goto erro
echo [2/3] Salvando no Git...
git add -A
git commit -m "Atualiza licoes" 
echo [3/3] Enviando para o GitHub (a Vercel publica sozinha em ~30s)...
git push || goto erro
echo.
echo Pronto! Em instantes o site estara atualizado.
pause
exit /b 0
:erro
echo.
echo Algo deu errado. Leia a mensagem acima.
pause
exit /b 1
