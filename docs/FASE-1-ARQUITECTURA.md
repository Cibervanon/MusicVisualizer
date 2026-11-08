# AI MUSIC CLIP STUDIO — FASE 1: ARQUITECTURA Y PLAN DEFINITIVO

> Documento de planificación. **No hay código de aplicación todavía.**
> Estado: pendiente de aprobación del usuario para pasar a Fase 0/2.
> Fecha: 2026-11-04. Proyecto: `C:\Users\W10\Pictures\MUSICVISUALIZER`.

---

## 1. RESUMEN EJECUTIVO

Producto: estudio **local, gratuito y sin registro** que convierte una canción + material
visual en **N clips musicales finales** (MP4) con cortes sincronizados, letras animadas y
estilos de montaje distintos entre sí.

Dos modos:
- **AUTO STUDIO** (principal): canción → fragmento → vídeo(s) → "10 versiones" → resultados.
- **CREATIVE STUDIO** (secundario): editor por clip (timeline, cortes, letras, efectos, reencuadre).

Decisiones estructurales confirmadas por medición real:
1. **Un solo análisis, N montajes.** El análisis de audio y de vídeo se hace **una vez** y se
   guarda como JSON cacheado. Las 20 versiones son solo *planes de edición* (EDL) distintos.
2. **Atomización del material visual.** El vídeo fuente se normaliza una vez a un *master*
   (aspecto/fps/resolución/pix_fmt fijos, keyframes cada 0,5 s). Cada versión se monta con
   **un único comando FFmpeg** con *doble seek* por segmento → sin archivos intermedios por
   segmento, precisión de fotograma, y sin volver a decodificar el vídeo entero.
3. **Render por CPU con QSV opcional.** Este equipo no tiene GPU NVIDIA/AMD; sí tiene
   `h264_qsv` (iGPU Intel) verificado. Default: CPU `libx264` con 3 renders en paralelo.

---

## 2. EVIDENCIA VERIFICADA DEL ENTORNO

Todo lo de esta tabla se **ejecutó** en este equipo, no se asumió.

| Comprobación | Comando / método | Resultado real |
|---|---|---|
| SO / shell | — | Windows, Git Bash (MSYS), 8 núcleos lógicos |
| Disco | `df -h /c` | 476 G totales, **26 G libres (95 % usado)** ⚠️ |
| FFmpeg | `ffmpeg -version` | **9.0.2 full build** |
| Subtítulos | filtros `subtitles`, `ass` | presentes (libass) |
| Efectos clave | `rgbashift`, `chromashift`, `gblur`, `noise`, `tmix`, `colorlevels`, `colorchannelmixer`, `curves`, `vignette` | **todos presentes** |
| Movimiento | `zoompan`, `xfade`, `minterpolate` | presentes |
| Audio | `atempo`, `rubberband`, `loudnorm` | presentes |
| HW | `vpp_qsv`, `scale_qsv`, `hwupload`, `hwdownload` | presentes |
| Encoders CPU | `libx264`, `libx265`, `libvpx-vp9` | OK |
| Encoders HW | bucle de prueba real | **`h264_qsv` OK, `h264_mf` OK**, `h264_nvenc`/`hevc_nvenc`/`h264_amf` **FALLAN**, no hay `nvidia-smi` |
| Velocidad CPU real | `testsrc 1080p30`, 300 fotogramas, x264 | `-preset veryfast -crf 20` → **5,31 s** (~57 fps); `-preset medium` → **7,89 s** (~38 fps) |
| Python | `py -3.12 --version` | 3.12 disponible (también 3.10/3.11/3.14; **se usará 3.12**) |
| Wheels cp312 win_amd64 | `pip download --only-binary=:all:` | numba 0.68.1, numpy 2.5.4, scipy 1.18.1, librosa 1.0.0, soundfile 0.14.0, opencv-python-headless 5.0.0.93, **opencv-contrib 5.0.0.93 (cp37-abi3)**, fastapi 0.162.0, pydantic 2.14.2, uvicorn 0.54.0, python-multipart 0.0.33, pillow 13.0.0, scenedetect 0.7.2, faster-whisper 1.2.1, ctranslate2 4.8.5, av 19.0.2, whisperx 3.8.6, demucs 4.1.0, yt-dlp 2026.10.26, aiofiles 25.1.0, orjson 3.13.0 → **todos con wheel, sin compilar** |
| yt-dlp | `yt-dlp --version` | 2026.02.21 ya instalado en el sistema |

Consecuencias directas:
- Sin GPU dedicada → **CPU x264 es el camino crítico**; QSV se ofrece como opción "rápido".
- 26 G libres → el render debe trabajar **en streaming** y limpiar temporales; los *proxies* y
  masters se borran o se marcan como desechables. Se avisará si un proyecto necesita más espacio.
- Python 3.12 fijado con `backend/.venv` (los wheels anteriores son de 3.12).

---

## 3. AUDITORÍA DE REPOSITORIOS (licencias y reutilización)

Método: clonado real de 3 repos y lectura de su código; para el resto, README + metadatos de
licencia de la API de GitHub + documentación oficial. **Marcado explícitamente lo que NO he leído.**

| # | Repositorio | Licencia | Estado | ¿Inspeccionado? | Decisión |
|---|---|---|---|---|---|
| 1 | `alanhuang67/beatcut` | **AGPL-3.0-or-later** | activo | README | **Solo ideas.** No se copia código (AGPL contagia al producto) |
| 2 | `Merserk/BeatSync-Engine` | **AGPL-3.0** | 75★, pushed 2026-07-06 | **código leído** (`stage4_select.py`) | **Solo ideas/algoritmo.** Reimplementación propia desde cero |
| 3 | `ZiadAbdelKarim/beat-synced-edit` | **MIT** ✅ | pequeño | **código leído** (`plan_edit.py`, `render_edit.py`) | **Reutilizable.** Patrones y estructuras legalmente adoptables (con atribución) |
| 4 | `6Morpheus6/MusicVideoCutter` | **sin licencia** ❌ | 6★, 2025-10-11 | **código leído** | **No se usa nada.** Sin licencia = todos los derechos reservados |
| 5 | `interrupt21h/tubeviz` | **Apache-2.0** ✅ | 3★, creado 2026-08-21, muy nuevo | README/metadatos | Idea de flujo audio→beats→clips; artefacto nuevo, no se integra como dependencia |
| 6 | `Breakthrough/PySceneDetect` | **BSD-3-Clause** ✅ | v0.7.2, maduro | README + API de detectores | **Dependencia real** (`scenedetect`) |
| 7 | `WyattBlue/auto-editor` | **Unlicense / dominio público** ✅ | maduro | README | **Solo ideas de rendimiento**; escrita en Nim, no es biblioteca Python |
| 8 | `m-bain/whisperX` | **BSD-2-Clause** ✅ | muy activo | README + licencia | **No en el instalador por defecto** (arrastra torch + pyannote). Solo ideas de alineación; ver §9 |
| 9 | `google/fonts` | Repo Apache-2.0; **cada familia tiene su licencia** | — | **NO inspeccionado aún** | Pendiente de verificación familia por familia en Fase 7 (previstas: OFL) |
| 10 | `Zulko/moviepy` | **MIT** ✅ | mantenimiento irregular | README | **Descartado como motor** (lento y opaco frente a invocar FFmpeg directamente) |
| 11 | `remotion-dev/remotion` | **Licencia propia**: gratis para individuos/empresas pequeñas, **de pago para empresas** | — | README de licencia | **DESCARTADO**: el usuario exige cero dependencias comerciales inesperadas |
| 12 | `librosa/librosa` | **ISC** ✅ | 8,8k★, activo | docs de API | **Dependencia real** (beats, tempo, onsets, energía, decomposición espectral) |

