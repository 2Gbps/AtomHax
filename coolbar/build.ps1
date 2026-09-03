# build.ps1 — compiles nyxcoolbar (imgui + ImCoolBar) to a SINGLE_FILE WASM blob.
# Requires: Emscripten SDK activated in PATH (emcc).
# Output: nyxcoolbar.js (self-contained: JS glue + base64 wasm + embedded font)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$imgui = Join-Path $env:TEMP "opencode\imgui"
$emcc  = "emcc"

if (-not (Get-Command $emcc -ErrorAction SilentlyContinue)) {
    Write-Error "emcc not found. Run: C:\Users\abhim\AppData\Local\Temp\opencode\emsdk\emsdk_env.bat (or emsdk activate latest) first."
}

$sources = @(
    "$root\main.cpp",
    "$imgui\imgui.cpp",
    "$imgui\imgui_draw.cpp",
    "$imgui\imgui_tables.cpp",
    "$imgui\imgui_widgets.cpp",
    "$imgui\backends\imgui_impl_opengl3.cpp",
    "$root\ImCoolBar.cpp"
)

$includes = @(
    "-I$imgui",
    "-I$imgui\backends",
    "-I$root"
)

$flags = @(
    "-O3",
    "-std=c++17",
    "-DIMGUI_IMPL_OPENGL_ES3",
    "-sSINGLE_FILE=1",
    "-sUSE_WEBGL2=1",
    "-sMIN_WEBGL_VERSION=2",
    "-sMAX_WEBGL_VERSION=2",
    "-sALLOW_MEMORY_GROWTH=1",
    "-sEXPORTED_RUNTIME_METHODS=UTF8ToString,lengthBytesUTF8,stringToUTF8",
    "-sEXPORTED_FUNCTIONS=_main,_malloc,_free,_nyxSetFps,_nyxSetMaximized,_nyxSetProfile,_nyxShowAddress,_nyxSetDisplaySize,_nyxFeedMouse,_nyxFeedButton,_nyxFeedWheel,_nyxFeedKey,_nyxFeedChar,_nyxDebugState",
    "-sMODULARIZE=1",
    "-sEXPORT_NAME=createNyxCoolbar",
    "-sFILESYSTEM=1",
    "--embed-file", "$root\fontawesome-webfont.ttf@/fontawesome-webfont.ttf",
    "--embed-file", "$imgui\misc\fonts\DroidSans.ttf@/DroidSans.ttf",
    "-o", "$root\nyxcoolbar.js",
    "-Wno-deprecated-declarations"
)

Write-Host "Compiling nyxcoolbar..."
& $emcc $sources $includes $flags
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done: $root\nyxcoolbar.js"