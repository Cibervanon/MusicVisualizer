# Implementation Plan: Lumen Studio - Polish & Hardening

## Overview
Transform Lumen Studio into a polished, reliable, professional music-video studio. The core editing/rendering pipeline works correctly (validated). This plan focuses on:
- Code quality: splitting large components, improving type safety, removing duplication
- Reliability: better error handling, validation, logging, job cancellation guarantees
- UX: accessibility, keyboard navigation, loading states, visual polish
- Testing: integration tests, E2E tests, CI/CD pipeline
- Observability: structured logging, metrics, health checks

## Architecture Decisions
- **Component decomposition**: Split `EditorScreen.tsx` (1140 lines) into focused components under `src/components/editor/`
- **Validation layer**: Add Zod schemas for all API inputs, validate at route entry
- **Structured logging**: Use Python `logging` with JSON format, add request IDs
- **Job cancellation**: Strengthen state machine, add timeout enforcement
- **Type safety**: Replace `unknown`/`any` with precise types, add strict null checks
- **Tests**: Add integration tests for render pipeline, E2E with Playwright

## Task List

### Phase 1: Code Quality & Architecture
- [ ] Task 1: Split EditorScreen into focused components
- [ ] Task 2: Add Zod validation schemas for all API routes
- [ ] Task 3: Improve TypeScript types (remove `any`, add strict null checks)
- [ ] Task 4: Add structured JSON logging to backend
- [ ] Task 5: Strengthen job cancellation state machine

### Checkpoint: Code Quality
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Editor works end-to-end

### Phase 2: Reliability & Validation
- [ ] Task 6: Add input validation middleware to all routes
- [ ] Task 7: Improve error handling with proper error codes
- [ ] Task 8: Add request ID propagation for tracing
- [ ] Task 9: Add health check with detailed diagnostics
- [ ] Task 10: Improve render validation (add frame-accurate checks)

### Checkpoint: Reliability
- [ ] All tests pass
- [ ] Invalid inputs rejected cleanly
- [ ] Job cancellation works under load

### Phase 3: UX & Accessibility
- [ ] Task 11: Add keyboard navigation to Timeline
- [ ] Task 12: Improve LyricsEditor layout and UX
- [ ] Task 13: Add proper ARIA attributes throughout
- [ ] Task 14: Add loading skeletons for all async states
- [ ] Task 15: Add focus management and skip links

### Checkpoint: UX
- [ ] All tests pass
- [ ] Keyboard-only navigation works
- [ ] Screen reader compatible

### Phase 4: Testing & CI/CD
- [ ] Task 16: Add integration tests for render pipeline
- [ ] Task 17: Add Playwright E2E tests for critical flows
- [ ] Task 18: Add GitHub Actions CI pipeline
- [ ] Task 19: Add dependency audit to CI
- [ ] Task 20: Add performance budgets to CI

### Checkpoint: Testing
- [ ] CI pipeline passes
- [ ] E2E tests cover critical paths
- [ ] Coverage > 80% for core modules

### Phase 5: Polish & Performance
- [ ] Task 21: Optimize bundle size (code splitting, tree shaking)
- [ ] Task 22: Add virtualization for large lists
- [ ] Task 23: Improve Timeline rendering performance
- [ ] Task 24: Add progressive image loading for thumbnails
- [ ] Task 25: Polish visual details (micro-interactions, transitions)

### Checkpoint: Complete
- [ ] All acceptance criteria met
- [ ] Production-ready build
- [ ] Documentation updated

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| EditorScreen refactor breaks editing | High | Write integration tests first, refactor incrementally |
| Validation breaks existing API clients | Medium | Add validation in permissive mode first, then strict |
| Job cancellation race conditions | High | Add integration test with concurrent cancel/start |
| Bundle size regression | Medium | Add size budget to CI, monitor per-PR |

## Open Questions
- Should we add a plugin system for custom effects?
- Do we need multi-project workspaces?
- Should we support remote rendering workers?