## Summary

Provide a concise description of the change, motivation, and context.

Fixes #(issue)

## Type of Change

- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Breaking change (fix or feature causing existing behaviour to change)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Security hardening

## Architectural Compliance

Before submitting, verify that this change satisfies Kinora's core architecture rules:

- [ ] React owns UI, routing, and preferences; Rust owns native tasks, persistence, and network.
- [ ] Logic is not duplicated across React and Rust.
- [ ] `src/lib/native.ts` is the sole React-to-Rust bridge; all responses are typed and validated.
- [ ] Outbound network access routes strictly through `fetch.rs` with guarded resolution and SSRF checks.
- [ ] Stream URLs, credentials, and tokens are never rendered in plain text or leaked into logs/DOM.
- [ ] HLS-only media playback boundary is preserved (`kstream://localhost/` handles).
- [ ] No em-dashes exist across code, comments, documentation, or UI text (use hyphens, colons, or parentheses).
- [ ] All colours adhere to CSS tokens in `global.css`; no hard-coded palette values.

## Verification Checklist

- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm test` (Vitest) passes completely.
- [ ] `npm run test:rust` (Cargo test) passes completely.
- [ ] Local checks pass: `bash scripts/ci-local.sh`.
- [ ] Tests have been added or updated to cover the changes.
