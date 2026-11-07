package app.prolingo

import android.content.ComponentName
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaBrowser
import androidx.media3.session.SessionToken
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Faz o papel do Android Auto: navega pela árvore de lições e toca uma história. */
@RunWith(AndroidJUnit4::class)
class PlaybackTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val main = android.os.Handler(context.mainLooper)

    private fun <T> onMain(block: () -> T): T {
        var out: Result<T>? = null
        val done = CountDownLatch(1)
        main.post { out = runCatching(block); done.countDown() }
        done.await(120, TimeUnit.SECONDS)
        return out!!.getOrThrow()
    }

    private fun titles(browser: MediaBrowser, id: String) = onMain { browser.getChildren(id, 0, 500, null) }.get(60, TimeUnit.SECONDS).let {
        assertEquals(LibraryResult.RESULT_SUCCESS, it.resultCode)
        it.value!!
    }

    @Test
    fun browsesAndPlaysEverySection() {
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        val future = onMain { MediaBrowser.Builder(context, token).setApplicationLooper(context.mainLooper).buildAsync() }
        val browser = future.get(30, TimeUnit.SECONDS)

        val root = onMain { browser.getLibraryRoot(null) }.get(30, TimeUnit.SECONDS).value!!
        val sections = titles(browser, root.mediaId)
        assertEquals(2, sections.size)
        for (section in sections) {
            val units = titles(browser, section.mediaId)
            assertTrue(units.isNotEmpty())
            for (unit in units) assertEquals(5, titles(browser, unit.mediaId).size)
        }
        val unit = titles(browser, sections[0].mediaId).last()
        val lesson = titles(browser, unit.mediaId).first()
        val levels = titles(browser, lesson.mediaId)
        assertEquals(5, levels.size)

        for (level in listOf(levels[0], levels[4])) {
            val ready = CountDownLatch(1)
            var error: PlaybackException? = null
            val listener = object : Player.Listener {
                override fun onIsPlayingChanged(isPlaying: Boolean) { if (isPlaying) ready.countDown() }
                override fun onPlayerError(e: PlaybackException) { error = e; ready.countDown() }
            }
            onMain {
                browser.addListener(listener)
                browser.setMediaItem(level)
                browser.prepare()
                browser.play()
            }
            val ok = ready.await(30, TimeUnit.SECONDS)
            val st = onMain { "state=${browser.playbackState} count=${browser.mediaItemCount} pwr=${browser.playWhenReady} suppress=${browser.playbackSuppressionReason} err=${browser.playerError} title=${browser.mediaMetadata.title} buffered=${browser.bufferedPosition} dur=${browser.duration}" }
            assertTrue("não começou a tocar: $st", ok)
            assertEquals(null, error)
            val (count, title) = onMain { browser.mediaItemCount to browser.mediaMetadata.title.toString() }
            println("TOCANDO ${level.mediaMetadata.title}: $count falas, começa com: $title")
            assertTrue(count > 10)
            // todas as falas têm áudio publicado
            onMain {
                repeat(count - 1) { browser.seekToNextMediaItem() }
                browser.removeListener(listener)
            }
            Thread.sleep(3000)
            assertEquals(null, onMain { browser.playerError })
        }
        onMain { browser.stop(); browser.release() }
    }
}