Proyectos de beats con pesos de modelo local:
- **`CPJKU/beat_this`**: código **MIT** y **pesos publicados** (también MIT). Detección de
  *beat* y *downbeat* de estado del arte, mucho mejor que el `beat_tracker` clásico en música
  real. Modelo pequeño ~8 MB y grande ~78 MB, descarga directa. Requiere `torch` (CPU) + `einops`.
  → **Se integra como motor de beats preferente, con librosa como respaldo sin torch.**

### 3.1 Qué se aprovecha de cada uno, concretamente

**`beat-synced-edit` (MIT) — base conceptual del EDL.** De su código se adoptan, reescribiéndolos
como módulos propios:
- El **contrato del EDL**: cada corte = `{timeline_start, timeline_end, clip_source, clip_start,
  clip_end, beat_type}`. Un EDL es un array de estos objetos → serializable a JSON, cacheable,
  re-renderizable.
- **Anti-repetición por distancia mínima en el material fuente** (`MIN_SOURCE_GAP = 15 s`):
  nunca se reutiliza la misma zona del vídeo antes de 15 s de tiempo musical.
- **Muestreo desde el centro del plano**: el segmento elegido se toma centrado en la escena,
  porque el inicio/fin de las escenas suele tener movimiento basura.
- **Filtro de casi-negro** (`MIN_BRIGHTNESS = 0.04`) y **recorte por siguiente beat** (un plano
  nunca sobrepasa el beat siguiente si el plano es más largo que el hueco).
- **Estructura de render por segmentos + concat demuxer + mux de audio**, y **limpieza de
  temporales** al terminar.
- Lo que **se mejora**: su render re-codifica cada segmento con `-preset slow` (carísimo) y sin
  transiciones ni progreso. Nuestro diseño evita intermedios y añade progreso real.

**`BeatSync-Engine` (AGPL — solo algoritmo, código propio nuevo).** Sus ideas son las que dan
el salto de "corto cada dos segundos" a "edición con criterio":
- **Paso adaptativo en beats** (`step ∈ {1,2,4,8}`) según la energía y el tipo de sección:
  intro → 4-8 beats por plano; drop → 1 beat. Nada de densidad constante.
- **`min_interval` según la forma de onda** y **`max_hold` según la sección**: suelo y techo de
  duración de plano dependientes de la música.
- **Bonus por anclaje a compás/frase** en la elección de cada corte (caer "a tiempo" con la
  estructura pesa más que caer en el beat crudo).
- **Micro-cortes raros**: medio beat solo en impactos enormes (evita el ruido de cortes).
- **Limpieza global con tope de ratio de cortes** (`target_cut_ratio_min/max`) → evita montajes
  absurdamente troceados y garantiza que cada estilo tenga una densidad coherente.
- **Puntuación ponderada** multicriterio con pesos por estilo.

**`PySceneDetect`**: detección de cortes de escena (detectores `ContentDetector`,
`AdaptiveDetector`, `ThresholdDetector`) sobre vídeo decodificado por FFmpeg → esto produce la
materia prima de la **SceneLibrary**.

**`librosa`**: `beat_track`, `onset_strength`, `onset_detect`, `tempo`, `rms`/`spectral_flux`,
bandas (kick/bass/snare/hats vía energía por rango), `effects.split` para estimar secciones.

**`auto-editor`**: su idea de *"decodificar lo mínimo posible y muestrear"* se aplica al análisis
visual (no analizamos 30 fps completos; muestreamos y extendemos).

**`whisperX`**: su técnica (transcripción Whisper + **alineación forzada** a nivel de palabra con
modelo wav2vec2) es la que da el karaoke por palabra. Se implementa como **módulo opcional**.

---

## 4. STACK DEFINITIVO

**Frontend** — React 18 + TypeScript + Vite + Tailwind CSS + Lucide React + Zustand.
Forma de onda: **WaveSurfer.js** (`regions` plugin para selección de fragmento con arrastre).
Sin librerías de gráficos extra; el timeline se dibuja con Canvas/SVG propio (control total).

**Backend** — Python 3.12 + FastAPI + Pydantic v2 + Uvicorn. Sin base de datos: el estado del
proyecto vive en `projects/<id>/project.json`. Sin auth, sin servicios externos.

**Procesamiento** — FFmpeg (subproceso, motor de todo), OpenCV (headless **+ contrib** para
`cv2.saliency`, útil en reencuadre), NumPy, librosa, PySceneDetect, soundfile, Pillow.

**Opcionales (no en el instalador base)** — `torch`+`beat_this` (beats de calidad),
`faster-whisper` (letras), `whisperx`/`demucs` (karaoke fino y separación de voz).

**Descartado y por qué**:
| Tecnología | Motivo del descarte |
|---|---|
| Remotion | Licencia condicionada a tamaño de empresa → dependencia comercial |
| MoviePy | Envoltorio de FFmpeg más lento y difícil de instrumentar para progreso real |
| Cualquier API de IA en la nube | Requiere claves/créditos; el requisito es local |
| WhisperX/pyannote en el instalador base | ~2-3 GB de torch + modelos; sin GPU. Se ofrece como extra |
| Bases de datos remotas / auth / pagos | Explícitamente prohibidos |

**Progreso real, nunca simulado**: el render envía `-progress pipe:1` a FFmpeg y parsea
`out_time_us`, `frame`, `speed`, `fps`; el porcentaje se calcula contra la duración conocida del
clip. Las fases de análisis reportan progreso **por etapa con pesos conocidos** (p. ej. 8 %
decodificar, 35 % onsets…), y se etiquetan como "etapa" en la UI, no como porcentaje inventado.

### Comunicación frontend ↔ backend
- **HTTP JSON** para todo lo transaccional (subidas, configuración, generación, render, descarga).
- **SSE** (`GET /api/jobs/{id}/events`) para progreso y logs en vivo (unidireccional, reconexión
  sencilla, con *fallback* a `GET /api/jobs/{id}` por sondeo). Cancelación por `POST`.
- Los archivos se sirven con `Range` para permitir `seek` en los reproductores.

---

## 5. ARQUITECTURA DE MÓDULOS

```
MUSICVISUALIZER/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI, routers, CORS local, montaje de estáticos
│   │   ├── api/                    # routers: upload, project, analyze, clips, jobs, lyrics, render, download
│   │   ├── core/                   # config.py, paths.py, errors.py, logging.py, ffmpeg.py, progress.py
│   │   ├── models/                 # esquemas Pydantic + dataclasses de dominio (EDL, BeatGrid, Scene)
│   │   ├── analysis/               # AudioAnalyzer, VideoAnalyzer, SceneLibrary, analysis_cache
│   │   ├── editing/                # BeatMapGenerator, EditPlanner, MultiVersionGenerator, styles/
│   │   ├── media/                  # MasterBuilder, SmartCropEngine, EffectsEngine, RenderEngine, ffmpeg graph builders
│   │   ├── lyrics/                 # LyricsEngine (manual/SRT/LRC/ASR), align, ASSBuilder, TypographyEngine
│   │   ├── jobs/                   # BatchQueue, JobStore, cancellation, resource governor
│   │   ├── quality/                # QualityValidator (ffprobe, blackdetect, freezedetect, loudness)
│   │   └── project/                # ProjectManager (crear/abrir/limpiar, retención de temporales)
│   ├── tests/                      # pruebas por módulo
│   └── requirements.txt / requirements-optional.txt
├── frontend/
│   └── src/{components,pages,editor,timeline,audio,video,lyrics,hooks,stores,services,lib,styles}
├── projects/<project_id>/          # source/, analysis/, edits/, renders/, thumbs/, project.json
├── assets/fonts/                   # fuentes OFL verificadas
├── docs/
├── scripts/ (run.bat, setup.bat, doctor.py)
└── README.md
```

Responsabilidades (los 14 módulos exigidos, sin solapamiento):

| Módulo | Entrada | Salida | Responsabilidad única |
|---|---|---|---|
| `AudioAnalyzer` | WAV del fragmento | `audio_analysis.json` | beats, downbeats, tempo, onsets, energía global y por bandas, secciones, drops |
| `VideoAnalyzer` | máster normalizado | `video_analysis.json` | muestreo de fotogramas, brillo, nitidez, movimiento, estabilidad |
| `SceneLibrary` | cortes de escena + análisis | `scene_library.json` | lista de *átomos visuales* con metadatos y calidad |
| `BeatMapGenerator` | `audio_analysis.json` | `beat_grid.json` | beats a compás/frase, **tipos de sección**, envolvente de intensidad |
| `EditPlanner` | beat grid + scene library + estilo | `edl.json` | puntos de corte candidatos, puntuación, selección final |
| `MultiVersionGenerator` | EDL base + N estilos + semillas | N `edl.json` | diversidad garantizada entre versiones |
| `SmartCropEngine` | fotogramas + análisis | `crop_tracks.json` | ventana de recorte que sigue al sujeto |
| `LyricsEngine` | audio o SRT/LRC o texto | `lyrics.json` | líneas/palabras con tiempos, editable |
| `TypographyEngine` | `lyrics.json` + preset | `.ass` | composición tipográfica y animaciones reales |
| `EffectsEngine` | EDL + preset + audio | fragmentos de *filtergraph* | mapea eventos musicales a efectos FFmpeg |
| `RenderEngine` | EDL + recursos | MP4 + progreso | construye y ejecuta el comando FFmpeg |
| `BatchQueue` | N EDLs | trabajos | concurrencia limitada, cancelación, reintentos |
| `QualityValidator` | MP4 | `validation.json` | comprobaciones objetivas del resultado |
| `ProjectManager` | — | carpetas/JSON | ciclo de vida, hashes de caché, limpieza |

### Contratos de datos (JSON versionados en `projects/<id>/analysis/`)

Todos incluyen `schema_version` y `cache_key` (hash de: ruta + tamaño + mtime + parámetros de
análisis + versión del código de análisis). Si un parámetro de análisis cambia, el hash cambia y
solo se rehace lo afectado.

```jsonc
// audio_analysis.json
{ "schema_version":1, "cache_key":"…",
  "fragment": {"source_id":"…", "start":106.0, "end":136.0, "sample_rate":48000},
  "tempo": {"bpm":128.4, "confidence":0.87, "meter":4},
  "beats": [{"t":0.47,"index":1,"is_downbeat":false,"strength":0.62,"bands":{"kick":0.8,"bass":0.5,"snare":0.2,"hat":0.1}}],
  "onsets": [0.47, 0.94],
  "energy": {"hop":0.05, "rms":[…], "flux":[…], "band_kick":[…], "band_snare":[…], "band_hat":[…], "band_bass":[…]},
  "sections": [{"start":0.0,"end":4.2,"label":"intro","intensity":0.18,"confidence":0.7}],
  "events": [{"t":12.4,"type":"drop","strength":0.95},{"t":6.1,"type":"energy_up","strength":0.6}],
  "analysis_engine": {"beats":"beat_this|librosa", "sections":"heuristic_v1"} }
```

```jsonc
// scene_library.json  (átomos visuales)
{ "schema_version":1, "cache_key":"…", "master":"master_1080x1920.mp4",
  "fps":30, "duration":214.6,
  "scenes": [{ "id":"s001", "start":12.4, "end":16.9, "duration":4.5,
    "sample_center":14.65,
    "motion":0.42, "brightness":0.51, "sharpness":0.63, "stability":0.71,
    "colorfulness":0.38, "faces":0.0, "saliency_center":[0.48,0.44],
    "tags":["medium","moving"], "quality":0.74 }],
  "usable_range": [0.0, 14.2] }
```

`project.json` guarda: fuentes, fragmento, configuración de generación, lista de versiones
generadas (con su `edl.json`), estado de análisis, y **referencias** a renders + validaciones.

---

## 6. MOTOR DE EDICIÓN

### 6.1 Pipeline (una vez por canción, reutilizado por todas las versiones)

1. **Preparación de audio** — se extrae el fragmento exacto (`-ss`/`-t` con re-muestreo a 48 kHz,
   mono para análisis + un WAV *master* para mux) en `analysis/audio/`.
