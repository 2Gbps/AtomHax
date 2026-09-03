// nyxcoolbar — Dear ImGui + ImCoolBar compiled to WASM, rendered on a WebGL2
// canvas in the Electron renderer. A macOS-Dock-style magnification sidebar
// docked to the left edge, with all app controls as icon items.
//
// Compile (see build.ps1): imgui + imgui_impl_opengl3 + ImCoolBar via emcc,
// SINGLE_FILE so the whole thing is one self-contained JS blob the main
// process can inject with executeJavaScript.

#include <emscripten.h>
#include <emscripten/html5.h>
#include <string>
#include <vector>
#include <cstring>

#define IMGUI_DEFINE_MATH_OPERATORS
#include "imgui.h"
#include "imgui_impl_opengl3.h"
#include "ImCoolBar.h"

// ── IPC action ids (must match the JS bridge in main.js / inject) ──
enum NyxAction {
    NYX_ACT_MINIMIZE = 0,
    NYX_ACT_MAXIMIZE_TOGGLE = 1,
    NYX_ACT_CLOSE = 2,
    NYX_ACT_PROFILE = 3,
    NYX_ACT_SETTINGS = 4,
    NYX_ACT_ABOUT = 5,
    NYX_ACT_HELP = 6,
    NYX_ACT_JOIN = 7,          // arg = room url (navigate)
    NYX_ACT_TOGGLE_HEADER = 8, // unused for now
};

// ── state pushed from JS ──
static float s_fps = 0.0f;
static bool  s_maximized = false;
static char  s_profileName[256] = "";
static bool  s_showAddress = false;
static char  s_addressBuf[512] = "";
static float s_displayW = 0.0f;
static float s_displayH = 0.0f;
static int   s_loopTicks = 0;

// ── emit an action to the JS bridge ──
EM_JS(void, nyx_emit, (int id, const char* arg), {
    if (window.nyxCoolbarBridge) {
        var s = arg ? UTF8ToString(arg) : "";
        window.nyxCoolbarBridge(id, s);
    }
});

EM_JS(void, nyx_focus_canvas, (), {
    var c = document.getElementById("nyx-coolbar-canvas");
    if (c) c.focus();
});

EM_JS(void, nyx_release_focus, (), {
    var c = document.getElementById("nyx-coolbar-canvas");
    if (c) c.blur();
});

// ── setters callable from JS ──
extern "C" {
EMSCRIPTEN_KEEPALIVE void nyxSetFps(float v) { s_fps = v; }
EMSCRIPTEN_KEEPALIVE void nyxSetMaximized(bool v) { s_maximized = v; }
EMSCRIPTEN_KEEPALIVE void nyxSetProfile(const char* name) {
    if (name) {
        strncpy(s_profileName, name, sizeof(s_profileName) - 1);
        s_profileName[sizeof(s_profileName) - 1] = '\0';
    } else {
        s_profileName[0] = '\0';
    }
}
EMSCRIPTEN_KEEPALIVE void nyxShowAddress(bool v) { s_showAddress = v; }

EMSCRIPTEN_KEEPALIVE void nyxSetDisplaySize(float w, float h, float dpr) {
    s_displayW = w; s_displayH = h;
    ImGuiIO& io = ImGui::GetIO();
    io.DisplaySize = ImVec2(w, h);
    io.DisplayFramebufferScale = ImVec2(dpr, dpr);
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_get_current_context();
    if (ctx) {
        emscripten_set_canvas_element_size("#nyx-coolbar-canvas", (int)(w * dpr), (int)(h * dpr));
    }
}
}

