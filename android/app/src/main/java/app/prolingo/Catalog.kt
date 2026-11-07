package app.prolingo

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

const val SITE_HOST = "prolingo101.vercel.app"
const val SITE = "https://$SITE_HOST/"

/** As lições vistas como áudio: lê os mesmos JSON do site, só quando são abertos, e guarda uma cópia para ficar sem sinal. */
class Catalog(context: Context) {
    private val dir = File(context.cacheDir, "json").apply { mkdirs() }
    private val memory = ConcurrentHashMap<String, JSONObject>()

    private fun load(path: String): JSONObject = memory.getOrPut(path) {
        val copy = File(dir, path.replace('/', '_'))
        val text = try {
            (URL(SITE + path).openConnection() as HttpURLConnection).run {
                connectTimeout = 6000
                readTimeout = 10000
                inputStream.bufferedReader().use { it.readText() }
            }.also { copy.writeText(it) }
        } catch (e: java.io.IOException) {
            if (!copy.exists()) throw e
            copy.readText()
        }
        JSONObject(text)
    }

    private fun groups(section: String) = load("data/units.json").optJSONArray(section)?.objects().orEmpty()
    private fun unit(id: String) = (groups("units") + groups("pro")).first { it.getString("id") == id }
    private fun lesson(unit: JSONObject, id: String) =
        load(unit.getString("file")).getJSONArray("lessons").objects().first { it.getString("id") == id }

    /** Árvore: seção › unidade › lição › nível. Tocar um nível toca a história inteira. */
    fun children(parent: String): List<MediaItem> {
        val p = parent.split(":")
        return when (p[0]) {
            ROOT -> listOf(folder("s:units", "Histórias"), folder("s:pro", "Profissões"))
            "s" -> groups(p[1]).map {
                folder("u:${it.getString("id")}", "${it.getString("emoji")} ${it.getString("title")}", it.getString("subtitle"))
            }
            "u" -> load(unit(p[1]).getString("file")).getJSONArray("lessons").objects().map {
                folder("l:${p[1]}:${it.getString("id")}", "${it.getString("emoji")} ${it.getString("title")}", it.getString("titlePt"))
            }
            "l" -> load("data/levels.json").getJSONArray("levels").objects().filter { it.getInt("n") > 0 }.map {
                val meta = MediaMetadata.Builder().setTitle("Nível ${it.getInt("n")} · ${it.getString("name")}")
                    .setSubtitle(it.getString("cefr")).setIsBrowsable(false).setIsPlayable(true)
                    .setMediaType(MediaMetadata.MEDIA_TYPE_PLAYLIST).build()
                MediaItem.Builder().setMediaId("p:${p[1]}:${p[2]}:${it.getInt("n")}").setMediaMetadata(meta).build()
            }
            else -> emptyList()
        }
    }

    /** As falas de uma lição, cada uma um item: inglês no título e português no subtítulo. */
    fun lines(playId: String): List<MediaItem> {
        val (_, unitId, lessonId, levelText) = playId.split(":")
        val level = levelText.toInt()
        val unit = unit(unitId)
        val base = load(unit.getString("file"))
        val lesson = lesson(unit, lessonId)
        val extra = if (level == 1) null else load("data/levels/u$unitId-$level.json")
        val steps = extra?.getJSONObject("lessons")?.getJSONArray(lessonId) ?: lesson.getJSONArray("steps")
        val cast = base.getJSONObject("cast")
        val rate = load("data/levels.json").getJSONArray("levels").objects().first { it.getInt("n") == level }.getString("rate")
        return (0 until steps.length()).mapNotNull { steps.opt(it) as? JSONArray }.mapIndexed { i, step ->
            val who = step.getString(0)
            val person = extra?.optJSONObject("cast")?.optJSONObject(who) ?: cast.getJSONObject(who)
            val en = step.getString(1)
            val meta = MediaMetadata.Builder().setTitle(en).setArtist(step.getString(2))
                .setAlbumTitle(lesson.getString("title")).setSubtitle(step.getString(2))
                .setIsBrowsable(false).setIsPlayable(true).setMediaType(MediaMetadata.MEDIA_TYPE_MUSIC).build()
            MediaItem.Builder().setMediaId("$playId#$i").setUri(audioUri(person.getString("voice"), en, rate))
                .setMediaMetadata(meta).build()
        }
    }

    // mesmo nome de arquivo de tools/gerar_audio.py (file_for) e app.js (sentenceKey)
    private fun audioUri(voice: String, text: String, rate: String): Uri {
        val key = if (rate == "-5%") "$voice|$text" else "$voice|$text|$rate"
        val sha = MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
        return Uri.parse("${SITE}audio/${sha.take(12)}.mp3")
    }

    private fun folder(id: String, title: String, subtitle: String? = null) = MediaItem.Builder().setMediaId(id)
        .setMediaMetadata(
            MediaMetadata.Builder().setTitle(title).setSubtitle(subtitle).setIsBrowsable(true).setIsPlayable(false).build()
        )
        .build()

    companion object {
        const val ROOT = "root"
        fun rootItem() = MediaItem.Builder().setMediaId(ROOT).setMediaMetadata(
            MediaMetadata.Builder().setTitle("Prolingo").setIsBrowsable(true).setIsPlayable(false).build()
        ).build()
    }
}

private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }
