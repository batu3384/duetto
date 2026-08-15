import {
  autoDockPx,
  boxFillRgba,
  captionLook,
  clampDockOpacity,
  clampOffsetY,
  clampOutlineWidth,
  dockFill,
  edgeTextShadow,
  glassFillAlpha,
  hexToRgb,
  luma,
  averageBottomRgb,
  rgbCss,
  migrateFontFamily,
  readCssPx,
  resolveEdgeStyle,
  resolvePlacement,
  resolveVideoFit,
  safeCssColor,
} from './subtitleLook.ts';
import { DEFAULT_SETTINGS } from '../types/index.ts';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL', msg);
    process.exitCode = 1;
  } else {
    console.log('ok', msg);
  }
}

assert(migrateFontFamily('Inter') === 'Arial', 'legacy Inter → Arial');
assert(migrateFontFamily('JetBrains Mono') === 'Arial', 'legacy mono → Arial');
assert(migrateFontFamily('Lexend') === 'Arial', 'Lexend retired → Arial');
assert(migrateFontFamily('Helvetica Neue') === 'Arial', 'Helvetica retired → Arial');
assert(migrateFontFamily('Noto Sans') === 'Noto Sans', 'Noto kept');
assert(migrateFontFamily('Atkinson Hyperlegible') === 'Atkinson Hyperlegible', 'Atkinson kept');
assert(resolveEdgeStyle({ textStroke: false }) === 'none', 'legacy stroke off → none');
assert(resolveEdgeStyle({ edgeStyle: 'raised' }) === 'raised', 'edgeStyle wins');
assert(resolveEdgeStyle({ edgeStyle: 'nope' as never, textStroke: false }) === 'none', 'invalid edge falls to stroke');
assert(safeCssColor('red', '#ffffff') === '#ffffff', 'reject named color');
assert(safeCssColor('#FFF', '#000') === '#ffffff', 'expand 3-digit hex');
assert(hexToRgb('#0e1424').r === 14 && hexToRgb('#0e1424').b === 36, 'hex rgb');
assert(boxFillRgba('#ffffff', 0.5) === 'rgba(255,255,255,0.5)', 'box fill');
assert(clampOutlineWidth(0) === 1, 'outline min 1');
assert(clampOutlineWidth(9) === 4, 'outline max 4');
assert(glassFillAlpha(80, true) === 0.48, 'glass caps alpha');
assert(glassFillAlpha(20, true) === 0.2, 'glass keeps low alpha');
assert(glassFillAlpha(80, false) === 0.8, 'solid uses full alpha');
assert(edgeTextShadow('none', 2) === 'none', 'no edge');
assert(edgeTextShadow('outline', 1).includes('-1px 0px 0 #000000'), 'outline samples ring');
assert(!edgeTextShadow('outline', 1).includes('0px 0px 0 #000000'), 'outline skips origin');
assert(edgeTextShadow('outline', 2, '#f87171').includes('#f87171'), 'outline uses edge color');
assert(edgeTextShadow('dropshadow', 2, '#22d3ee').includes('#22d3ee'), 'dropshadow uses edge color');
assert(edgeTextShadow('raised', 2, '#fde047').includes('#fde047'), 'raised uses edge color');

const look = captionLook({ ...DEFAULT_SETTINGS.subStyle, blur: true, bgOpacity: 80 }, true);
assert(look.blur === false && look.alpha === 0.8, 'reduced transparency disables glass');
assert(look.edgeColor === '#000000', 'default edge color black');
assert(look.shadow.includes('#000000'), 'captionLook shadow uses edgeColor');
const colored = captionLook({ ...DEFAULT_SETTINGS.subStyle, edgeColor: '#f87171' });
assert(colored.edgeColor === '#f87171' && colored.shadow.includes('#f87171'), 'captionLook passes edgeColor');

const glass = captionLook({ ...DEFAULT_SETTINGS.subStyle, blur: true, bgOpacity: 80 }, false);
assert(glass.blur === true && glass.alpha === 0.48, 'glass on when allowed');

assert(resolvePlacement('below') === 'below', 'placement below');
assert(resolvePlacement('nope') === 'overlay', 'placement fallback overlay');
assert(resolveVideoFit('contain') === 'contain', 'video fit contain');
assert(resolveVideoFit('cover') === 'cover', 'video fit cover');
assert(resolveVideoFit('nope') === 'cover', 'video fit default cover');
assert(DEFAULT_SETTINGS.subStyle.videoFit === 'cover', 'default video fit cover');
assert(DEFAULT_SETTINGS.subStyle.dockAmbient === true, 'default dock ambient');
assert(readCssPx('42px', 0) === 42, 'readCssPx 42px');
assert(readCssPx('auto', 42) === 42, 'readCssPx auto');
assert(readCssPx('', 8) === 8, 'readCssPx empty');
assert(clampOffsetY(Number.NaN) === 42, 'offset NaN');
assert(clampOffsetY(0) === 8, 'offset min 8');
assert(clampOffsetY(999) === 400, 'offset max 400');
const dockDual = autoDockPx({ ...DEFAULT_SETTINGS.subStyle, layoutMode: 'dual' });
const dockOne = autoDockPx({ ...DEFAULT_SETTINGS.subStyle, layoutMode: 'source_only' });
assert(dockDual > dockOne, 'dual dock taller than single');
assert(dockOne >= 64 && dockDual <= 220, 'dock clamp');
assert(DEFAULT_SETTINGS.subStyle.dockColor === '#000000', 'default dock black');
assert(DEFAULT_SETTINGS.subStyle.dockOpacity === 0, 'default dock opacity 0');
assert(safeCssColor(undefined, '#000000') === '#000000', 'missing dock falls back');
assert(clampDockOpacity(0) === 0, 'dock opacity min 0');
assert(clampDockOpacity(30) === 30, 'dock opacity 30 kept');
assert(clampDockOpacity(120) === 100, 'dock opacity max 100');
assert(clampDockOpacity(Number.NaN) === 0, 'dock opacity NaN fallback');
assert(dockFill('#000000', 100) === 'rgba(0,0,0,1)', 'dock fill opaque');
assert(dockFill('#000000', 0) === 'rgba(0,0,0,0)', 'dock fill transparent');
assert(dockFill('#ffffff', 50) === 'rgba(255,255,255,0.5)', 'dock fill half');
assert(luma('#ffffff') > 250, 'white luma high');
assert(luma('#000000') < 1, 'black luma low');
{
  const px = new Uint8ClampedArray([
    255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
    255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
  ]);
  const avg = averageBottomRgb(px, 6, 2, 0.5);
  assert(avg.r > 240 && avg.g > 240 && avg.b > 240, 'bottom band ignores red title row');
  assert(rgbCss(avg) === `rgb(${avg.r},${avg.g},${avg.b})`, 'rgbCss shape');
}

if (process.exitCode) {
  console.error('subtitleLook check failed');
  process.exit(1);
}
console.log('subtitleLook check passed');