// ── icon codepoints (Font Awesome 4.7, private-use area) ──
static const char* ICON_MIN     = "\xef\x81\xb8"; // fa-minus
static const char* ICON_MAX     = "\xef\xb2\x90"; // fa-window-maximize
static const char* ICON_RESTORE = "\xef\xb2\x92"; // fa-window-restore
static const char* ICON_CLOSE   = "\xef\x80\x8d"; // fa-times
static const char* ICON_USER    = "\xef\x80\x87"; // fa-user
static const char* ICON_COG     = "\xef\x80\x93"; // fa-cog
static const char* ICON_INFO    = "\xef\x81\x9a"; // fa-info-circle
static const char* ICON_QUESTION= "\xef\x81\x99"; // fa-question-circle
static const char* ICON_LINK    = "\xef\x83\x81"; // fa-link
static const char* ICON_GAUGE   = "\xef\x83\xa4"; // fa-tachometer

static ImFont* s_iconFont = nullptr;

static void DrawIconCentered(const ImVec2& center, float size, const char* glyph, ImU32 col) {
    if (!s_iconFont) return;
    const ImVec2 tsz = s_iconFont->CalcTextSizeA(size, FLT_MAX, 0.0f, glyph);
    ImGui::GetWindowDrawList()->AddText(
        s_iconFont, size,
        ImVec2(center.x - tsz.x * 0.5f, center.y - tsz.y * 0.5f),
        col, glyph);
}

static void DrawHoverLabel(const ImVec2& btnMin, const ImVec2& btnMax, const char* text) {
    // name label to the right of a hovered (magnified) item
    const float cy = (btnMin.y + btnMax.y) * 0.5f;
    ImVec2 pos(btnMax.x + 10.0f, cy);
    const char* t = text[0] ? text : nullptr;
    if (!t) return;
    const ImVec2 tsz = ImGui::GetFont()->CalcTextSizeA(14.0f, FLT_MAX, 0.0f, t);
    pos.y -= tsz.y * 0.5f;
    // dark pill behind the label for readability over the game
    const float pad = 5.0f;
    ImGui::GetWindowDrawList()->AddRectFilled(
        ImVec2(pos.x - pad, pos.y - pad),
        ImVec2(pos.x + tsz.x + pad, pos.y + tsz.y + pad),
        IM_COL32(10, 12, 18, 230), 6.0f);
    ImGui::GetWindowDrawList()->AddText(
        ImGui::GetFont(), 14.0f, pos, IM_COL32(255, 255, 255, 255), t);
}

// Draw one item as an icon button; returns true on click.
static bool CoolIcon(const char* id, const char* glyph, const char* name) {
    const bool hovered = ImGui::CoolBarItem();
    const float w = ImGui::GetCoolBarItemWidth();
    const ImVec2 p = ImGui::GetCursorScreenPos();
    const bool clicked = ImGui::InvisibleButton(id, ImVec2(w, w));
    const bool isHover = ImGui::IsItemHovered() || hovered;
    ImU32 col = (isHover) ? IM_COL32(255, 255, 255, 255)
                          : IM_COL32(255, 255, 255, 210);
    const ImVec2 center(p.x + w * 0.5f, p.y + w * 0.5f);
    // subtle tile background on hover
    if (isHover) {
        ImGui::GetWindowDrawList()->AddRectFilled(
            p, ImVec2(p.x + w, p.y + w), IM_COL32(255, 255, 255, 18), 8.0f);
    }
    DrawIconCentered(center, w * 0.62f, glyph, col);
    if (isHover && name) {
        DrawHoverLabel(p, ImVec2(p.x + w, p.y + w), name);
    }
    if (clicked) {
        // prevent double-fire from mouse-up outside
        return ImGui::IsMouseReleased(0);
    }
    return false;
}