2. **Beats y downbeats** — `beat_this` (si está instalado) o `librosa.beat.beat_track` +
   `onset_strength`; los downbeats se infieren con periodicidad de compás (4/4 dominante) y
   puntuación de acentos.
3. **Envolventes** — RMS y *spectral flux* por hop; energía por banda (kick 40-120 Hz,
   bass 60-250 Hz, snare 200-4000 Hz con transitorio, hats 6-12 kHz) → cada beat hereda su
   vector de bandas.
4. **Secciones** — segmentación por novedad espectral (matriz de auto-similitud + *checkerboard*
   ligero) → etiquetas heurísticas `intro / verse / build / drop / chorus / breakdown / outro`
   según intensidad relativa y tendencia; **umbr. > 0,6 de confianza** o etiqueta neutra.
5. **Nodos musicales** — lista de *eventos* que el motor usará como anclas: beat fuerte, downbeat,
   cambio de sección, *drop*, subida de energía, silencio/pausa, final de frase.
6. **Análisis visual** → *SceneLibrary* (una vez por vídeo, §7).

### 6.2 Planificación de un montaje (por versión)

```
para cada sección musical:
    duración_de_plano_objetivo = f(estilo, intensidad, tipo_de_sección)
    paso_en_beats = elegir_paso(duración_objetivo, bpm, tipo_sección)   # 1,2,4,8,16
    para cada beat candidato (paso)
        puntuar_corte(beat, plano_actual, historia)
        elegir el mejor candidato dentro de ±tolerancia (sin pasarse del paso siguiente)
    aplicar suelo (min_interval) y techo (max_hold) según intensidad
    inyectar micro-cortes solo si impacto extremo y no rompe el suelo
limpieza_global: respetar ratio_cortes_min/max y coherencia de duración objetivo
validación: duraciones reales disponibles, sin cortes fuera del rango útil, sin planos repetidos a < 15 s
```

**Puntuación de un punto de corte** (todos los términos normalizados 0-1; pesos por estilo):

| Término | Cómo se calcula |
|---|---|
| `beat_alignment` | 1 en beat exacto; decae con la distancia temporal al beat (y bonus por downbeat/compás/frase) |
| `scene_change` | 1 si en esa posición hay un corte de escena del material; alto si el corte coincide con el corte visual |
| `musical_energy` | energía del evento musical en ese instante (kick/snare/drop) |
| `visual_motion` | movimiento del átomo visual elegido, comparado con el deseado por la sección (más movimiento en drop) |
| `visual_quality` | nitidez + luminosidad + estabilidad + color del átomo |
| `diversity` | penaliza reutilizar los mismos átomos; bonus a variedad de tamaños/etiquetas |
| `continuity` | bonus a *match cut* (átomo con brillo/composición similar al anterior) y a cambios deliberados de escala |

`score = 0.30·beat + 0.20·scene + 0.15·motion + 0.15·quality + 0.10·diversity + 0.10·energy`
como punto de partida, **con pesos distintos por estilo** y todos editables desde el editor
(se guardan dentro del EDL para que un re-render reproduzca exactamente el mismo resultado).

### 6.3 Las 10 estrategias por defecto

N genera estilos en este orden (si N > 10 se combinan los 10 con variaciones de semilla y
parámetros de densidad). Cada estilo = preset declarativo (JSON) con parámetros de montaje,
reencuadre, transiciones y efectos. **No son el mismo vídeo con otro color.**

| # | Estilo | Plano típico | Transiciones | Efectos |
|---|---|---|---|---|
| 01 | **Cinematic** | 2-4 compases, planos largos | *crossfade*, *light leak* en cambios de sección | *grade* teal/orange suave, *vignette*, grano fino, *letterbox* opcional |
| 02 | **Dynamic** | 1-2 beats, medio | *hard cut* siempre, flashes en snare | *punch in* en cada corte, saturación + |
| 03 | **Beat Sync** | 1 beat exacto, groove | *hard cut* exclusivamente | sin filtros extravisivos; micro *camera shake* en kick |
| 04 | **Fast Cuts** | ½-1 beat, corto | *hard cut* + *whip* en cambios de sección | *speed ramp* 1,5×, *motion blur* en transición |
| 05 | **Smooth** | 4-8 beats, largo | *crossfade* largo (0,6-1,2 s) | *zoom* lento continuo, sin grano, colores suaves |
| 06 | **Emotional** | 3-6 compases | *crossfade* lento o *dip to black* en *breakdown* | desaturación parcial, *bloom*, grano visible |
| 07 | **Flash Transitions** | 1-2 beats | *flash* blanco/color a cada impacto | *RGB split* de 3 fotogramas, sobre-exposición puntual |
| 08 | **Modern Music Video** | mixto 2-8 beats | *mix*: *crossfade* en verso, *hard cut* en drop | *grade* contrastado, *film grain*, *punch in* selectivo |
| 09 | **Minimal** | 4-8 beats | *hard cut* limpio | sin efectos; solo escala/crop; tipografía protagonista |
| 10 | **Experimental** | muy variable, sigue eventos | *match cut*, *speed ramp*, inversión de orden ocasional | *RGB split*, *glitch* de un fotograma, *zoom* abrupto |

Cada estilo declara además: densidad objetivo (`cuts_per_second` min/max), rango de duración de
plano, uso de reencuadre dinámico, y qué efectos están prohibidos (coherencia visual).

### 6.4 Diversidad garantizada entre versiones

- Semilla por versión derivada de `hash(project_id, version_index, style)` → **reproducible**.
- **Exclusión de átomos**: cada versión tiene preferencia por átomos no usados por las anteriores
  (penalización acumulativa en `diversity`), con reintroducción permitida al agotar el material.
- **Desfase de secciones**: versiones diferentes no empiezan el mismo plano en el mismo beat.
- **Comprobación automática de similitud**: calculamos la *distancia* entre dos EDLs (Jaccard de
  átomos + diferencia de duración media de plano + diferencia de transiciones). Si dos versiones
  son demasiado parecidas (< umbral), se regenera la segunda con otra semilla. Esto evita
  entregar 10 clones.
- **Modo alternativo: división consecutiva**, para fragmentos largos (p. ej. 3 min en 6 partes de
  30 s), con cortes limpios en límites de frase musical.

---

## 7. GENERAR 20 CLIPS SIN REANALIZAR NADA

Esta es la respuesta directa al requisito de rendimiento masivo.

### 7.1 Análisis único y cacheado

