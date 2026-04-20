# Item 107 · Old Globals model → new DeviceAdapter map

## Old (private, NOT in this repo)
- `Globals` was a flat model holding device tunables + transient state.
- Coupled to a specific device brand + LIMS format.

## New DeviceAdapter contract (generic · safe to publish)
```js
// src/product-x/device-adapter.js
module.exports = {
  probe:  async (cfg)   => ({ ok: bool, device_info }),
  read:   async (cfg)   => ({ ok: bool, raw }),
  parse:  async (raw)   => ({ ok: bool, parsed }),
  patch:  async (parsed, patch) => ({ ok: bool, patched }),
  verify: async (patched) => ({ ok: bool, verification }),
};
```

## Benefits
- No brand, model, or field names.
- Stateless contract; Globals-equivalent state lives in adapter instance.
- Any device family can implement the same 5 methods.

## Migration rule
Do NOT copy any file from the old repo verbatim into the public repo. Rewrite into the adapter shape.
