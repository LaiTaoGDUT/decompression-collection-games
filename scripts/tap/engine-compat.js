/* Cocos 3.8.8 微信引擎读取 devicePixelRatio；Tap 对应字段为 pixelRatio。 */
GameGlobal.__tapCocosGetSystemInfo = function () {
    var system = tap.getSystemInfoSync();
    var windowInfo = typeof tap.getWindowInfo === 'function' ? tap.getWindowInfo() : {};
    var result = Object.assign({}, system, windowInfo);
    var ratio = result.devicePixelRatio || result.pixelRatio || 1;
    result.devicePixelRatio = ratio;
    result.pixelRatio = ratio;
    result.SDKVersion = result.SDKVersion || result.tapSDKVersion || '0.0.0';
    return result;
};
