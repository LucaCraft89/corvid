// UNVERIFIED: never compiled or run. Package/class paths are placeholders; real location is
// src-overlay/corvid/android/theme/ once the GN/Java target exists. See DESIGN.md.
package org.corvid.android.theme

import android.content.ComponentCallbacks
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.app.UiModeManager

/** Snapshot of platform colors. palette == null means "use the stored seed". */
data class PlatformScheme(
    val dark: Boolean,
    val contrast: Float,                 // -1..1 (UiModeManager.getContrast on API 34+), else 0
    val accent: Int?,                    // ARGB or null
    val palette: Map<String, IntArray>?, // "accent1".."neutral2" -> tones [0,10,50,100..1000]
)

class CorvidDynamicColorProvider(private val appContext: Context) : ComponentCallbacks {

    private val listeners = mutableListOf<(PlatformScheme) -> Unit>()
    private val main = Handler(Looper.getMainLooper())
    private var last: Int = 0
    private val debounced = Runnable { emitIfChanged() }

    fun start() = appContext.registerComponentCallbacks(this)
    fun stop() = appContext.unregisterComponentCallbacks(this)

    fun onChange(cb: (PlatformScheme) -> Unit) { listeners += cb }

    fun snapshot(): PlatformScheme {
        val cfg = appContext.resources.configuration
        val dark = (cfg.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        var contrast = 0f
        if (Build.VERSION.SDK_INT >= 34) {
            val um = appContext.getSystemService(UiModeManager::class.java)
            contrast = um?.contrast ?: 0f
        }
        if (Build.VERSION.SDK_INT < 31) return PlatformScheme(dark, contrast, null, null)

        val r = appContext.resources
        val t = appContext.theme
        fun tones(prefix: String): IntArray {
            val names = listOf("0", "10", "50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "1000")
            return IntArray(names.size) { i ->
                val id = r.getIdentifier("system_${prefix}_${names[i]}", "color", "android")
                if (id == 0) 0 else r.getColor(id, t)
            }
        }
        val pal = mapOf(
            "accent1" to tones("accent1"), "accent2" to tones("accent2"), "accent3" to tones("accent3"),
            "neutral1" to tones("neutral1"), "neutral2" to tones("neutral2"),
        )
        return PlatformScheme(dark, contrast, pal["accent1"]?.get(8), pal)
    }

    private fun emitIfChanged() {
        val s = snapshot()
        val h = (s.dark.hashCode() * 31 + s.contrast.hashCode()) * 31 +
            (s.palette?.values?.sumOf { it.contentHashCode() } ?: 0)
        if (h == last) return
        last = h
        listeners.forEach { it(s) }
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        main.removeCallbacks(debounced)
        main.postDelayed(debounced, 100)
    }

    @Deprecated("required by interface") override fun onLowMemory() {}
}