El análisis nunca depende del número de clips. Depende solo de:
`(archivo, tamaño, mtime, parámetros de análisis, versión del analizador)` → **hash**. Si el hash
coincide, `AudioAnalyzer`/`VideoAnalyzer` no se ejecutan: se carga el JSON.
Cambiar "número de clips", "estilo" o "duración" **no invalida** el análisis; cambiar el
"fragmento" sí invalida el análisis de audio (pero **nunca** el visual del vídeo fuente).

### 7.2 Atomización del material visual (la clave del rendimiento)

1. **`MasterBuilder`** (una vez por vídeo fuente): normaliza el vídeo al destino real de la
   mayoría de renders. Salida: `master/<w>x<h>_<fps>.mp4`, x264 `-crf 16`, `-g 15` (keyframe cada
   0,5 s), `-pix_fmt yuv420p`, audio descartado. Es la única vez que se decodifica el vídeo entero.
2. **`SceneLibrary`**: los átomos son **cortes de escena del máster**, no fotogramas aleatorios.
3. **Cada versión** se renderiza con **un solo comando FFmpeg** que toma el máster N veces con
   *doble seek* (`-ss (t-preroll) -i master -ss preroll -t dur` = búsqueda rápida + corte exacto
   al fotograma) y encadena los segmentos en un `filter_complex` (`trim`, `setpts`, `concat`,
   `xfade`). Sin archivos intermedios, sin 30 procesos, sin re-decoding completo del original.

   Consecuencia medida: el trabajo pesado repetido es **solo la codificación de la salida**
   (la parte que ya medimos: ~38-57 fps a 1080p en CPU), no la decodificación del material.

### 7.3 Planificación por lotes

- `MultiVersionGenerator` produce N `edl.json` **antes** de renderizar (baratísimo: milisegundos).
  Esto permite mostrar las N versiones planificadas y cancelar/reordenar sin coste.
- `BatchQueue` ejecuta renders con **3 ranuras en paralelo** por defecto (8 núcleos; se puede
  subir a 4 con QSV). El *governor* de recursos mide carga y número de encodes activos y no
  permite saturar la máquina (la UI sigue respondiendo).
- **Reutilización entre versiones**: si dos versiones comparten exactamente los mismos átomos en
  la misma secuencia (caso raro, detectado antes de renderizar), se copia el MP4 en lugar de
  re-renderizar.
- **Cancelación real**: se registra el PID de cada FFmpeg y se envía terminación; el *job* queda
  en estado `cancelled` y los temporales se borran.
- **Reanudación**: los renders completados se conservan; al reabrir un proyecto solo se renderizan
  las versiones pendientes o modificadas (*dirty flag* en el EDL).
- **Regenerar una sola versión** o **un solo segmento** no reanaliza ni re-renderiza el resto.

### 7.4 Estimaciones honestas (a validar en Fase 9)

Basado en la medición de 1080p30 en este equipo (~57 fps `veryfast`, ~38 fps `medium`):

| Trabajo | Estimación |
|---|---|
| Análisis de 30 s de audio (librosa) | 5-15 s |
| Análisis de audio con `beat_this` CPU | 15-40 s |
| Análisis visual de 3 min de vídeo (muestreo 4 fps + escenas) | 20-60 s |
| Master 1080p de 3 min (`veryfast`, crf 16) | ~1,5-3 min |
| **Un clip de 30 s a 1080p**, efectos + subtítulos | **~25-60 s** según estilo y CPU/HW |
| **10 clips** con 3 ranuras en paralelo | **~2-5 min** (tras análisis y máster) |

Se insistirá en la UI con un "modo rápido" (720p, `veryfast` o QSV) y un "modo máxima calidad"
(1080p/1440p, `medium`, 2 pasadas de *denoise* opcional). Los números reales se medirán con
archivos de prueba y se publicarán en el README; no se prometen velocidades.

---

## 8. MOTOR DE RENDERIZADO

### 8.1 Grafo por versión (una sola invocación)

```
[entradas]  máster (xN, doble seek)  +  WAV del fragmento  +  lyrics.ass  +  crop_tracks.json
   ↓ trim/setpts por segmento
   ↓ transitions: hard cut = concat | xfade = crossfade | flash = overlay de color + fade
   ↓ speed ramp (setpts) si el estilo lo pide
   ↓ reencuadre: crop dinámico (sendcmd) o estático + scale/pad (9:16, 1:1, 4:5, 16:9)
   ↓ grade: colorlevels/colorchannelmixer/curves + vignette + noise (grano) + rgbashift (RGB split)
   ↓ punch in/out: zoompan
   ↓ ass=lyrics.ass       (tipografía con animaciones reales, quemada)
   ↓ x264 (-crf 18-20, -preset veryfast|medium) o h264_qsv | +faststart | yuv420p
   ↓ audio: atrim + loudnorm (I=-14 LUFS para social) + aac 192k
   ↓ MP4 final (vídeo+audio muxados en el mismo comando, `-shortest`)
```

Notas de implementación:
- Los **subtítulos van en ASS**, no en `drawtext`: un ASS generado por nosotros soporta
  `\k`/`\kf` (karaoke), `\fad`, `\t`, `\move`, `\fscx\fscy`, `\blur`, contorno y sombra sin coste
  extra de filtros. Se genera con `TypographyEngine` a partir del preset.
- **Reencuadre dinámico**: `crop` con expresiones temporales vía `sendcmd` o `crop` con expresión
  sobre `t` — seguimiento paso a paso de la posición calculada por `SmartCropEngine`.
- **Progreso real**: `-progress pipe:1 -stats_period 0.3`, parseado en `core/progress.py`.
  Se emiten eventos SSE con `out_time`, `fps`, `speed`, `bitrate` y `%`.
- **Previsualización sin render completo**: `proxies` a 480p `ultrafast` (unos segundos) para
  revisar el montaje, y render final aparte. El proxy es un MP4 real y reproducible, no una
  simulación en canvas.

### 8.2 Herramientas de efecto y su realidad

Todo efecto listado abajo está **verificado como disponible** en el FFmpeg de este equipo
(§2) o es un `setpts`/`concat` de base:

| Efecto | Implementación |
|---|---|
| Hard cut | `concat` |
| Crossfade | `xfade` |
| Flash / light leak | `overlay` de fuente de color con `fade` + `blend` |
| Whip pan | `xfade transition=slideleft/wipeleft` + *motion blur* (`tmix`/`gblur` direccional) |
| Speed ramp | `setpts=PTS/factor` + `atempo` en audio si afecta al audio |
| Slow motion | `minterpolate` (calidad) o `setpts` + `fps` (rápido) |
| Motion blur | `tmix=frames=3:weights=1 2 1` |
| Camera shake | `crop` con expresión aleatoria sembrada + `scale` |
| Punch in/out | `zoompan` |
| Zoom dinámico | `zoompan` con rampa |
| Glow / bloom | `gblur` + `blend=screen` |
| Film grain | `noise=alls=6:allf=t+u` (intensidad por estilo) |
| RGB split | `rgbashift` / `chromashift` |
| Color grading | `colorlevels`, `colorchannelmixer`, `curves`, `eq` |
| Cine contrast | `curves` + `colorlevels` |
| Vignette | `vignette` |
| Letterbox | `pad` |