static void MainLoop() {
    s_loopTicks++;
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_get_current_context();
    if (ctx) {
        int lost = emscripten_is_webgl_context_lost(ctx);
        char msg[128];
        snprintf(msg, sizeof(msg), "[nyxcoolbar] ctx=%p lost=%d", ctx, lost);
        emscripten_console_log(msg);
    }
    if (ctx && emscripten_is_webgl_context_lost(ctx)) {
        emscripten_console_log("[nyxcoolbar] WebGL context lost, recreating...");
        EmscriptenWebGLContextAttributes attrs;
        emscripten_webgl_init_context_attributes(&attrs);
        attrs.alpha = EM_TRUE;
        attrs.depth = EM_FALSE;
        attrs.stencil = EM_FALSE;
        attrs.antialias = EM_FALSE;
        attrs.premultipliedAlpha = EM_TRUE;
        attrs.preserveDrawingBuffer = EM_TRUE;
        attrs.majorVersion = 2;
        attrs.minorVersion = 0;
        ctx = emscripten_webgl_create_context("#nyx-coolbar-canvas", &attrs);
        if (!ctx) {
            emscripten_console_log("[nyxcoolbar] context recreation failed");
            return;
        }
        emscripten_webgl_make_context_current(ctx);
        if (!ImGui_ImplOpenGL3_Init("#version 300 es")) {
            emscripten_console_log("[nyxcoolbar] OpenGL3 reinit failed");
            return;
        }
    }
    ImGui_ImplOpenGL3_NewFrame();
    ImGui::NewFrame();

    // ── the coolbar: vertical, docked to the left edge, vertically centered ──
    // normalSize 42, hoveredSize 53 = only 25% bigger on hover (user wanted
    // subtle growth, not the huge macOS-dock magnification).
    ImGui::ImCoolBarSettings settings(
        ImVec2(0.0f, 0.5f), // anchor: x=0 left edge, y=0.5 vertical center
        42.0f,              // normalSize
        53.0f,              // hoveredSize (1.25x normal)
        0.08f,              // animStep (snappy)
        0.3f);              // effectStrength (subtle bubble spread)
    settings.mode = ImCoolBarFlags_Vertical;

    if (ImGui::BeginCoolBar("NyxSidebar", settings)) {
        if (CoolIcon("##i_min", ICON_MIN, "Minimize"))
            nyx_emit(NYX_ACT_MINIMIZE, "");
        if (CoolIcon("##i_max", s_maximized ? ICON_RESTORE : ICON_MAX,
                     s_maximized ? "Restore" : "Maximize"))
            nyx_emit(NYX_ACT_MAXIMIZE_TOGGLE, "");
        if (CoolIcon("##i_close", ICON_CLOSE, "Close"))
            nyx_emit(NYX_ACT_CLOSE, "");

        ImGui::Dummy(ImVec2(1.0f, 12.0f)); // visual gap

        if (CoolIcon("##i_profile", ICON_USER,
                     s_profileName[0] ? s_profileName : "Profile"))
            nyx_emit(NYX_ACT_PROFILE, "");
        if (CoolIcon("##i_join", ICON_LINK, "Join Room"))
            nyxShowAddress(true);
        if (CoolIcon("##i_settings", ICON_COG, "Settings"))
            nyx_emit(NYX_ACT_SETTINGS, "");
        if (CoolIcon("##i_about", ICON_INFO, "About"))
            nyx_emit(NYX_ACT_ABOUT, "");
        if (CoolIcon("##i_help", ICON_QUESTION, "Help"))
            nyx_emit(NYX_ACT_HELP, "");

        ImGui::Dummy(ImVec2(1.0f, 12.0f));

        char fpsLabel[64];
        snprintf(fpsLabel, sizeof(fpsLabel), "FPS: %.0f", s_fps);
        if (CoolIcon("##i_fps", ICON_GAUGE, fpsLabel)) {
            // click: refresh (no-op)
        }
    }
    ImGui::EndCoolBar();

    // ── address bar popup (room join) — sized to fit the 220px strip ──
    if (s_showAddress) {
        ImGui::SetNextWindowPos(ImVec2(8.0f, ImGui::GetIO().DisplaySize.y * 0.5f - 70.0f),
                                ImGuiCond_Appearing);
        ImGui::SetNextWindowSize(ImVec2(204.0f, 130.0f), ImGuiCond_Appearing);
        ImGui::Begin("Join Room", nullptr,
                     ImGuiWindowFlags_NoResize | ImGuiWindowFlags_NoCollapse |
                     ImGuiWindowFlags_NoSavedSettings);
        nyx_focus_canvas();
        ImGui::TextUnformatted("Paste a room link:");
        ImGui::SetNextItemWidth(-1.0f);
        const bool enterPressed =
            ImGui::InputText("##addr", s_addressBuf, sizeof(s_addressBuf),
                             ImGuiInputTextFlags_EnterReturnsTrue);
        const bool ok = ImGui::Button("Join") || enterPressed;
        ImGui::SameLine();
        if (ImGui::Button("Cancel")) s_showAddress = false;
        if (ok && s_addressBuf[0]) {
            nyx_emit(NYX_ACT_JOIN, s_addressBuf);
            s_showAddress = false;
            s_addressBuf[0] = '\0';
        }
        if (!s_showAddress) nyx_release_focus();
        ImGui::End();
    }

    ImGui::Render();
    ImGui_ImplOpenGL3_RenderDrawData(ImGui::GetDrawData());
}

