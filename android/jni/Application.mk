# ============================================================
# Application.mk — NDK Build Configuration
# OBINexus Computing — Nnamdi Michael Okpala
# NSIGII Tripartite Consensus Human Rights Protocol
# ============================================================
#
# Target ABIs: arm64-v8a (primary), armeabi-v7a (legacy),
#              x86_64 (emulator)
# Min API:     21 (Android 5.0 Lollipop)
# STL:         c++_static (no runtime dependency)
# ============================================================

APP_ABI      := arm64-v8a armeabi-v7a x86_64
APP_PLATFORM := android-21
APP_STL      := c++_static
APP_CFLAGS   := -std=c11 -DANDROID
APP_OPTIM    := release