Regla de coherencia: cada estilo declara su lista blanca de efectos (**Minimal** no usa grano ni
*flicker*, **Smooth** no usa *hard cuts* en exceso, etc.), y `EffectsEngine` se niega a aplicar un
efecto no listado en su preset.

---

## 9. LETRAS Y TIPOGRAFÍAS

Tres modos de entrada, siempre editables y **nunca presentados como exactos**:

1. **Manual** — pegar letra y pulsar "distribuir" o marcar tiempos con la barra espaciadora
   mientras suena el fragmento (tapping, sincronización por oído muy rápida).
2. **Importar SRT / LRC** — parseo real, normalizado a nuestro `lyrics.json`.
3. **Transcripción automática** — dos niveles:
   - *Nivel ligero* (por defecto, `faster-whisper`): `large-v3` en `int8` CPU o `small`/`medium`
     según RAM. Da tiempos por **frase**, no por palabra. Aviso explícito en la UI: en música con
     voz cantada la transcripción falla; se ofrece escuchar y corregir.
   - *Nivel fino* (opcional, extra de ~2-3 GB): `demucs` (separar voz) + `whisperX`
     (alineación forzada) → tiempos por **palabra** para karaoke real.
   - Alternativa incluida sin instalación extra: el filtro **`whisper`** de FFmpeg (whisper.cpp)
     presente en este build, útil para letra de habla; se probará antes de exponerlo en la UI.

`lyrics.json` guarda líneas y palabras con `start`/`end`, más textos alternativos y "bloqueado"
por el usuario, para que una re-transcripción no pise correcciones.

### Estilos y animaciones (todos renderizables en MP4 vía ASS)

Biblioteca inicial: Minimal White, Cinematic, Karaoke, Bold Lyrics, Neon, Retro, Elegant Serif,
Modern Pop, Glow, Minimal Captions, Dynamic Word Highlight.
Animaciones de entrada/salida: Fade, Slide Up/Down, Scale, Pop, Word by Word, Karaoke Highlight,
Typewriter, Blur In, Bounce, Smooth Reveal.

Mapeo a ASS (sin sorpresas): `Fade` → `\fad`; `Slide` → `\move`; `Scale`/`Pop` → `\t(\fscx,\fscy)`;
`Typewriter` → eventos por carácter o por palabra incrementales; `Karaoke`/`Highlight` → `\k`,
`\kf`, `\1c`/`\2c` con `\t`; `Blur` → `\blur`; `Bounce` → `\t` con curva; `Smooth Reveal` →
`\fad` + `\t(\alpha)`. Se controla `\an`, `\pos`, `\fs`, `\bord`, `\shad`, `\blur`, `\spacing`,
`\alpha`, alineación, y **zona segura 9:16** (nada de letras bajo los iconos de TikTok).

**Fuentes**: se empaquetarán familias OFL (previstas Inter, Anton, Bebas Neue, Montserrat,
Poppins, Oswald, Playfair Display) **verificando la licencia de cada familia una por una en la
Fase 7** antes de incluirlas; el repo `google/fonts` no lo he inspeccionado todavía y no lo doy
por válido.

---

## 10. REENCUADRE INTELIGENTE (SmartCropEngine)

Objetivo: horizontal → 9:16 manteniendo el sujeto en el encuadre, no un cruce central ciego.

Método en cascada, de lo barato a lo caro (y todo local):
1. **Análisis de saliencia** (`cv2.saliency` — requiere `opencv-contrib`, wheel verificado) para
   localizar la región de interés de cada fotograma muestreado.
2. **Detección de caras** (clasificador Haar/DNN de OpenCV, incluido en la instalación base) para
   dar más peso a las caras que a la saliencia general.
3. **Movimiento y estabilidad** ya medidos en el análisis visual para decidir si el encuadre puede
   moverse (plano estático) o debe ser fijo y por *punch in* (plano en movimiento).
4. **Suavizado temporal** del objetivo (filtro exponencial + limitación de velocidad angular) para
   evitar un encuadre tembloroso o "persiguiendo" el sujeto sin motivo.

Salida: `crop_tracks.json` con la ventana por intervalo temporal. El EDL referencia ese archivo y
el usuario puede **forzar el encuadre manualmente** (3 presets: centrado, sujeto-izquierda,
centrado-sujeto, o arrastrar en la previsualización). Si nada de esto puede ejecutarse (modelos
no disponibles), se degrada a "crop centrado con *punch in*" y se dice en la UI.

Formatos soportados: **9:16, 1:1, 4:5, 16:9**. Para vídeo vertical nativo no se reencuadra: se
rellena con fondo desenfocado (opcional) o se recorta.

---

## 11. VALIDACIÓN DE CALIDAD (QualityValidator)

Ningún clip se declara "correcto" solo porque FFmpeg terminó con código 0:

| Comprobación | Herramienta | Acción si falla |
|---|---|---|
| Duración dentro de ±0,3 s de lo planificado | `ffprobe` | marcado + intento de recorte |
| Resolución, SAR/DAR, fps correctos | `ffprobe` | error |
| **Audio presente y sincronizado** (comparación de forma de onda del primer/último segundo) | `ffprobe` + `astats` | error |
| Fotogramas negros accidentales | `blackdetect` | aviso + se intenta reemplazar el segmento |
| Congelados no intencionados | `freezedetect` | aviso |
| Sonoridad | `loudnorm` en modo análisis | normaliza a -14 LUFS |
| Subtítulos dentro de la zona visible | validación de las cajas ASS antes de renderizar | corrige posición |
| Integridad del archivo | `ffmpeg -v error -i out.mp4 -f null -` | error |
| Puntuación de montaje (densidad, variedad, alineación, calidad media de átomos) | interna | se muestra al usuario |

Cada clip tiene además una previsualización con marca de tiempo y *thumbnail* real generado por
FFmpeg (sin *frames* de ejemplo falsos).

---

## 12. QUÉ ES 100 % LOCAL Y QUÉ NO

**Totalmente local, sin red**: análisis, montaje, letras, reencuadre, efectos, render, ZIP,
proyectos. No hay ninguna llamada a servicios de pago ni a APIs con clave.