// ── input: forwarded from JS (the overlay canvas is pointer-events:none so it
// never blocks the game; the bridge listens on the top document and feeds us) ──

enum NyxKey {
    NK_ENTER, NK_ESCAPE, NK_BACKSPACE, NK_LEFT, NK_RIGHT,
    NK_DELETE, NK_TAB, NK_HOME, NK_END,
    NK_COUNT
};

static void FeedMouse(float mx, float my) {
    ImGui::GetIO().AddMousePosEvent(mx, my);
}

extern "C" {
EMSCRIPTEN_KEEPALIVE void nyxFeedMouse(float x, float y) { FeedMouse(x, y); }

EMSCRIPTEN_KEEPALIVE void nyxFeedButton(int b, int down) {
    if (b >= 0 && b <= 2) ImGui::GetIO().AddMouseButtonEvent(b, down ? true : false);
}

EMSCRIPTEN_KEEPALIVE void nyxFeedWheel(float dx, float dy) {
    ImGui::GetIO().AddMouseWheelEvent(dx, dy);
}

EMSCRIPTEN_KEEPALIVE void nyxFeedKey(int key, int down) {
    if (key < 0 || key >= NK_COUNT) return;
    static const ImGuiKey map[NK_COUNT] = {
        ImGuiKey_Enter, ImGuiKey_Escape, ImGuiKey_Backspace,
        ImGuiKey_LeftArrow, ImGuiKey_RightArrow, ImGuiKey_Delete,
        ImGuiKey_Tab, ImGuiKey_Home, ImGuiKey_End
    };
    ImGui::GetIO().AddKeyEvent(map[key], down ? true : false);
}

EMSCRIPTEN_KEEPALIVE void nyxFeedChar(int c) {
    if (c > 0 && c < 0x10000) ImGui::GetIO().AddInputCharacter((unsigned short)c);
}

// ── debug probe: dump current ImGui input + window state as a JSON string ──
EMSCRIPTEN_KEEPALIVE const char* nyxDebugState() {
    ImGuiIO& io = ImGui::GetIO();
    static char buf[512];
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_get_current_context();
    snprintf(buf, sizeof(buf),
        "{\"mpos\":[%.0f,%.0f],\"down\":%d,\"hoveredWindow\":\"%s\","
        "\"display\":[%.0f,%.0f],\"frames\":%d,\"ticks\":%d,\"ctxLost\":%d}",
        io.MousePos.x, io.MousePos.y, io.MouseDown[0] ? 1 : 0,
        GImGui->HoveredWindow ? GImGui->HoveredWindow->Name : "null",
        io.DisplaySize.x, io.DisplaySize.y, GImGui->FrameCount, s_loopTicks,
        ctx ? emscripten_is_webgl_context_lost(ctx) : 1);
    return buf;
}
}

