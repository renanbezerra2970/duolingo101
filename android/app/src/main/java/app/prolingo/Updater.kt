package app.prolingo

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/** Ao abrir o app, procura versão nova do APK no site. Só baixa e instala se a pessoa autorizar. */
class Updater(private val activity: Activity) {
    private fun open(path: String) = (URL("${SITE}apk/$path").openConnection() as HttpURLConnection).apply {
        connectTimeout = 15000
        readTimeout = 30000
        useCaches = false
    }

    fun check() {
        thread {
            val latest = runCatching { JSONObject(open("version.json").inputStream.bufferedReader().use { it.readText() }) }.getOrNull() ?: return@thread
            val current = activity.packageManager.getPackageInfo(activity.packageName, 0)
            if (latest.optLong("versionCode") > current.longVersionCode) ui { ask(latest.optString("versionName"), current.versionName, latest.optString("notes")) }
        }
    }

    private fun ui(block: () -> Unit) = activity.runOnUiThread { if (!activity.isDestroyed) block() }

    private fun ask(version: String, current: String?, notes: String) {
        AlertDialog.Builder(activity)
            .setTitle("Nova versão do Prolingo")
            .setMessage("A versão $version está disponível (você tem a $current).\n\n$notes\n\nQuer atualizar agora?")
            .setPositiveButton("Atualizar") { _, _ -> download() }
            .setNegativeButton("Agora não", null)
            .show()
    }

    private fun download() {
        val progress = AlertDialog.Builder(activity).setTitle("Atualizando").setMessage("Baixando…").setCancelable(false).show()
        thread {
            val apk = runCatching {
                val file = File(activity.cacheDir, "update/Prolingo.apk").apply { parentFile!!.mkdirs() }
                val conn = open("Prolingo.apk")
                val total = conn.contentLengthLong
                conn.inputStream.use { input ->
                    file.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        var done = 0L
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            output.write(buffer, 0, n)
                            done += n
                            if (total > 0) ui { progress.setMessage("Baixando… ${done * 100 / total}%") }
                        }
                    }
                }
                file
            }.getOrNull()
            ui {
                progress.dismiss()
                if (apk != null) install(apk) else AlertDialog.Builder(activity)
                    .setTitle("Não deu para baixar")
                    .setMessage("Verifique a internet. O app pergunta de novo na próxima vez que abrir.")
                    .setPositiveButton("OK", null)
                    .show()
            }
        }
    }

    // o instalador do Android confere a assinatura e pede a confirmação final
    private fun install(apk: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.files", apk)
        activity.startActivity(Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        })
    }
}