**Requiere red (solo dos casos, ambos opcionales):**
1. **Descarga de modelos** la primera vez que se usan (`beat_this` ~8/78 MB,
   `faster-whisper` según tamaño). Después funcionan sin conexión.
2. **Fuentes de YouTube**: decisión de diseño importante (siguiente punto).

### YouTube — posición honesta

- `yt-dlp` puede **descargar el vídeo y el audio de la mayoría de URLs públicas de YouTube** hoy,
  pero eso **no significa que sea legítimo para cualquier vídeo**, y YouTube cambia cosas que
  rompen `yt-dlp` con frecuencia.
- Por eso el diseño es: **el archivo local es el camino principal y siempre funciona.**
  La importación por URL se ofrece como herramienta para material del que el usuario tenga
  derechos (propio, autorizado, licencias libres, dominio público) y la UI lo dice con claridad
  **antes** de usarla, con una confirmación explícita.
- Implementación: la URL se resuelve con `yt-dlp` **solo** si está presente; errores típicos
  (vídeo privado, restringido, DRM protegido, cambios de la plataforma) se muestran como mensaje
  real de error, **no se simula la descarga**. No se implementa evasión de restricciones ni DRM.
- El backend descarga al proyecto, extrae metadatos reales (título, autor, duración, resolución)
  para mostrar la autoría, y guarda un registro en `project.json` (`source_kind: youtube`,
  `attribution`). Documentaremos en el README que el usuario es responsable de tener derechos
  sobre ese material y de respetar los términos de la plataforma.
- Si el usuario prefiere, se puede **quitar la opción YouTube** por completo y dejar solo archivos
  locales. Es una variable de configuración, no un parche posterior.

---

## 13. LIMITACIONES TÉCNICAS QUE ACEPTAMOS (y cómo las mitigamos)

| # | Limitación | Impacto | Mitigación |
|---|---|---|---|
| 1 | **26 G libres (95 % de disco)** | Masters + renders de 10 clips 1080p pueden pedir 3-6 G | Master optimizado, proxies desechables, borrado automático tras mux, aviso de espacio antes de empezar y estimación de tamaño por trabajo |
| 2 | **Sin GPU NVIDIA/AMD** (solo `h264_qsv`/`h264_mf`) | Codificación CPU: es el cuello de botella | CPU por defecto con 3 ranuras; QSV como modo rápido; progreso real y cancelación |
| 3 | **Transcripción de voz cantada imperfecta** | Letras automáticas con errores | Aviso explícito + edición obligatoria visible + modo fino opcional (demucs+whisperX) |
| 4 | **Sin detección de caras robusta garantizada** | Reencuadre a veces centrado | Cascada de saliencia/caras + suavizado + control manual del encuadre |
| 5 | **`beat_this` requiere torch (pesado)** | Instalador más grande | Instalador base ligero (librosa); `beat_this` y ASR como extras documentados |
| 6 | **numba/numpy/opencv 5** | Incompatibilidades puntuales | Versiones **fijadas** tras probar la resolución completa en un venv 3.12 real antes de escribir código (Fase 0) |
| 7 | **Fuentes y licencias** | Riesgo legal si se empaqueta mal | Solo familias OFL verificadas una a una; atribución en README |
| 8 | **Sin multiusuario ni seguridad de red** | Es una app local | Servidor escuchando solo en `127.0.0.1`, CORS restringido, validación de rutas (sin *path traversal*) |
| 9 | **Rendimiento depende del material** | 4K de origen es lento | Aviso y recomendación de 1080p; el máster se hace a la resolución de salida, no a la de origen |
| 10 | **Movimiento interpolado (`minterpolate`) es caro** | Slow motion de máxima calidad lento | Se ofrece como opción de "máxima calidad", por defecto *slow motion* por repetición de fotogramas |

Nada de esta lista se oculta al usuario dentro de la app: los avisos viven en la propia interfaz
(capacidad de hardware detectada, espacio en disco, estado de los extras instalados).

---

## 14. PLAN DEFINITIVO DE DESARROLLO

**Fase 0 — Verificación del stack y esqueleto (bloqueante, corta)**
Crear el venv 3.12, fijar `requirements.txt` instalando de verdad, arrancar FastAPI con un endpoint
`/api/health` real y el frontend Vite con Tailwind; `scripts/doctor.py` que comprueba FFmpeg,
encoders HW, filtros, disco y extras instalados. Scripts `setup.bat` / `run.bat`.
*Aceptación*: `run.bat` abre la app y `/api/health` reporta el hardware real de este equipo.

**Fase 1 — Planificación (este documento).** *Aceptación*: aprobación del usuario.

**Fase 2 — Interfaz completa (UI real, sin lógica)**
Design system oscuro (tokens Tailwind), componentes (botones, paneles, sliders, selects, tarjetas,
progress, skeletons, toasts, modales, tooltips), las 5 pantallas con su layout, estados de carga y
error de verdad (conectados a endpoints ya existentes desde Fase 0).
*Aceptación*: navegación completa sin errores en consola, responsive ≥1280 px y 1024 px, contraste
AA, ningún botón muerto (los no implementados aparecen deshabilitados con motivo visible).

**Fase 3 — Subida y audio**
`/api/upload/audio`, validación real (MIME + `ffprobe`), reproductor, forma de onda WaveSurfer,
selección con regiones + zoom + entrada manual de tiempos al milisegundo, guardado en proyecto.
*Aceptación*: selecciono 01:46-02:16 y el WAV extraído dura 30,000 s ±1 fotograma.

**Fase 4 — Vídeo**
Subida local, importación por URL (con la política de §12), miniatura real, previsualización,
`MasterBuilder`, `VideoAnalyzer`, `SceneLibrary`, reencuadre base.
*Aceptación*: la biblioteca de escenas de un vídeo de 3 min se genera una vez y se muestra con
métricas reales (movimiento, brillo, nitidez).

**Fase 5 — Análisis musical**
`AudioAnalyzer` + `BeatMapGenerator`: BPM, beats, downbeats, bandas, energía, secciones, drops,
eventos; visualización sobre la onda y la línea de beats.
*Aceptación*: sobre 3 canciones de prueba, los beats caen a la vista sobre la onda (validación
manual) y el tempo coincide con un BPM conocido (metrónomo) ±1 BPM.

**Fase 6 — Generador (el corazón)**
`EditPlanner` + `MultiVersionGenerator` + los 10 estilos + comprobación de diversidad;
EDL visible y depurable (un inspector muestra por qué se eligió cada corte).
*Aceptación*: 10 EDLs sobre el mismo fragmento son distintos (métrica de distancia), los cortes
caen en beats y respetan suelo/techo de duración; cambiar de canción no rompe nada.

