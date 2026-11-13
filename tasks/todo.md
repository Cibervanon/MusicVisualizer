# Task List: Lumen Studio - Polish & Hardening

## Phase 1: Code Quality & Architecture

### Task 1: Split EditorScreen into focused components ✅ DONE
**Description:** Decompose the 1140-line EditorScreen.tsx into focused components under `src/components/editor/`: `EditorHeader`, `EditorPreview`, `EditorTimeline`, `EditorInspector`, `EditorTabs`, `EditorSidebar`. Each component should have a single responsibility.

**Acceptance criteria:**
- [x] EditorScreen.tsx < 300 lines (orchestration only)
- [x] New components in `src/components/editor/`
- [x] All existing functionality preserved
- [x] Tests pass

**Verification:**
- [x] `npm run build` succeeds
- [x] `npm test` passes (13/13)
- [x] Manual: open editor, edit timeline, save, render preview

**Dependencies:** None

**Files likely touched:**
- `frontend/src/screens/EditorScreen.tsx`
- `frontend/src/components/editor/*.tsx` (new files)
- `frontend/src/components/editor/index.ts` (new)

**Estimated scope:** Large (8+ files)

---

### Task 2: Add Zod validation schemas for all API routes ✅ DONE
**Description:** Create Zod schemas in `frontend/src/lib/validation.ts` for all request bodies and query params. Apply validation at route entry using a validated API wrapper. Backend already uses Pydantic models.

**Acceptance criteria:**
- [x] Schemas for: project create/configure, upload, analyze, generate, render, lyrics, edit patch
- [x] Invalid requests return 422 with clear error messages (via validatedApi)
- [x] No `any` types in route signatures
- [x] Tests cover validation edge cases

**Verification:**
- [x] `npm run build` succeeds
- [x] `npm test` passes (13/13)
- [x] Backend tests pass (14/14)

**Dependencies:** None

**Files likely touched:**
- `frontend/src/lib/validation.ts` (new)
- `frontend/src/lib/validatedApi.ts` (new)
- `frontend/src/screens/*.tsx` (updated imports)
- `frontend/src/components/LyricsEditor.tsx` (updated imports)

**Estimated scope:** Medium (5-8 files)

---

### Task 3: Improve TypeScript types (remove `any`, add strict null checks)
**Description:** Audit `frontend/src/lib/types.ts` and all components. Replace `unknown`/`any` with precise types. Enable `strictNullChecks` in tsconfig (already on). Add branded types for IDs.

**Acceptance criteria:**
- [ ] Zero `any` in types.ts and components
- [ ] Zero `unknown` in public APIs
- [ ] Branded types for `ProjectId`, `EditId`, `RenderId`, `JobId`
- [ ] No implicit `any` in callbacks

**Verification:**
- [ ] `npm run build` succeeds (tsc --noEmit passes)
- [ ] `npm test` passes

**Dependencies:** Task 1 (easier after split)

**Files likely touched:**
- `frontend/src/lib/types.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/components/**/*.tsx`
- `frontend/tsconfig.json`

**Estimated scope:** Medium (5-8 files)

---

### Task 4: Add structured JSON logging to backend
**Description:** Configure Python `logging` with JSON formatter. Add request ID middleware. Log: request start/end, job transitions, render progress, errors with context. Output to stdout (container-friendly).

**Acceptance criteria:**
- [ ] All logs are valid JSON with: timestamp, level, logger, message, request_id, extra fields
- [ ] Request ID propagated through job runners
- [ ] Error logs include stack trace
- [ ] No print() statements in production code

**Verification:**
- [ ] Start backend, make request, verify JSON logs in console
- [ ] `python -m unittest discover -s tests` passes

**Dependencies:** None

**Files likely touched:**
- `backend/app/core/logging.py` (new)
- `backend/app/main.py`
- `backend/app/jobs/manager.py`
- `backend/app/jobs/runners.py`
- `backend/app/api/*.py`

**Estimated scope:** Medium (5-8 files)

---

### Task 5: Strengthen job cancellation state machine
**Description:** Review `backend/app/jobs/manager.py`. Add: timeout enforcement (max job duration), explicit cancellation confirmation, cleanup guarantees. Ensure `cancelled` state is truly terminal and cannot be overridden.

**Acceptance criteria:**
- [ ] Jobs have configurable max duration (default 30 min)
- [ ] Cancellation sets event immediately, runner checks frequently
- [ ] No path from `cancelling` → `done`/`running`
- [ ] Resources cleaned up on cancel (temp files, ffmpeg processes)