int main() {
    // ── WebGL2 context on our overlay canvas ──
    EmscriptenWebGLContextAttributes attrs;
    emscripten_webgl_init_context_attributes(&attrs);
    attrs.alpha = EM_TRUE;
    attrs.depth = EM_FALSE;
    attrs.stencil = EM_FALSE;
    attrs.antialias = EM_FALSE;
    attrs.premultipliedAlpha = EM_TRUE;
    attrs.preserveDrawingBuffer = EM_TRUE;
    attrs.majorVersion = 2;
    attrs.minorVersion = 0;

    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx =
        emscripten_webgl_create_context("#nyx-coolbar-canvas", &attrs);
    if (!ctx) {
        emscripten_console_log("[nyxcoolbar] WebGL2 context creation failed");
        return 1;
    }
    emscripten_webgl_make_context_current(ctx);

    // ── imgui ──
    IMGUI_CHECKVERSION();
    ImGui::CreateContext();
    ImGuiIO& io = ImGui::GetIO();
    io.IniFilename = nullptr;      // no .ini persistence
    io.ConfigFlags |= ImGuiConfigFlags_NavEnableKeyboard;

    // readable default font + Font Awesome icon font
    static const ImWchar faRanges[] = { 0xf000, 0xf2ff, 0 };
    ImFontConfig cfg;
    cfg.OversampleH = 2;
    cfg.OversampleV = 2;
    io.Fonts->AddFontFromFileTTF("/DroidSans.ttf", 16.0f, &cfg);
    s_iconFont = io.Fonts->AddFontFromFileTTF("/fontawesome-webfont.ttf", 128.0f, &cfg, faRanges);
    if (!s_iconFont) {
        emscripten_console_log("[nyxcoolbar] failed to load icon font");
    }

    ImGui::StyleColorsDark();
    ImGuiStyle& style = ImGui::GetStyle();
    style.WindowPadding = ImVec2(6.0f, 6.0f);
    style.WindowRounding = 0.0f;
    style.Colors[ImGuiCol_WindowBg] = ImVec4(10, 12, 18, 0);      // fully transparent bar
    style.Colors[ImGuiCol_PopupBg] = ImVec4(0.078f, 0.094f, 0.133f, 0.92f);
    style.Colors[ImGuiCol_Text] = ImVec4(1, 1, 1, 1);
    style.Colors[ImGuiCol_Button] = ImVec4(0, 0, 0, 0);
    style.Colors[ImGuiCol_ButtonHovered] = ImVec4(0, 0, 0, 0);
    style.Colors[ImGuiCol_ButtonActive] = ImVec4(0, 0, 0, 0);
    style.Colors[ImGuiCol_FrameBg] = ImVec4(0.118f, 0.141f, 0.196f, 0.78f);
    style.Colors[ImGuiCol_FrameBgHovered] = ImVec4(0.157f, 0.188f, 0.259f, 0.86f);
    style.Colors[ImGuiCol_FrameBgActive] = ImVec4(0.176f, 0.212f, 0.290f, 0.90f);

    if (!ImGui_ImplOpenGL3_Init("#version 300 es")) {
        emscripten_console_log("[nyxcoolbar] OpenGL3 init failed");
        return 1;
    }

    // ── canvas size ──
    int cw = 0, ch = 0;
    emscripten_get_canvas_element_size("#nyx-coolbar-canvas", &cw, &ch);
    s_displayW = (float)cw;
    s_displayH = (float)ch;
    io.DisplaySize = ImVec2(s_displayW, s_displayH);
    io.DisplayFramebufferScale = ImVec2(1.0f, 1.0f);

    emscripten_console_log("[nyxcoolbar] initialized");

    // rAF-driven loop — CAPPED at 60fps. The game's desynced canvas runs at
    // 1000+ fps and the parent rAF fires at the same rate; rendering a full
    // ImGui + WebGL frame every game frame stole massive GPU time and dropped
    // the game to ~300fps. The sidebar only needs smooth hover animation, so
    // a fixed 60fps loop (setTimeout-based in emscripten) is plenty.
    emscripten_set_main_loop(MainLoop, 60, 1);
    return 0;
}