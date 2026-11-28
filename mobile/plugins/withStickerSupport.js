const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withMainActivity,
  withMainApplication,
  withDangerousMod,
  AndroidConfig,
} = require('expo/config-plugins');

const STICKER_INTENT_KOTLIN = `package com.kavindu.chatter

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import com.facebook.proguard.annotations.DoNotStrip
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.uimanager.ViewManager
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.Executors

data class StickerIntentPayload(
  val type: String,
  val paths: List<String> = emptyList(),
  val packName: String? = null,
  val author: String? = null,
  val trayPath: String? = null,
  val errorMessage: String? = null,
) {
  fun toWritableMap(): WritableMap {
    val map = Arguments.createMap()
    map.putString("type", type)
    val arr: WritableArray = Arguments.createArray()
    paths.forEach { arr.pushString(it) }
    map.putArray("paths", arr)
    packName?.let { map.putString("packName", it) }
    author?.let { map.putString("author", it) }
    trayPath?.let { map.putString("trayPath", it) }
    errorMessage?.let { map.putString("message", it) }
    return map
  }
}

object StickerIntentHandler {
  private val executor = Executors.newSingleThreadExecutor()
  private val pendingQueue = ConcurrentLinkedQueue<StickerIntentPayload>()
  @Volatile
  private var reactContextRef: ReactApplicationContext? = null
  @Volatile
  private var jsListenerReady: Boolean = false
  @Volatile
  private var lastIntentIdentity: Int = 0
  @Volatile
  private var lastIntentSignature: String? = null
  @Volatile
  private var lastIntentTimeMs: Long = 0L

  fun attachReactContext(context: ReactApplicationContext) {
    reactContextRef = context
  }

  fun setListenerReady(ready: Boolean) {
    jsListenerReady = ready
  }

  fun consumePending(): WritableArray {
    jsListenerReady = true
    val arr = Arguments.createArray()
    while (true) {
      val item = pendingQueue.poll() ?: break
      arr.pushMap(item.toWritableMap())
    }
    return arr
  }

  private fun dispatch(payload: StickerIntentPayload) {
    val ctx = reactContextRef
    if (jsListenerReady && ctx != null && ctx.hasActiveReactInstance()) {
      ctx.runOnUiQueueThread {
        try {
          if (jsListenerReady && ctx.hasActiveReactInstance()) {
            ctx
              .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
              .emit("onStickerIntent", payload.toWritableMap())
          } else {
            pendingQueue.add(payload)
          }
        } catch (_: Throwable) {
          pendingQueue.add(payload)
        }
      }
    } else {
      pendingQueue.add(payload)
    }
  }

  fun handleIntent(context: Context, intent: Intent?) {
    if (intent == null) return
    if ((intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return

    val action = intent.action ?: return
    if (
      action != Intent.ACTION_SEND &&
      action != Intent.ACTION_SEND_MULTIPLE &&
      action != Intent.ACTION_VIEW &&
      action != "com.whatsapp.intent.action.ENABLE_STICKER_PACK"
    ) {
      return
    }

    if (action == Intent.ACTION_VIEW && intent.data?.scheme == "chatter") {
      return
    }

    // Deduplicate only the exact same Intent instance / immediate duplicate redelivery so retries always work
    val identity = System.identityHashCode(intent)
    val signature = buildString {
      append(action).append("|")
      append(intent.dataString ?: "").append("|")
      append(intent.getStringExtra("sticker_pack_authority") ?: "").append("|")
      append(intent.getStringExtra("sticker_pack_id") ?: "")
      extractAllUris(intent).forEach { append("|").append(it.toString()) }
    }
    val nowMs = System.currentTimeMillis()
    if (identity == lastIntentIdentity && signature == lastIntentSignature && (nowMs - lastIntentTimeMs) < 1500L) {
      return
    }
    lastIntentIdentity = identity
    lastIntentSignature = signature
    lastIntentTimeMs = nowMs

    val appContext = context.applicationContext

    if (action == "com.whatsapp.intent.action.ENABLE_STICKER_PACK") {
      val packId = intent.getStringExtra("sticker_pack_id")
      val authority = intent.getStringExtra("sticker_pack_authority")
      val packNameExtra = intent.getStringExtra("sticker_pack_name")

      dispatch(StickerIntentPayload(type = "started", packName = packNameExtra ?: "WhatsApp Stickers"))
      executor.execute {
        importWhatsAppProviderPack(appContext, authority, packId, packNameExtra)
      }
      return
    }

    val uris = extractAllUris(intent)
    if (uris.isEmpty()) return

    dispatch(StickerIntentPayload(type = "started", packName = "Sticker Pack"))
    executor.execute {
      val outDir = File(appContext.cacheDir, "incoming_stickers/\${System.currentTimeMillis()}").apply {
        mkdirs()
      }
      val copied = mutableListOf<String>()
      for ((idx, uri) in uris.take(60).withIndex()) {
        val local = copyUriToCache(appContext, uri, outDir, "shared", idx)
        if (local != null) copied.add(local)
      }
      if (copied.isNotEmpty()) {
        dispatch(StickerIntentPayload(type = "files", paths = copied))
      } else {
        dispatch(
          StickerIntentPayload(
            type = "error",
            errorMessage = "Could not read shared sticker file from that app. Check storage/file format and try again.",
          )
        )
      }
    }
  }

  private fun extractAllUris(intent: Intent): List<Uri> {
    val result = mutableListOf<Uri>()
    when (intent.action) {
      Intent.ACTION_VIEW -> {
        intent.data?.let { result.add(it) }
      }
      Intent.ACTION_SEND -> {
        val single = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
        }
        if (single != null) {
          result.add(single)
        } else if (intent.clipData != null && intent.clipData!!.itemCount > 0) {
          for (i in 0 until intent.clipData!!.itemCount) {
            intent.clipData!!.getItemAt(i).uri?.let { result.add(it) }
          }
        } else {
          intent.data?.let { result.add(it) }
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        val multi = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        }
        if (multi != null) {
          multi.filterNotNull().forEach { result.add(it) }
        }
        if (result.isEmpty() && intent.clipData != null) {
          for (i in 0 until intent.clipData!!.itemCount) {
            intent.clipData!!.getItemAt(i).uri?.let { result.add(it) }
          }
        }
      }
    }
    return result
  }

  private fun queryDisplayName(context: Context, uri: Uri): String? {
    return try {
      context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
      }
    } catch (_: Throwable) {
      null
    }
  }

  private fun detectExtension(header: ByteArray, readLen: Int, nameHint: String?): String {
    if (readLen >= 4 &&
      header[0] == 0x50.toByte() &&
      header[1] == 0x4B.toByte() &&
      header[2] == 0x03.toByte() &&
      header[3] == 0x04.toByte()
    ) {
      return "wastickers"
    }
    if (readLen >= 12 &&
      header[0] == 'R'.code.toByte() &&
      header[1] == 'I'.code.toByte() &&
      header[2] == 'F'.code.toByte() &&
      header[3] == 'F'.code.toByte() &&
      header[8] == 'W'.code.toByte() &&
      header[9] == 'E'.code.toByte() &&
      header[10] == 'B'.code.toByte() &&
      header[11] == 'P'.code.toByte()
    ) {
      return "webp"
    }
    if (readLen >= 4 &&
      header[0] == 0x89.toByte() &&
      header[1] == 0x50.toByte() &&
      header[2] == 0x4E.toByte() &&
      header[3] == 0x47.toByte()
    ) {
      return "png"
    }
    val lower = nameHint?.lowercase() ?: ""
    return when {
      lower.endsWith(".wastickers") || lower.endsWith(".wasticker") -> "wastickers"
      lower.endsWith(".zip") -> "zip"
      lower.endsWith(".webp") -> "webp"
      lower.endsWith(".png") -> "png"
      else -> "webp"
    }
  }

  private fun copyUriToCache(
    context: Context,
    uri: Uri,
    dir: File,
    fallbackPrefix: String,
    index: Int,
  ): String? {
    return try {
      if (uri.scheme == "file" && uri.path != null) {
        val direct = File(uri.path!!)
        if (direct.exists() && direct.canRead()) {
          return "file://\${direct.absolutePath}"
        }
      }
      val displayName = queryDisplayName(context, uri) ?: uri.lastPathSegment
      context.contentResolver.openInputStream(uri)?.use { input ->
        val header = ByteArray(16)
        val firstRead = input.read(header)
        if (firstRead <= 0) return null
        val ext = detectExtension(header, firstRead, displayName)
        val baseWithoutExt = (displayName ?: fallbackPrefix).replace(Regex("\\\\.[^.]+$"), "")
        val cleanBase = baseWithoutExt
          .replace(Regex("[^a-zA-Z0-9_-]"), "_")
          .take(28)
          .ifEmpty { fallbackPrefix }
        // Prefix index so truncated display names never overwrite previous stickers
        val outFile = File(dir, "\${index}_\${cleanBase}.\${ext}")
        FileOutputStream(outFile).use { out ->
          out.write(header, 0, firstRead)
          input.copyTo(out)
        }
        "file://\${outFile.absolutePath}"
      }
    } catch (se: SecurityException) {
      throw se
    } catch (_: Throwable) {
      null
    }
  }

  private fun buildContentUri(authority: String, vararg segments: String): Uri {
    val builder = Uri.Builder().scheme("content").authority(authority)
    for (seg in segments) {
      builder.appendPath(seg)
    }
    return builder.build()
  }

  private fun importWhatsAppProviderPack(
    context: Context,
    authority: String?,
    packId: String?,
    packNameExtra: String?,
  ) {
    if (authority.isNullOrBlank() || packId.isNullOrBlank()) {
      dispatch(
        StickerIntentPayload(
          type = "error",
          errorMessage = "The Sticker Maker app did not send a valid pack ID or provider authority. Try Export / Share (.wastickers) instead.",
        )
      )
      return
    }

    try {
      var packTitle = packNameExtra?.takeIf { it.isNotBlank() } ?: "WhatsApp Stickers"
      var publisher = "Sticker Maker"
      var trayFileName: String? = null
      var metaFound = false

      fun readMeta(uri: Uri): Boolean {
        var matched = false
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
          val idIdx = listOf("sticker_pack_identifier", "identifier")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }
          val nameIdx = listOf("sticker_pack_name", "name")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }
          val pubIdx = listOf("sticker_pack_publisher", "publisher", "author")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }
          val trayIdx = listOf("sticker_pack_icon", "tray_image_file")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }

          while (cursor.moveToNext()) {
            val rowId = idIdx?.let { cursor.getString(it) }
            if (rowId == null || rowId == packId) {
              matched = true
              nameIdx?.let { cursor.getString(it) }?.takeIf { it.isNotBlank() }?.let { packTitle = it }
              pubIdx?.let { cursor.getString(it) }?.takeIf { it.isNotBlank() }?.let { publisher = it }
              trayIdx?.let { cursor.getString(it) }?.takeIf { it.isNotBlank() }?.let { trayFileName = it }
              break
            }
          }
        }
        return matched
      }

      val singleMetaUri = buildContentUri(authority, "metadata", packId)
      val allMetaUri = buildContentUri(authority, "metadata")
      try {
        metaFound = readMeta(singleMetaUri)
      } catch (se: SecurityException) {
        throw se
      } catch (_: Throwable) {
        metaFound = false
      }
      if (!metaFound) {
        try {
          readMeta(allMetaUri)
        } catch (se: SecurityException) {
          throw se
        } catch (_: Throwable) {
          // Proceed cleanly with packNameExtra fallback
        }
      }

      val stickerNames = mutableListOf<String>()
      fun readStickers(uri: Uri) {
        context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
          val fileIdx = listOf("sticker_file_name", "sticker_file", "image_file")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }
          val packIdx = listOf("sticker_pack_identifier", "identifier")
            .firstNotNullOfOrNull { col -> cursor.getColumnIndex(col).takeIf { it >= 0 } }
          while (cursor.moveToNext() && stickerNames.size < 60) {
            val rowPack = packIdx?.let { cursor.getString(it) }
            if (rowPack != null && rowPack != packId) continue
            if (fileIdx != null) {
              cursor.getString(fileIdx)?.takeIf { it.isNotBlank() }?.let { stickerNames.add(it) }
            }
          }
        }
      }

      val packStickersUri = buildContentUri(authority, "stickers", packId)
      try {
        readStickers(packStickersUri)
      } catch (se: SecurityException) {
        throw se
      } catch (_: Throwable) {
        readStickers(buildContentUri(authority, "stickers"))
      }

      if (stickerNames.isEmpty()) {
        dispatch(
          StickerIntentPayload(
            type = "error",
            packName = packTitle,
            errorMessage = "The Sticker Maker provider returned 0 stickers for \\"\$packTitle\\". Try exporting as .wastickers or sharing images to Chatter.",
          )
        )
        return
      }

      val destDir = File(context.cacheDir, "incoming_stickers/wa_\${System.currentTimeMillis()}").apply {
        mkdirs()
      }

      val copiedPaths = mutableListOf<String>()
      for ((idx, rawName) in stickerNames.withIndex()) {
        // Properly encode segments so filenames with spaces/characters work cleanly
        val assetUri = buildContentUri(authority, "stickers_asset", packId, rawName)
        copyUriToCache(context, assetUri, destDir, "stk", idx)?.let { copiedPaths.add(it) }
      }

      var trayLocalPath: String? = null
      if (!trayFileName.isNullOrBlank()) {
        val trayUri = buildContentUri(authority, "stickers_asset", packId, trayFileName!!)
        trayLocalPath = try {
          copyUriToCache(context, trayUri, destDir, "tray", 999)
        } catch (_: Throwable) {
          null
        }
      }

      if (copiedPaths.isEmpty()) {
        dispatch(
          StickerIntentPayload(
            type = "error",
            packName = packTitle,
            errorMessage = "Could not copy sticker image assets from \\"\$packTitle\\". Export as .wastickers or share images instead.",
          )
        )
        return
      }

      dispatch(
        StickerIntentPayload(
          type = "wa_pack",
          paths = copiedPaths,
          packName = packTitle,
          author = publisher,
          trayPath = trayLocalPath,
        )
      )
    } catch (_: SecurityException) {
      dispatch(
        StickerIntentPayload(
          type = "error",
          packName = packNameExtra ?: "Sticker Pack",
          errorMessage = "Android blocked access because this Sticker Maker app locks Add-to-WhatsApp with WhatsApp-only permissions (com.whatsapp.sticker.READ). Use Export / Share (.wastickers or images) to add to Chatter instead.",
        )
      )
    } catch (t: Throwable) {
      dispatch(
        StickerIntentPayload(
          type = "error",
          packName = packNameExtra ?: "Sticker Pack",
          errorMessage = t.message ?: "Failed to read sticker pack from external app.",
        )
      )
    }
  }
}

@DoNotStrip
class StickerIntentModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  init {
    StickerIntentHandler.attachReactContext(reactContext)
  }

  override fun getName(): String = "StickerIntentModule"

  @ReactMethod
  @DoNotStrip
  fun consumePendingImports(promise: Promise) {
    try {
      promise.resolve(StickerIntentHandler.consumePending())
    } catch (t: Throwable) {
      promise.reject("STICKER_INTENT_ERR", t.message, t)
    }
  }

  @ReactMethod
  @DoNotStrip
  fun addListener(eventName: String) {
    if (eventName == "onStickerIntent") {
      StickerIntentHandler.setListenerReady(true)
    }
  }

  @ReactMethod
  @DoNotStrip
  fun removeListeners(count: Int) {
    if (count > 0) {
      StickerIntentHandler.setListenerReady(false)
    }
  }
}

@DoNotStrip
class StickerIntentPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(StickerIntentModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}
`;

