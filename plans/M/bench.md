# Item 158 · Gulp 2000 dry-pass walltime benchmark

## Method
```
node --experimental-vm-modules -e "import('./gulpfile.mjs').then(m => console.time('gulp-2000') || m.runGulp2000({ totalSteps: 2000 }).then(() => console.timeEnd('gulp-2000')))"
```

## Expected (stub handlers)
- Per-step ~0.1-0.5 ms (no I/O in scaffold).
- 2000 steps × 0.3ms avg ≈ 600ms.
- State save every 50 steps = 40 disk writes ≈ 40 × ~1ms = 40ms.
- **Estimate: 600-800ms dry pass.**

## Measured
Not yet run in this ship; operator to invoke once wired to real handlers.

## Regression rule
Dry-pass walltime > 5s = regression; investigate. Real-handler walltime depends on build/validate/sign/deploy costs per step.
