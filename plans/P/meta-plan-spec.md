# Item 197 · Meta-plan · plan-of-plans spec (Instruct-KR shape)

## Contract
A meta-plan is a plan whose items are themselves plans. The executor (item 198) recursively dispatches.

## Item shape (extension of SUPER-MASTER-PLAN format)
```
Item NNN | Section | Task | Target | Agent | Deps | Hours | Priority | [Sub-plan path]
```

When `Sub-plan path` is present, executing the item = invoking the executor on that sub-plan.

## Executor contract
```js
async function executeMetaPlan(plan_path) {
  const items = parsePlan(plan_path);
  const sorted = topologicalSort(items);
  for (const item of sorted) {
    if (item.sub_plan_path) await executeMetaPlan(item.sub_plan_path);
    else await dispatchItem(item);
  }
}
```

## Dispatch
Each item dispatched becomes an envelope-v1 with `kind: SMP.item.dispatch` and role-matching agent. Receipt expected within item.hours × 2 SLA.