function applyManifestStickerFilters(manifest) {
  const perms = Array.isArray(manifest['uses-permission']) ? manifest['uses-permission'] : [];
  if (!perms.some((p) => p.$?.['android:name'] === 'com.whatsapp.sticker.READ')) {
    perms.push({ $: { 'android:name': 'com.whatsapp.sticker.READ' } });
  }
  manifest['uses-permission'] = perms;

  const application = manifest.application?.[0];
  if (!application || !Array.isArray(application.activity)) return manifest;

  const mainActivity = application.activity.find(
    (act) => act.$?.['android:name'] === '.MainActivity'
  );
  if (!mainActivity) return manifest;

  const existingFilters = Array.isArray(mainActivity['intent-filter'])
    ? mainActivity['intent-filter']
    : [];
  const preservedFilters = existingFilters.filter((filter) => {
    const actions = (filter.action || []).map((a) => a.$?.['android:name']);
    const isOldViewOrSend =
      (actions.includes('android.intent.action.VIEW') &&
        filter.data?.some(
          (d) =>
            d.$?.['android:mimeType']?.includes('wasticker') ||
            d.$?.['android:pathPattern']?.includes('wasticker')
        )) ||
      actions.includes('android.intent.action.SEND') ||
      actions.includes('android.intent.action.SEND_MULTIPLE') ||
      actions.includes('com.whatsapp.intent.action.ENABLE_STICKER_PACK');
    return !isOldViewOrSend;
  });

  const viewCategory = [
    { $: { 'android:name': 'android.intent.category.DEFAULT' } },
    { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
  ];

  preservedFilters.push(
    {
      action: [{ $: { 'android:name': 'com.whatsapp.intent.action.ENABLE_STICKER_PACK' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: viewCategory,
      data: [
        { $: { 'android:mimeType': 'application/vnd.wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/vnd.wastickers', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'application/x-wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/x-wastickers', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'application/wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/wastickers', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'application/wasticker', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/wasticker', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'image/webp.wasticker', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'image/webp.wasticker', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'image/webp.wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'image/webp.wastickers', 'android:scheme': 'file' } },
      ],
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: viewCategory,
      data: [
        { $: { 'android:scheme': 'content', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\.wastickers' } },
        { $: { 'android:scheme': 'content', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\.wasticker' } },
        { $: { 'android:scheme': 'content', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\..*\\\\.wastickers' } },
        { $: { 'android:scheme': 'content', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\..*\\\\.wasticker' } },
        { $: { 'android:scheme': 'file', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\.wastickers' } },
        { $: { 'android:scheme': 'file', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\.wasticker' } },
        { $: { 'android:scheme': 'file', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\..*\\\\.wastickers' } },
        { $: { 'android:scheme': 'file', 'android:host': '*', 'android:mimeType': '*/*', 'android:pathPattern': '.*\\\\..*\\\\.wasticker' } },
      ],
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        { $: { 'android:mimeType': 'application/vnd.wastickers' } },
        { $: { 'android:mimeType': 'application/x-wastickers' } },
        { $: { 'android:mimeType': 'application/wastickers' } },
        { $: { 'android:mimeType': 'application/wasticker' } },
        { $: { 'android:mimeType': 'image/webp.wasticker' } },
        { $: { 'android:mimeType': 'image/webp.wastickers' } },
        { $: { 'android:mimeType': 'application/zip' } },
        { $: { 'android:mimeType': 'application/octet-stream' } },
        { $: { 'android:mimeType': 'image/webp' } },
        { $: { 'android:mimeType': 'image/png' } },
      ],
    },
    {
      action: [{ $: { 'android:name': 'android.intent.action.SEND_MULTIPLE' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        { $: { 'android:mimeType': 'image/webp' } },
        { $: { 'android:mimeType': 'image/png' } },
        { $: { 'android:mimeType': 'image/*' } },
        { $: { 'android:mimeType': 'application/octet-stream' } },
      ],
    }
  );

  mainActivity['intent-filter'] = preservedFilters;
  return manifest;
}

function patchMainActivitySource(src) {
  let out = src;
  if (!out.includes('import android.content.Intent')) {
    out = out.replace('import android.os.Build', 'import android.content.Intent\nimport android.os.Build');
  }
  if (!out.includes('StickerIntentHandler.handleIntent(this, intent)')) {
    out = out.replace(
      'super.onCreate(null)',
      'super.onCreate(null)\n    StickerIntentHandler.handleIntent(this, intent)'
    );
  }
  if (!out.includes('override fun onNewIntent(')) {
    out = out.replace(
      'override fun getMainComponentName(): String = "main"',
      'override fun onNewIntent(intent: Intent) {\n    super.onNewIntent(intent)\n    setIntent(intent)\n    StickerIntentHandler.handleIntent(this, intent)\n  }\n\n  override fun getMainComponentName(): String = "main"'
    );
  }
  return out;
}

function patchMainApplicationSource(src) {
  if (src.includes('StickerIntentPackage()')) return src;
  return src.replace(
    '// add(MyReactNativePackage())',
    '// add(MyReactNativePackage())\n          add(StickerIntentPackage())'
  );
}

function withStickerSupport(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'com.whatsapp.sticker.READ',
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    applyManifestStickerFilters(modConfig.modResults.manifest);
    return modConfig;
  });

  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const targetFile = path.join(
        modConfig.modRequest.platformProjectRoot,
        'app/src/main/java/com/kavindu/chatter/StickerIntentModule.kt'
      );
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, STICKER_INTENT_KOTLIN, 'utf8');
      return modConfig;
    },
  ]);

  config = withMainActivity(config, (modConfig) => {
    modConfig.modResults.contents = patchMainActivitySource(modConfig.modResults.contents);
    return modConfig;
  });

  config = withMainApplication(config, (modConfig) => {
    modConfig.modResults.contents = patchMainApplicationSource(modConfig.modResults.contents);
    return modConfig;
  });

  return config;
}

withStickerSupport.STICKER_INTENT_KOTLIN = STICKER_INTENT_KOTLIN;
withStickerSupport.applyManifestStickerFilters = applyManifestStickerFilters;
withStickerSupport.patchMainActivitySource = patchMainActivitySource;
withStickerSupport.patchMainApplicationSource = patchMainApplicationSource;

module.exports = withStickerSupport;
