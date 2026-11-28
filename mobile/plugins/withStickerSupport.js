const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Config plugin registering Android intent-filters so users can tap `.wastickers`
 * packs or share sticker archives directly into Chatter ("Open with Chatter").
 */
module.exports = function withStickerSupport(config) {
  return withAndroidManifest(config, (modConfig) => {
    const application = modConfig.modResults.manifest.application?.[0];
    if (!application || !Array.isArray(application.activity)) {
      return modConfig;
    }

    const mainActivity = application.activity.find(
      (act) => act.$?.['android:name'] === '.MainActivity'
    );
    if (!mainActivity) return modConfig;

    if (!Array.isArray(mainActivity['intent-filter'])) {
      mainActivity['intent-filter'] = [];
    }

    const existingMarker = mainActivity['intent-filter'].some((f) =>
      f.data?.some(
        (d) =>
          d.$?.['android:mimeType'] === 'application/vnd.wastickers' ||
          d.$?.['android:pathPattern'] === '.*\\.wastickers'
      )
    );
    if (existingMarker) return modConfig;

    const viewCategory = [
      { $: { 'android:name': 'android.intent.category.DEFAULT' } },
      { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
    ];

    // 1. Open .wastickers files via explicit WhatsApp sticker MIME types
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: viewCategory,
      data: [
        { $: { 'android:mimeType': 'application/vnd.wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/vnd.wastickers', 'android:scheme': 'file' } },
        { $: { 'android:mimeType': 'application/x-wastickers', 'android:scheme': 'content' } },
        { $: { 'android:mimeType': 'application/x-wastickers', 'android:scheme': 'file' } },
      ],
    });

    // 2. Open .wastickers files served as generic octet-stream/zip by file managers or browsers
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
      category: viewCategory,
      data: [
        {
          $: {
            'android:scheme': 'content',
            'android:host': '*',
            'android:mimeType': '*/*',
            'android:pathPattern': '.*\\.wastickers',
          },
        },
        {
          $: {
            'android:scheme': 'content',
            'android:host': '*',
            'android:mimeType': '*/*',
            'android:pathPattern': '.*\\..*\\.wastickers',
          },
        },
        {
          $: {
            'android:scheme': 'file',
            'android:host': '*',
            'android:mimeType': '*/*',
            'android:pathPattern': '.*\\.wastickers',
          },
        },
        {
          $: {
            'android:scheme': 'file',
            'android:host': '*',
            'android:mimeType': '*/*',
            'android:pathPattern': '.*\\..*\\.wastickers',
          },
        },
      ],
    });

    // 3. Receive shared .wastickers / sticker files via Android Share Sheet
    mainActivity['intent-filter'].push({
      action: [{ $: { 'android:name': 'android.intent.action.SEND' } }],
      category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      data: [
        { $: { 'android:mimeType': 'application/vnd.wastickers' } },
        { $: { 'android:mimeType': 'application/x-wastickers' } },
        { $: { 'android:mimeType': 'application/zip' } },
      ],
    });

    return modConfig;
  });
};
