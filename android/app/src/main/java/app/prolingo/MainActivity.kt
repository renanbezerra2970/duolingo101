package app.prolingo

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.view.WindowInsets
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** O app completo: o próprio site, baixado sob demanda. Abre no celular e na tela do carro parado. */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var recognizer: SpeechRecognizer? = null
    private var pendingFiles: ValueCallback<Array<Uri>>? = null
    private var tts: TextToSpeech? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        web.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }
        web.webViewClient = object : WebViewClient() {
            // qualquer link para fora do Prolingo abre no navegador, longe da ponte com o Android
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == SITE_HOST) return false
                startActivity(Intent(Intent.ACTION_VIEW, request.url))
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            // importar o backup do progresso (Perfil)
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                pendingFiles?.onReceiveValue(null)
                pendingFiles = callback
                startActivityForResult(params.createIntent(), REQ_FILE)
                return true
            }
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            web.addJavascriptInterface(Bridge(), "ProlingoNative")
            val script = assets.open("bridge.js").bufferedReader().use { it.readText() }
            WebViewCompat.addDocumentStartJavaScript(web, script, setOf("https://$SITE_HOST"))
        }
        tts = TextToSpeech(this) {}.apply {
            setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {}
                override fun onDone(utteranceId: String?) = ttsDone(utteranceId)
                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) = ttsDone(utteranceId)
            })
        }
        setContentView(web)
        if (savedInstanceState == null) {
            web.loadUrl(SITE)
            Updater(this).check()
        } else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    // o carro andou (o sistema cobre a tela) ou o app saiu da frente: nada segue tocando
    override fun onPause() {
        web.evaluateJavascript("window.__prolingoPause && __prolingoPause()", null)
        recognizer?.cancel()
        tts?.stop()
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    override fun onDestroy() {
        recognizer?.destroy()
        tts?.shutdown()
        web.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else @Suppress("DEPRECATION") super.onBackPressed()
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            pendingFiles?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            pendingFiles = null
        }
    }

    private fun ttsDone(id: String?) = runOnUiThread { web.evaluateJavascript("window.__prolingoTTS && __prolingoTTS.done($id)", null) }

    private fun toJs(code: String) = runOnUiThread { web.evaluateJavascript("window.__prolingoSR && __prolingoSR.$code", null) }

    private fun listen(lang: String, alternatives: Int) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQ_MIC)
            toJs("error('not-allowed')")
            toJs("end()")
            return
        }
        val rec = recognizer ?: SpeechRecognizer.createSpeechRecognizer(this).also {
            it.setRecognitionListener(Listener())
            recognizer = it
        }
        rec.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, alternatives)
        })
    }

    private inner class Listener : RecognitionListener {
        private fun send(results: Bundle?, isFinal: Boolean) {
            val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            if (list.isNotEmpty()) toJs("result(${JSONArray(list)}, $isFinal)")
        }
        override fun onPartialResults(partialResults: Bundle?) = send(partialResults, false)
        override fun onResults(results: Bundle?) {
            send(results, true)
            toJs("end()")
        }
        override fun onError(error: Int) {
            val code = when (error) {
                SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                else -> "network"
            }
            toJs("error(${JSONObject.quote(code)})")
            toJs("end()")
        }
        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private inner class Bridge {
        @JavascriptInterface fun say(id: Int, text: String, lang: String, rate: Float) = runOnUiThread {
            val engine = tts ?: return@runOnUiThread ttsDone(id.toString())
            engine.language = Locale.forLanguageTag(lang)
            engine.setSpeechRate(rate)
            if (engine.speak(text, TextToSpeech.QUEUE_ADD, null, id.toString()) != TextToSpeech.SUCCESS) ttsDone(id.toString())
        }
        @JavascriptInterface fun sayStop() = runOnUiThread { tts?.stop() }
        @JavascriptInterface fun keepScreen(on: Boolean) = runOnUiThread { web.keepScreenOn = on }
        @JavascriptInterface fun speechAvailable() = SpeechRecognizer.isRecognitionAvailable(this@MainActivity)
        @JavascriptInterface fun startListening(lang: String, alternatives: Int) = runOnUiThread { listen(lang, alternatives) }
        @JavascriptInterface fun stopListening() = runOnUiThread { recognizer?.stopListening() }
        @JavascriptInterface fun cancelListening() = runOnUiThread {
            recognizer?.cancel()
            toJs("end()")
        }
    }

    private companion object {
        const val REQ_FILE = 1
        const val REQ_MIC = 2
    }
}
