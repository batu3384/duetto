# Verification Gates

## Gate 1: Regression checks
- CHECK: `npm run check`
- EXPECT: `exit_code: 0`
- EVIDENCE: ✅ PASSED — all parser, translation, storage, and styling self-checks passed

## Gate 2: Type check and production build
- CHECK: `npm run build`
- EXPECT: `exit_code: 0`
- EVIDENCE: ✅ PASSED — TypeScript and Vite production build completed

## Gate 3: Diff validation
- CHECK: `git diff --check`
- EXPECT: `exit_code: 0`
- EVIDENCE: ✅ PASSED — no whitespace errors
