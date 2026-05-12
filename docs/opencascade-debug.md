# OpenCascade.js Constructor Debugging Guide

## Problem
Error: `oc.BRepPrimAPI_MakeBox_2 is not a constructor`

## Solution

The code has been updated to automatically detect and use the correct constructor pattern. It will try:

1. `BRepPrimAPI_MakeBox` (direct constructor)
2. `BRepPrimAPI_MakeBox_2` (numbered variant)

## How to Debug

1. **Open the browser console** (F12)
2. **Click "Test OpenCascade" button**
3. **Look for these debug messages:**

```
OpenCascade.js initialized successfully
Total APIs available: [number]
BRepPrimAPI constructors: [list]
MakeBox constructors: [list]
```

## Common Constructor Patterns in OpenCascade.js

Different versions use different patterns:

### Pattern 1: Direct constructor
```typescript
new oc.BRepPrimAPI_MakeBox(width, depth, height)
```

### Pattern 2: Numbered variants
```typescript
new oc.BRepPrimAPI_MakeBox_1(...)  // Different parameter overloads
new oc.BRepPrimAPI_MakeBox_2(...)
new oc.BRepPrimAPI_MakeBox_3(...)
```

### Pattern 3: Function calls
```typescript
oc.BRepPrimAPI_MakeBox(width, depth, height)  // Without 'new'
```

## Updated Code

All methods now use helper functions that auto-detect the correct pattern:

```typescript
const createBox = (w: number, d: number, h: number) => {
  if ((oc as any).BRepPrimAPI_MakeBox) {
    return new (oc as any).BRepPrimAPI_MakeBox(w, d, h).Solid();
  } else if ((oc as any).BRepPrimAPI_MakeBox_2) {
    return new (oc as any).BRepPrimAPI_MakeBox_2(w, d, h).Solid();
  }
  throw new Error('BRepPrimAPI_MakeBox not available');
};
```

## Files Modified

- `src/core/util/OpenCascadeHelper.ts` - Added debug logging
- `src/core/util/ParametricModeler.ts` - Added auto-detection logic

## Next Steps

1. Reload the page
2. Check console for constructor names
3. If still failing, the console will show exactly which constructors are available
4. Update the code to use the correct constructor name if needed
