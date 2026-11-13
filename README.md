# Lumen Studio

Alternativa local y gratuita a Viryl Studio: convierte una canción en varios clips musicales sincronizados con los beats, con letras animadas y render real en MP4 mediante FFmpeg.

Todo ocurre en tu equipo. No hay cuenta, nube, base de datos, API de pago ni claves de IA. La única red que puede usarse es la importación opcional de YouTube, y solo para material sobre el que tengas derechos.

---

## Qué hace

- Sube audio y vídeo locales (arrastrar y soltar).
- Elige el fragmento de la canción sobre la forma de onda.
- Analiza de verdad: BPM, beats, onsets, secciones y drops con librosa; escenas, movimiento, luz y nitidez con PySceneDetect + OpenCV.
- Genera N versiones (EDL independiente por clip) con 10 estilos de montaje.
- Quema letras animadas con libass (fade, slide, scale, pop, karaoke, palabra a palabra, typewriter, blur, bounce, smooth reveal).
- Editor con timeline funcional, arrastre/redimensionado de cortes, dividir, duplicar, eliminar, undo/redo, grade, efectos, volumen y letras.
- Render real H.264/AAC, validación con ffprobe, descarga individual o ZIP.
- 100% local: `projects/<id>/` guarda fuentes, análisis, masters, EDLs, letras y renders.

## Requisitos

| Pieza | Versión / nota |
|---|---|
| Windows | 10/11 (el código también funciona en Linux/macOS con ajustes de rutas) |
| Python | 3.12 recomendado (mínimo 3.11) |
| Node.js | 20+ (solo para compilar el frontend) |
| FFmpeg | Build completa con `libx264`, `libass`/`ass`, `xfade`, `zoompan`, `loudnorm` |
| Disco | 8 GB libres recomendados |
| Opcional | `faster-whisper` para transcribir letras |
| Opcional | `yt-dlp` para importar YouTube con derechos |

En Windows, una build completa de FFmpeg: <https://www.gyan.dev/ffmpeg/builds/>. Añade su carpeta `bin` al `PATH` y comprueba con `ffmpeg -version`.

## Instalación rápida (Windows)

1. Instala Python 3.12 y Node.js 20+.
2. Instala FFmpeg y añádelo al `PATH`.
3. Doble clic en `setup.bat`.
4. Doble clic en `run.bat`.

`run.bat` compila la interfaz si hace falta, arranca FastAPI en `http://127.0.0.1:8000` y abre el navegador. La documentación interactiva de la API está en `http://127.0.0.1:8000/api/docs`.

### Instalación manual

```bat
py -3.12 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

pushd frontend
npm install
npm run build
popd

backend\.venv\Scripts\python.exe scripts\doctor.py
```

Arranque:

```bat
cd backend
..\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Desarrollo con recarga

Terminal 1:

```bat
cd backend
..\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal 2:

```bat
cd frontend
npm run dev
```

Vite sirve en `http://127.0.0.1:5173` y redirige `/api` al backend.

## Uso

1. **Fuente**: crea un proyecto (o suelta un archivo y se crea solo), sube audio y vídeo, ajusta el fragmento en la onda y pulsa **Analizar ahora**.
2. **Personalizar**: elige formato, resolución, fps, calidad, encoder, número de clips y estilos. Añade o importa letras si quieres.
3. **Generando**: progreso real de FFmpeg y de las etapas de análisis. Se puede cancelar.
4. **Resultados**: reproduce cada MP4, descarga uno o toda la tanda en ZIP.
5. **Editor**: ajusta cortes en el timeline, grade/efectos, volumen y letras; guarda, previsualiza a media resolución y renderiza el MP4 final.

Los proyectos se reabren solos al volver: el último id se guarda en `localStorage`. También aparecen en **Proyectos recientes**.

### Edición y duración

Cada segmento tiene un `id` estable, así que seleccionar, mover, dividir, duplicar o borrar no depende de su posición. La duración del EDL es la **suma real de sus segmentos**: si acortas el último clip, el montaje se acorta (ripple) y ese cambio se guarda. El límite para alargar es la duración del fragmento de audio; el backend rechaza cualquier montaje que lo supere. Preview y render final usan el mismo EDL guardado; solo cambian resolución y ajustes de codificación. Un render se marca como **desactualizado** cuando su `created_at` es anterior al `edited_at` del EDL.