**Verification:**
- [ ] `python -m unittest discover -s tests` passes (add cancellation tests)
- [ ] Manual: start long render, cancel, verify cleanup

**Dependencies:** Task 4 (logging helps debug)

**Files likely touched:**
- `backend/app/jobs/manager.py`
- `backend/app/jobs/runners.py`
- `backend/tests/test_regressions.py`

**Estimated scope:** Small (2-3 files)

---

## Checkpoint: Code Quality
- [ ] All tests pass (backend 14, frontend 13)
- [ ] Build succeeds
- [ ] Editor works end-to-end (manual smoke test)

---

### Task 6: Add input validation middleware to all routes
**Description:** Create a FastAPI middleware/dependency that validates all incoming requests against Zod schemas. Apply globally or per-route. Reject malformed JSON, oversized payloads, invalid content types.

**Acceptance criteria:**
- [ ] Middleware validates request body against schema
- [ ] Query params validated for list/filter endpoints
- [ ] File uploads validated (size, type, extension)
- [ ] Clear 400/422 responses with field-level errors

**Verification:**
- [ ] `python -m unittest discover -s tests` passes
- [ ] Manual: send oversized file, verify rejection

**Dependencies:** Task 2

**Files likely touched:**
- `backend/app/api/validation.py` (new)
- `backend/app/main.py`
- `backend/app/api/routes_*.py`

**Estimated scope:** Medium (4-6 files)

---

### Task 7: Improve error handling with proper error codes
**Description:** Standardize error responses across all routes. Use consistent error codes (`VALIDATION_ERROR`, `NOT_FOUND`, `PROCESSING_ERROR`, `CANCELLED`, `INTERNAL_ERROR`). Add error detail structure with field, code, message.

**Acceptance criteria:**
- [ ] All routes return standardized error format
- [ ] Frontend `ApiError` class handles all codes
- [ ] Error codes documented in OpenAPI schema
- [ ] No raw exception traces in responses

**Verification:**
- [ ] `python -m unittest discover -s tests` passes
- [ ] `npm test` passes
- [ ] Manual: trigger various errors, verify format

**Dependencies:** Task 6

**Files likely touched:**
- `backend/app/core/errors.py`
- `backend/app/api/common.py`
- `backend/app/api/routes_*.py`
- `frontend/src/lib/api.ts`

**Estimated scope:** Medium (6-8 files)

---

### Task 8: Add request ID propagation for tracing
**Description:** Generate UUID request ID at ingress (middleware). Propagate via `X-Request-ID` header to all logs, job runners, and responses. Include in SSE streams.

**Acceptance criteria:**
- [ ] Every log entry has `request_id`
- [ ] Job runners receive and use request ID
- [ ] SSE events include request ID
- [ ] Response headers include `X-Request-ID`

**Verification:**
- [ ] `python -m unittest discover -s tests` passes
- [ ] Manual: make request, verify header and logs

**Dependencies:** Task 4

**Files likely touched:**
- `backend/app/core/logging.py`
- `backend/app/main.py`
- `backend/app/jobs/manager.py`
- `backend/app/jobs/runners.py`

**Estimated scope:** Small (3-4 files)

---

### Task 9: Add health check with detailed diagnostics
**Description:** Enhance `/api/health` to check: FFmpeg availability, disk space, temp directory writable, Python dependencies, Redis (if added), disk I/O latency. Return structured status.

**Acceptance criteria:**
- [ ] Health endpoint returns: `ok`, `checks` (array of name/status/latency), `version`
- [ ] Checks: ffmpeg, disk, temp, imports
- [ ] Degraded mode when non-critical checks fail
- [ ] Response < 100ms

**Verification:**
- [ ] `python -m unittest discover -s tests` passes
- [ ] Manual: curl health endpoint, verify structure

**Dependencies:** None

**Files likely touched:**
- `backend/app/api/routes_system.py`
- `backend/app/core/health.py` (new)

**Estimated scope:** Small (2-3 files)

---

### Task 10: Improve render validation (add frame-accurate checks)
**Description:** Enhance `backend/app/quality/validator.py`. Add: frame count verification, audio/video sync check (pts drift), keyframe interval check, color space validation, H.264 profile/level check.