**Fase 7 — Letras**
Importar/pegar/transcribir, edición por línea y palabra, presets tipográficos, `ASSBuilder`,
animaciones; vista previa con ASS renderizado en el vídeo (proxy).
*Aceptación*: cada animación de la lista se ve **y se exporta** (comprobado con el MP4 del proxy).

**Fase 8 — Editor (CREATIVE STUDIO)**
Timeline con segmentos, arrastre de cortes, deshacer/rehacer, ajustes de vídeo/audio/letras,
regenerar un clip o un segmento.
*Aceptación*: mover un corte y re-renderizar produce exactamente lo que muestra el timeline.

**Fase 9 — Exportación**
`RenderEngine`, cola con progreso real, cancelación, proxies rápidos, modo máxima calidad,
validación, descarga individual y ZIP.
*Aceptación*: 5 clips 1080p 9:16 descargables, pasan todas las comprobaciones del `QualityValidator`
y el ZIP contiene los 5 MP4 correctos.

**Fase 10 — Pruebas y pulido**
Pruebas por módulo con archivos de prueba, casos lícitos (vídeo más corto que el fragmento, audio
mono, vídeo sin cortes de escena, material casi negro), perfilado del render, README definitivo,
documentación de módulos y `docs/ARQUITECTURA.md` final.
*Aceptación*: el flujo del §18 del encargo se completa **sin salir de la app**.

Regla transversal: **no se avanza de fase con errores críticos abiertos**, y cada fase termina con
el informe de 6 puntos (implementado / archivos / qué funciona / qué falta / cómo probar /
comandos).

---

## 15. ENDPOINTS FINALES (ampliados, coherentes con el encargo)

Del encargo, más los que el diseño necesita realmente:

```
POST /api/upload/audio                 POST /api/storage/probe        (dd libre/estimación)
POST /api/upload/video                 GET  /api/system/capabilities  (hw, filtros, extras)
POST /api/source/youtube/preflight     GET  /api/system/doctor
POST /api/source/youtube/import
POST /api/audio/analyze                POST /api/project/create
POST /api/video/analyze                POST /api/project/configure
POST /api/clips/plan                   (genera N EDLs SIN renderizar)
POST /api/clips/generate               (planifica + encola render)
GET  /api/jobs/{job_id}                GET  /api/jobs/{job_id}/events  (SSE)
POST /api/jobs/{job_id}/cancel         GET  /api/jobs
GET  /api/edits/{edit_id}              PATCH /api/edits/{edit_id}      (editar EDL)
POST /api/lyrics/transcribe            POST /api/lyrics/update
POST /api/lyrics/import                GET  /api/fonts                 GET /api/font-presets
POST /api/render                       POST /api/render/preview        (proxy rápido)
GET  /api/renders/{render_id}          GET  /api/render/{render_id}/validate
GET  /api/download/{render_id}         POST /api/download/zip
GET  /api/files/{project_id}/{path}    (con Range y validación de ruta)
```

Validación con Pydantic en todos los cuerpos; errores con formato único
`{error: {code, message, detail}}`; nunca un 200 con un fallo dentro.

---

## 16. CÓMO SE APLICA EL ORDEN DE PRIORIDADES

El orden pedido (calidad del algoritmo > sincronización > selección de planos > variedad >
velocidad > reencuadre > letras > tipografías > editor > secundarias) se traduce en decisiones
concretas:

1. **Antes de la UI bonita** se construye y valida el motor (Fases 5-6) — la interfaz de Fase 2
   existe para poder *operar* el motor, no al revés.
2. **`beat_this` como motor preferente** aunque cueste una dependencia pesada: la calidad de los
   beats es el cimiento de todo lo demás.
3. **Se invierte en el análisis visual** (biblioteca de átomos con métricas) en lugar de en más
   efectos: elegir buenos planos importa más que añadir *filtros*.
4. **La velocidad se ataca con arquitectura** (análisis único + máster + un comando por versión),
   no bajando la calidad por defecto.
5. **El editor manual nunca es requisito**: el modo automático debe bastar para el flujo completo.
6. Las funcionalidades secundarias (exportar presets, compartir, historiales, temas de UI) quedan
   al final y explícitamente fuera del alcance mínimo.

---

## 17. CÓMO SE EJECUTARÁ (previsto)

```
setup.bat      → crea backend/.venv (py -3.12), instala requirements, comprueba FFmpeg
run.bat        → arranca backend (:8000) y frontend (:5173) y abre el navegador
run.bat --prod → compila el frontend y lo sirve desde FastAPI en :8000 (un solo proceso)
python scripts/doctor.py → informe de hardware, filtros, encoders y extras instalados
```

Ninguna instrucción manual de FFmpeg, ninguna instalación fuera del script, ninguna clave.

---

## 18. REGISTRO DE ARCHIVOS

**Creados hasta ahora**

| Archivo | Estado |
|---|---|
| `docs/FASE-1-ARQUITECTURA.md` | Este documento |
| `temp/_research/beat-synced-edit/` | Clon de referencia **MIT** (material de terceros, fuera de la app; no se empaqueta) |
| `temp/_research/BeatSync-Engine/` | Clon **AGPL-3.0** — solo lectura para estudiar el algoritmo; **no se copia ni se empaqueta** |
| `temp/_research/MusicVideoCutter/` | Clon **sin licencia** — solo lectura; **no se copia ni se empaqueta** |

**Pendientes (a partir de la Fase 0):** `backend/**`, `frontend/**`, `assets/fonts/**`,
`scripts/**`, `README.md`, `backend/requirements.txt`, `docs/ARQUITECTURA.md` (final).

Temporales de investigación ya eliminados (167 MB de wheels descargados solo para verificar
compatibilidad: `temp/_wheelcheck/`). El disco queda en 26 GB libres.

---

## 19. DECISIONES PENDIENTES PARA ARRANCAR

1. **Aprobación del plan** (o cambios concretos: estilos, biblioteca tipográfica, formatos de salida).
2. **YouTube**: mantenerlo como opción "solo material autorizado" con confirmación explícita (§12),
   o dejar solo archivos locales.
3. **Extras pesados**: instalar `torch` + `beat_this` y `faster-whisper` desde el principio, o
   empezar con el instalador ligero (librosa) y añadirlos cuando el motor base funcione.
4. **Disco**: con 26 GB libres, ¿aviso y borrado de proyectos antiguos, o mover temporales a otra unidad?

Con esto resuelto, la **Fase 0** (verificación del stack + esqueleto) y la **Fase 2** (interfaz)
empezarían de inmediato.