## Arquitectura

```
frontend/                 React + TypeScript + Vite + Tailwind + Zustand + WaveSurfer
  src/screens/            5 pantallas: Setup, Customize, Generating, Results, Editor
  src/components/         Shell, Dropzone, Waveform, Timeline, LyricsEditor, UI
  src/lib/                cliente API tipado, tipos, utilidades de edición
  src/store/              estado global y reanudación de proyecto

backend/app/
  api/                    rutas FastAPI (subida, análisis, clips, jobs, letras, render, descarga)
  core/                   configuración, rutas, FFmpeg, errores
  project/                almacenamiento JSON en projects/<id>/
  media/                  probe, master normalizado, render, miniaturas
  analysis/               audio (librosa) y vídeo (PySceneDetect + OpenCV)
  editing/                estilos, planificador de EDL, generador de versiones
  lyrics/                 ASS, presets, importación SRT/LRC, transcripción opcional
  jobs/                   trabajos asyncio, progreso, cancelación, SSE
  quality/                validación con ffprobe

projects/<id>/
  project.json            metadatos, configuración, resumen
  source/                 audio y vídeo originales
  analysis/               audio_analysis.json, scene_library.json
  master/                 un máster normalizado por formato/resolución/fps
  edits/                  un EDL JSON por clip
  lyrics/                 lyrics.json y ASS generado
  renders/                MP4 preview/final
  thumbs/                 miniaturas reales
```

### Pipeline real

1. **Subida**: se valida extensión y se hace `ffprobe`; el original se conserva.
2. **Análisis de audio**: se extrae el fragmento, se normaliza a mono y se analiza con librosa (tempo, beats, onsets, secciones). Se cachea por clave de fragmento.
3. **Análisis de vídeo**: se construye **un solo máster** normalizado (formato, resolución, fps, audio) y se detectan escenas y métricas visuales. Se cachea por clave de configuración.
4. **Planificación**: cada estilo genera un EDL con cortes anclados a beats/onsets, selección de escenas por movimiento/calidad y transiciones. Las versiones usan semillas distintas.
5. **Render**: por cada clip se compone un filtergraph, se aplican grade/efectos, se queman letras ASS si están activas y se codifica H.264/AAC. El progreso se lee de `ffmpeg -progress pipe:1`.
6. **Validación**: ffprobe comprueba duración, resolución, fps, códec y decodificación completa. Solo entonces el render aparece como listo.

No hay barras simuladas ni datos inventados: si un análisis o render falla, se muestra el error real.

## API principal

Prefijo `/api`. Documentación completa en `/api/docs`.

| Método | Ruta | Uso |
|---|---|---|
| POST | `/upload/audio` | Subir audio |
| POST | `/upload/video` | Subir vídeo |
| POST | `/audio/analyze` | Analizar fragmento de audio |
| POST | `/video/analyze` | Crear máster y analizar vídeo |
| POST | `/project/create` | Crear proyecto |
| POST | `/project/configure` | Guardar configuración |
| POST | `/clips/generate` | Generar N clips |
| GET | `/jobs/{job_id}` | Estado de un trabajo |
| POST | `/jobs/{job_id}/cancel` | Cancelar |
| GET | `/jobs/{job_id}/events` | SSE de progreso |
| GET | `/lyrics/{project_id}` | Leer letras |
| POST | `/lyrics/update` | Guardar letras/estilo |
| POST | `/lyrics/transcribe` | Transcribir (opcional) |
| POST | `/render` | Render preview/final de un EDL |
| GET | `/renders/{render_id}` | Metadatos del render |
| GET | `/download/{render_id}` | Descargar MP4 |
| POST | `/download/zip` | Descargar varios en ZIP |
| GET | `/system/capabilities` | FFmpeg, filtros, disco, extras |

## Estilos y letras

Estilos incluidos: `cinematic`, `dynamic`, `beat_sync`, `fast_cuts`, `smooth`, `emotional`, `flash`, `modern`, `minimal`, `experimental`.

Cada estilo define ritmo de corte, duración mínima/máxima de plano, transición, grade, efectos permitidos y pesos de selección. El editor solo permite efectos dentro del estilo; el backend revalida el EDL al guardar.

Las letras se guardan en `projects/<id>/lyrics/lyrics.json` y se convierten a ASS con animaciones reales. Si `lyrics.enabled` está activo, se queman en preview y final.

## Opcionales

```bat
:: Transcripción local de letras
backend\.venv\Scripts\python.exe -m pip install faster-whisper

:: Importación YouTube (solo material autorizado)
backend\.venv\Scripts\python.exe -m pip install yt-dlp
```

QSV se detecta automáticamente. Si `h264_qsv` falla, el render reintenta con `libx264` sin perder el trabajo.

## Problemas frecuentes

- **“FFmpeg no encontrado”**: instala una build completa y reinicia la terminal para refrescar el `PATH`.
- **Las letras no se queman**: tu FFmpeg no tiene `ass`/`subtitles`. Usa una build `full`.
- **“No se pudo conectar con el servidor local”**: el backend no está arrancado o el puerto 8000 está ocupado. Cambia `MCS_PORT` o usa `run.bat`.
- **El análisis tarda**: PySceneDetect y OpenCV recorren el vídeo real. Usa fragmentos más cortos o menor resolución.
- **El render es lento**: baja a 720p, calidad “Rápida” o usa QSV si tu CPU lo soporta.
- **Falta espacio**: cada proyecto guarda fuentes, máster y renders. Borra proyectos antiguos de `projects/`.
- **Trabajos perdidos al reiniciar**: los jobs viven en memoria; los EDLs, análisis y renders ya escritos se conservan.

## Privacidad y derechos

- No se sube nada a Internet durante el análisis, la generación ni el render.
- La importación de YouTube es opcional y exige confirmar que tienes derechos. La app no aloja ni distribuye contenido de terceros.
- Usa música y vídeo propios, con licencia o con permiso expreso.

## Pruebas

Pruebas automáticas incluidas (sin dependencias extra):

```bat
:: Backend: regresiones de rutas, EDL, letras, cancelación y render
cd backend
.venv\Scripts\python.exe -m unittest discover -s tests -v

:: Frontend: helpers puros de edición (IDs, ripple, split, move, duplicate)
cd frontend
npm test
```

`npm test` compila `tests/edit.test.ts` con esbuild y lo ejecuta en Node; no necesita Vitest. El backend usa `unittest` de la biblioteca estándar.

## Estado verificado

Pruebas end-to-end realizadas con archivos reales:

- Subida de audio y vídeo desde la interfaz.
- Análisis real: 117,45 BPM, 25 beats, 2 secciones, 4 escenas, máster 608×1080.
- Generación de 2 clips (Cinematic y Dynamic) con validación ffprobe correcta.
- Edición de grade guardada en el EDL y aplicada en preview/final.
- Undo/redo del timeline y guardado.
- Selección por `id` estable, mover, dividir, duplicar, borrar y undo/redo en el timeline.
- Recorte del último segmento persistido: 12,000 s → 11,114 s; render real de 11,133 s de vídeo y 11,115 s de audio (sincronizados, validado con ffprobe).
- Render crossfade verificado: 12,000 s de vídeo y 12,000 s de audio.
- Preview real desde el editor con el mismo EDL guardado, sin falsos abortos y sin errores 404.
- Nombres de archivo de render únicos por id: un render heredado y uno nuevo del mismo clip ya no comparten archivo.
- Badge de render desactualizado comparando `edited_at` del EDL con `created_at` del render.
- Letra “Sin mirar atrás” guardada, quemada en preview y final (frame verificado).
- Descarga individual y ZIP (1,5 MB) desde la interfaz.
- Reanudación automática del proyecto tras recargar.
- 14 pruebas de regresión de backend y 13 de frontend en verde.

La arquitectura detallada, decisiones y contratos JSON están en [`docs/FASE-1-ARQUITECTURA.md`](docs/FASE-1-ARQUITECTURA.md).