**Acceptance criteria:**
- [ ] Validates frame count matches expected @ fps
- [ ] Checks audio/video sync within 1 frame
- [ ] Verifies H.264 High profile, level 4.1+
- [ ] Reports detailed metrics in validation info

**Verification:**
- [ ] `python -m unittest discover -s tests` passes (add validation tests)
- [ ] Manual: render clip, verify validation output

**Dependencies:** None

**Files likely touched:**
- `backend/app/quality/validator.py`
- `backend/app/media/render.py`
- `backend/tests/test_regressions.py`

**Estimated scope:** Medium (3-4 files)

---

## Checkpoint: Reliability
- [ ] All tests pass
- [ ] Invalid inputs rejected cleanly
- [ ] Job cancellation works under load (manual stress test)

---

### Task 11: Add keyboard navigation to Timeline
**Description:** Implement full keyboard support in Timeline component: arrow keys to move playhead, Shift+arrows to select segments, Enter to split, Delete to remove, Ctrl+Z/Y for undo/redo. Add focus indicators.

**Acceptance criteria:**
- [ ] Left/Right arrows move playhead by 1 frame
- [ ] Shift+Left/Right select adjacent segment
- [ ] Enter splits at playhead
- [ ] Delete removes selected segment
- [ ] Focus ring visible on all interactive elements
- [ ] Works with screen reader (announces position)

**Verification:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual: keyboard-only editing session

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/Timeline.tsx`
- `frontend/src/components/editor/EditorTimeline.tsx` (new)

**Estimated scope:** Medium (2-3 files)

---

### Task 12: Improve LyricsEditor layout and UX
**Description:** Redesign LyricsEditor: use proper table layout for lines, add drag-to-reorder, improve import flow, add per-line preview, better validation feedback. Fix cramped grid layout.

**Acceptance criteria:**
- [ ] Lines displayed in virtualized table (react-window)
- [ ] Drag handle to reorder lines
- [ ] Import modal with live preview
- [ ] Inline validation (red border on invalid times)
- [ ] Per-line playback button
- [ ] Responsive on mobile

**Verification:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual: create/edit/import lyrics

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/LyricsEditor.tsx`
- `frontend/src/components/editor/EditorLyrics.tsx` (new)
- `package.json` (add react-window)

**Estimated scope:** Medium (3-4 files)

---

### Task 13: Add proper ARIA attributes throughout
**Description:** Audit all components for accessibility. Add: landmarks, live regions for toasts/progress, proper heading hierarchy, button/link roles, focus management, skip links. Test with NVDA/axe.

