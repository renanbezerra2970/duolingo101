@file:androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)

package app.prolingo

import android.app.PendingIntent
import android.content.Intent
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.database.StandaloneDatabaseProvider
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import androidx.media3.session.SessionError
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import java.io.File
import java.util.concurrent.Executors

/** O Prolingo para ouvir: funciona com o carro em movimento, na tela de mídia do Android Auto. */
class PlaybackService : MediaLibraryService() {
    private val io = MoreExecutors.listeningDecorator(Executors.newFixedThreadPool(3))
    private lateinit var catalog: Catalog
    private lateinit var cache: SimpleCache
    private lateinit var audio: CacheDataSource.Factory
    private var session: MediaLibrarySession? = null

    override fun onCreate() {
        super.onCreate()
        catalog = Catalog(this)
        cache = SimpleCache(File(cacheDir, "audio"), LeastRecentlyUsedCacheEvictor(CACHE_BYTES), StandaloneDatabaseProvider(this))
        audio = CacheDataSource.Factory().setCache(cache).setUpstreamDataSourceFactory(DefaultHttpDataSource.Factory())
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(audio))
            .setAudioAttributes(
                AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_SPEECH).build(), true,
            )
            .setHandleAudioBecomingNoisy(true)
            .build()
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        session = MediaLibrarySession.Builder(this, player, Callback()).setSessionActivity(open).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo) = session

    override fun onDestroy() {
        session?.run {
            player.release()
            release()
        }
        io.shutdownNow()
        cache.release()
        super.onDestroy()
    }

    // ao abrir a lição, baixa logo todas as falas: o sinal pode cair no meio do caminho
    private fun download(lines: List<MediaItem>) = io.execute {
        for (line in lines) {
            val uri = line.localConfiguration?.uri ?: continue
            try {
                CacheWriter(audio.createDataSource(), DataSpec(uri), null, null).cache()
            } catch (_: java.io.IOException) {
                return@execute // sem rede: o player tenta de novo quando chegar nessa fala
            }
        }
    }

    private fun expand(items: List<MediaItem>): List<MediaItem> =
        items.flatMap { if (it.mediaId.startsWith("p:")) catalog.lines(it.mediaId) else listOf(it) }
            .also { download(it) }

    private inner class Callback : MediaLibrarySession.Callback {
        override fun onGetLibraryRoot(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, params: LibraryParams?,
        ) = Futures.immediateFuture(LibraryResult.ofItem(Catalog.rootItem(), params))

        override fun onGetChildren(
            session: MediaLibrarySession, browser: MediaSession.ControllerInfo, parentId: String,
            page: Int, pageSize: Int, params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> = io.submit<LibraryResult<ImmutableList<MediaItem>>> {
            try {
                LibraryResult.ofItemList(ImmutableList.copyOf(catalog.children(parentId)), params)
            } catch (_: java.io.IOException) {
                LibraryResult.ofError(SessionError.ERROR_IO)
            }
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
            startIndex: Int, startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> = io.submit<MediaSession.MediaItemsWithStartPosition> {
            MediaSession.MediaItemsWithStartPosition(expand(mediaItems), startIndex, startPositionMs)
        }

        override fun onAddMediaItems(
            mediaSession: MediaSession, controller: MediaSession.ControllerInfo, mediaItems: MutableList<MediaItem>,
        ): ListenableFuture<MutableList<MediaItem>> = io.submit<MutableList<MediaItem>> { expand(mediaItems).toMutableList() }
    }

    private companion object {
        const val CACHE_BYTES = 200L * 1024 * 1024 // passou disso, os áudios mais antigos saem sozinhos
    }
}
