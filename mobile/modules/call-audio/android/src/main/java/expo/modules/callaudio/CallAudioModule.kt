package expo.modules.callaudio

import android.app.PictureInPictureParams
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Rational
import android.view.WindowManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallAudioModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private var proximityWakeLock: PowerManager.WakeLock? = null
  private var audioFocusRequest: AudioFocusRequest? = null
  private var legacyAudioFocusGranted = false
  private var ringtonePlayer: MediaPlayer? = null
  private var fallbackRingtone: Ringtone? = null
  private var ringbackToneGen: ToneGenerator? = null
  private val ringHandler = Handler(Looper.getMainLooper())
  private var ringbackRunnable: Runnable? = null

  override fun definition() = ModuleDefinition {
    Name("CallAudio")

    Function("startCallAudio") { speakerOn: Boolean, proximityEnabled: Boolean ->
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      requestCallAudioFocus(audioManager)
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      applySpeakerRoute(audioManager, speakerOn)
      updateProximityLock(proximityEnabled)
      return@Function true
    }

    Function("setSpeakerphoneOn") { enabled: Boolean ->
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      return@Function applySpeakerRoute(audioManager, enabled)
    }

    Function("setProximityEnabled") { enabled: Boolean ->
      updateProximityLock(enabled)
      return@Function true
    }

    Function("stopCallAudio") {
      stopRingingInternal()
      cleanupCallAudio()
      return@Function true
    }

    Function("playIncomingRingtone") {
      playIncomingRingtoneInternal()
      return@Function true
    }

    Function("playOutgoingRingback") {
      playOutgoingRingbackInternal()
      return@Function true
    }

    Function("stopRinging") {
      stopRingingInternal()
      return@Function true
    }

    Function("enterPictureInPicture") { widthRatio: Int, heightRatio: Int ->
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return@Function false
      }
      if (!activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) {
        return@Function false
      }

      val w = if (widthRatio > 0) widthRatio else 9
      val h = if (heightRatio > 0) heightRatio else 16

      activity.runOnUiThread {
        try {
          val params = PictureInPictureParams.Builder()
            .setAspectRatio(Rational(w, h))
            .build()
          activity.enterPictureInPictureMode(params)
        } catch (_: Exception) {
          // Safe fallback if activity is finishing or backgrounded without permission
        }
      }
      return@Function true
    }

    Function("isInPictureInPictureMode") {
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        return@Function activity.isInPictureInPictureMode
      }
      return@Function false
    }

    Function("setScreenshotProtection") { enabled: Boolean ->
      val activity = appContext.currentActivity ?: return@Function false
      activity.runOnUiThread {
        try {
          if (enabled) {
            activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
          } else {
            activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
          }
        } catch (_: Exception) {
        }
      }
      return@Function true
    }

    OnDestroy {
      cleanupCallAudio()
    }
  }

  private fun requestCallAudioFocus(audioManager: AudioManager) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        if (audioFocusRequest == null) {
          val attributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
          audioFocusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes)
            .setAcceptsDelayedFocusGain(true)
            .setOnAudioFocusChangeListener {}
            .build()
        }
        audioFocusRequest?.let { audioManager.requestAudioFocus(it) }
      } else {
        @Suppress("DEPRECATION")
        val res = audioManager.requestAudioFocus(
          null,
          AudioManager.STREAM_VOICE_CALL,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
        )
        legacyAudioFocusGranted = (res == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
      }
    } catch (_: Exception) {
    }
  }

  private fun applySpeakerRoute(audioManager: AudioManager, useSpeaker: Boolean): Boolean {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val devices = audioManager.availableCommunicationDevices
        val targetDevice = if (useSpeaker) {
          devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
        } else {
          // Prefer connected Bluetooth or wired headset before falling back to phone earpiece
          devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLE_HEADSET }
            ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
            ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET }
            ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_USB_HEADSET }
            ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
        }

        if (targetDevice != null) {
          val ok = audioManager.setCommunicationDevice(targetDevice)
          @Suppress("DEPRECATION")
          audioManager.isSpeakerphoneOn = useSpeaker
          ok
        } else {
          @Suppress("DEPRECATION")
          audioManager.isSpeakerphoneOn = useSpeaker
          true
        }
      } else {
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = useSpeaker
        true
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun updateProximityLock(enabled: Boolean) {
    try {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (enabled) {
        if (!powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
          return
        }
        if (proximityWakeLock == null) {
          proximityWakeLock = powerManager.newWakeLock(
            PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
            "Chatter:CallProximity"
          ).apply {
            setReferenceCounted(false)
          }
        }
        proximityWakeLock?.let { lock ->
          if (!lock.isHeld) {
            // 2-hour max failsafe timeout
            lock.acquire(2 * 60 * 60 * 1000L)
          }
        }
      } else {
        releaseProximityLock()
      }
    } catch (_: Exception) {
    }
  }

  private fun releaseProximityLock() {
    try {
      proximityWakeLock?.let { lock ->
        if (lock.isHeld) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            lock.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
          } else {
            lock.release()
          }
        }
      }
    } catch (_: Exception) {
    }
  }

  @Synchronized
  private fun playIncomingRingtoneInternal() {
    stopRingingInternal()
    try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (audioManager.ringerMode != AudioManager.RINGER_MODE_NORMAL) {
        return
      }
      val ringtoneUri = RingtoneManager.getActualDefaultRingtoneUri(
        context,
        RingtoneManager.TYPE_RINGTONE
      ) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) ?: return

      try {
        val player = MediaPlayer().apply {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build()
          )
          setDataSource(context, ringtoneUri)
          isLooping = true
          prepare()
          start()
        }
        ringtonePlayer = player
      } catch (_: Exception) {
        val ringtone = RingtoneManager.getRingtone(context, ringtoneUri)
        if (ringtone != null) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ringtone.isLooping = true
          }
          ringtone.play()
          fallbackRingtone = ringtone
        }
      }
    } catch (_: Exception) {
    }
  }

  @Synchronized
  private fun playOutgoingRingbackInternal() {
    stopRingingInternal()
    try {
      val gen = ToneGenerator(AudioManager.STREAM_VOICE_CALL, 72)
      ringbackToneGen = gen
      val runnable = object : Runnable {
        override fun run() {
          try {
            ringbackToneGen?.startTone(ToneGenerator.TONE_SUP_RINGTONE, 1200)
          } catch (_: Exception) {
          }
          ringHandler.postDelayed(this, 3200L)
        }
      }
      ringbackRunnable = runnable
      ringHandler.post(runnable)
    } catch (_: Exception) {
    }
  }

  @Synchronized
  private fun stopRingingInternal() {
    try {
      ringbackRunnable?.let { ringHandler.removeCallbacks(it) }
    } catch (_: Exception) {
    }
    ringbackRunnable = null

    try {
      ringbackToneGen?.stopTone()
      ringbackToneGen?.release()
    } catch (_: Exception) {
    }
    ringbackToneGen = null

    try {
      ringtonePlayer?.apply {
        if (isPlaying) stop()
        release()
      }
    } catch (_: Exception) {
    }
    ringtonePlayer = null

    try {
      fallbackRingtone?.stop()
    } catch (_: Exception) {
    }
    fallbackRingtone = null
  }

  private fun cleanupCallAudio() {
    stopRingingInternal()
    releaseProximityLock()
    try {
      val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        audioManager.clearCommunicationDevice()
      }
      @Suppress("DEPRECATION")
      audioManager.isSpeakerphoneOn = false
      audioManager.mode = AudioManager.MODE_NORMAL

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
      } else if (legacyAudioFocusGranted) {
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(null)
        legacyAudioFocusGranted = false
      }
    } catch (_: Exception) {
    }
  }
}
