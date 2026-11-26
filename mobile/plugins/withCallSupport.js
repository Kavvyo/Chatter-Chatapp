const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/**
 * Config plugin enabling Android System Picture-in-Picture (PiP) on MainActivity
 * and declaring call notification/audio permissions cleanly.
 */
module.exports = function withCallSupport(config) {
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.USE_FULL_SCREEN_INTENT',
    'android.permission.POST_NOTIFICATIONS',
    'android.permission.BLUETOOTH_CONNECT',
  ]);

  config = withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application || !Array.isArray(application.activity)) {
      return modConfig;
    }

    const mainActivity = application.activity.find(
      (act) => act.$?.['android:name'] === '.MainActivity'
    );

    if (mainActivity && mainActivity.$) {
      mainActivity.$['android:supportsPictureInPicture'] = 'true';
      mainActivity.$['android:resizeableActivity'] = 'true';
    }

    return modConfig;
  });

  return config;
};