**Acceptance criteria:**
- [ ] All interactive elements have accessible names
- [ ] Toast announcements via `aria-live`
- [ ] Progress bars have `role="progressbar"` with labels
- [ ] Modal traps focus
- [ ] Skip to main content link
- [ ] Color contrast meets WCAG AA

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: run axe-core in browser, zero violations
- [ ] Manual: NVDA navigation test

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/**/*.tsx`
- `frontend/src/screens/*.tsx`
- `frontend/src/App.tsx`

**Estimated scope:** Medium (8-10 files)

---

### Task 14: Add loading skeletons for all async states
**Description:** Replace all spinner-only loading with content-aware skeletons. Use `Skeleton` component for: project list, edit list, render list, waveform, timeline, preview player. Match final layout dimensions.

**Acceptance criteria:**
- [ ] No layout shift on load
- [ ] Skeletons match content structure
- [ ] Progressive enhancement (show static first)
- [ ] Consistent animation (pulse/shimmer)

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: throttle network, verify skeleton appearance

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/ui.tsx` (enhance Skeleton)
- `frontend/src/screens/*.tsx`
- `frontend/src/components/**/*.tsx`

**Estimated scope:** Medium (5-7 files)

---

### Task 15: Add focus management and skip links
**Description:** Implement focus trap for modals, restore focus on close, add skip-to-content link, ensure tab order matches visual order. Add `useFocusTrap` hook.

**Acceptance criteria:**
- [ ] Modal traps focus (Tab cycles within)
- [ ] Focus returns to trigger on close
- [ ] Skip link visible on first Tab
- [ ] No focus loss on route change
- [ ] Custom focus styles visible

**Verification:**
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] Manual: keyboard navigation through modals

**Dependencies:** Task 13

**Files likely touched:**
- `frontend/src/hooks/useFocusTrap.ts` (new)
- `frontend/src/components/ui.tsx` (Modal)
- `frontend/src/App.tsx`

**Estimated scope:** Small (2-3 files)

---

## Checkpoint: UX
- [ ] All tests pass
- [ ] Keyboard-only navigation works end-to-end
- [ ] Screen reader compatible (NVDA test)

---

### Task 16: Add integration tests for render pipeline
**Description:** Create integration tests in `backend/tests/test_integration.py` that test the full render pipeline: audio analysis → video analysis → planning → render → validation. Use real fixtures (small test video/audio).

**Acceptance criteria:**
- [ ] Test: audio analysis produces valid beats/sections
- [ ] Test: video analysis produces scenes
- [ ] Test: generate_versions creates valid EDLs
- [ ] Test: render_edit produces valid MP4
- [ ] Test: validation catches duration mismatch
- [ ] Tests run in < 60 seconds total

**Verification:**
- [ ] `python -m unittest discover -s tests` passes (includes new tests)
- [ ] Coverage > 80% for render/editing modules

**Dependencies:** Task 10

**Files likely touched:**
- `backend/tests/test_integration.py` (new)
- `backend/tests/conftest.py` (new, fixtures)
- `backend/app/media/render.py`
- `backend/app/editing/planner.py`

**Estimated scope:** Large (5-8 files)

---

### Task 17: Add Playwright E2E tests for critical flows
**Description:** Create Playwright tests in `frontend/e2e/` for: project creation, audio/video upload, analysis, generation, editor open/save/render, lyrics edit, download. Run in CI headless.

**Acceptance criteria:**
- [ ] Test: create project → upload audio → upload video → analyze → generate → open editor → save → render preview
- [ ] Test: editor timeline drag/resize/split/duplicate/delete
- [ ] Test: lyrics import/transcribe/edit/save
- [ ] Test: download single and ZIP
- [ ] Tests run in < 5 minutes total

**Verification:**
- [ ] `npx playwright test` passes locally
- [ ] CI runs tests on PR

**Dependencies:** Task 1, Task 11

**Files likely touched:**
- `frontend/e2e/*.spec.ts` (new)
- `frontend/playwright.config.ts` (new)
- `package.json`

**Estimated scope:** Large (5-8 files)

---

### Task 18: Add GitHub Actions CI pipeline
**Description:** Create `.github/workflows/ci.yml` with jobs: lint, typecheck, test (backend), test (frontend), build, e2e. Cache dependencies. Run on PR and push to main.

**Acceptance criteria:**
- [ ] Job: backend lint (ruff), typecheck (mypy), test
- [ ] Job: frontend lint (eslint), typecheck (tsc), test, build
- [ ] Job: e2e (Playwright) on PR
- [ ] Artifacts: build outputs, test reports
- [ ] Required status checks on main branch

**Verification:**
- [ ] Push to branch, verify CI runs
- [ ] PR shows all checks passing

**Dependencies:** Task 16, Task 17

**Files likely touched:**
- `.github/workflows/ci.yml` (new)
- `backend/pyproject.toml` (add mypy/ruff config)
- `frontend/package.json` (add scripts)

**Estimated scope:** Medium (3-4 files)

---

### Task 19: Add dependency audit to CI
**Description:** Add `pip-audit` (Python) and `npm audit` (Node) to CI. Fail on high/critical vulnerabilities. Add dependabot config for automated PRs.

**Acceptance criteria:**
- [ ] CI job runs `pip-audit` and `npm audit`
- [ ] Fails on CVSS >= 7.0
- [ ] Dependabot configured for weekly updates
- [ ] Allowlist for false positives documented

**Verification:**
- [ ] CI runs audits
- [ ] Manual: introduce known vuln, verify fail

**Dependencies:** Task 18

**Files likely touched:**
- `.github/workflows/ci.yml`
- `.github/dependabot.yml` (new)

**Estimated scope:** Small (2 files)

---

### Task 20: Add performance budgets to CI
**Description:** Add bundle size budget (frontend) and render time budget (backend) to CI. Use `webpack-bundle-analyzer` or `vite-bundle-analyzer`. Fail if budget exceeded.

**Acceptance criteria:**
- [ ] Frontend: total JS < 400KB gzipped, CSS < 50KB
- [ ] Backend: render_edit < 30s for 30s clip @ 1080p
- [ ] Budgets enforced in CI
- [ ] Reports uploaded as artifacts

**Verification:**
- [ ] CI fails on budget exceed
- [ ] Manual: verify budgets met currently

**Dependencies:** Task 18

**Files likely touched:**
- `.github/workflows/ci.yml`
- `frontend/vite.config.ts`
- `package.json`

**Estimated scope:** Small (3-4 files)

---

## Checkpoint: Testing
- [ ] CI pipeline passes
- [ ] E2E tests cover critical paths
- [ ] Coverage > 80% for core modules

---

### Task 21: Optimize bundle size (code splitting, tree shaking)
**Description:** Analyze bundle with `vite-bundle-analyzer`. Implement: route-level code splitting (lazy load screens), remove unused lucide icons, optimize Tailwind purge, enable `esbuild` minification.

**Acceptance criteria:**
- [ ] Initial JS < 150KB gzipped
- [ ] Screens loaded on demand
- [ ] No duplicate dependencies
- [ ] Tree shaking works (no side effects in package.json)

**Verification:**
- [ ] `npm run build` shows bundle analysis
- [ ] `npm test` passes

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/vite.config.ts`
- `frontend/src/App.tsx` (lazy imports)
- `frontend/src/main.tsx`
- `package.json`

**Estimated scope:** Medium (3-5 files)

---

### Task 22: Add virtualization for large lists
**Description:** Use `react-window` or `tanstack-virtual` for: project list, edit list, render list, lyrics lines. Replace `map` with `FixedSizeList`/`VariableSizeList`.

**Acceptance criteria:**
- [ ] Project list virtualized (50+ items)
- [ ] Edit list virtualized
- [ ] Render list virtualized
- [ ] Lyrics lines virtualized (100+ lines)
- [ ] Smooth scrolling, no layout shift

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: create 100 projects, verify performance

**Dependencies:** Task 12

**Files likely touched:**
- `frontend/src/screens/SetupScreen.tsx`
- `frontend/src/screens/ResultsScreen.tsx`
- `frontend/src/components/LyricsEditor.tsx`
- `package.json`

**Estimated scope:** Medium (4-5 files)

---

### Task 23: Improve Timeline rendering performance
**Description:** Optimize Timeline: use `requestAnimationFrame` for playhead, memoize segment rendering, avoid re-renders on playhead move, use CSS transform for blocks instead of left/width.

**Acceptance criteria:**
- [ ] 60fps playhead animation
- [ ] No re-render of segments on playhead move
- [ ] 500+ segments render smoothly
- [ ] Drag/resize 60fps

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: profile with React DevTools, verify no unnecessary renders

**Dependencies:** Task 1, Task 11

**Files likely touched:**
- `frontend/src/components/Timeline.tsx`
- `frontend/src/components/editor/EditorTimeline.tsx`

**Estimated scope:** Medium (2-3 files)

---

### Task 24: Add progressive image loading for thumbnails
**Description:** Implement: blur-up placeholders (LQIP), lazy loading with `IntersectionObserver`, WebP/AVIF support with fallbacks, responsive images with `srcset`.

**Acceptance criteria:**
- [ ] Thumbnails show blur placeholder while loading
- [ ] Lazy load offscreen images
- [ ] WebP served to supporting browsers
- [ ] No layout shift on image load

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: throttle network, verify progressive load

**Dependencies:** None

**Files likely touched:**
- `frontend/src/components/ui.tsx` (new `Thumbnail` component)
- `frontend/src/screens/ResultsScreen.tsx`
- `frontend/src/screens/EditorScreen.tsx`

**Estimated scope:** Small (3-4 files)

---

### Task 25: Polish visual details (micro-interactions, transitions)
**Description:** Add: Framer Motion for page transitions, stagger animations for lists, hover/tap feedback on all buttons, loading state transitions, reduced motion support (`prefers-reduced-motion`).

**Acceptance criteria:**
- [ ] Page transitions (fade/slide) between steps
- [ ] List items stagger in
- [ ] Buttons have press/tap feedback
- [ ] Respects `prefers-reduced-motion`
- [ ] No jank on low-end devices

**Verification:**
- [ ] `npm run build` succeeds
- [ ] Manual: navigate all flows, verify smoothness

**Dependencies:** Task 1

**Files likely touched:**
- `frontend/src/components/ui.tsx`
- `frontend/src/screens/*.tsx`
- `frontend/src/App.tsx`
- `package.json` (add framer-motion)

**Estimated scope:** Medium (5-7 files)

---

## Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] Production-ready build
- [ ] Documentation updated