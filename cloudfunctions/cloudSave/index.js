'use strict';

const cloud = require('wx-server-sdk');
const { createHandler, identityFromContext } = require('./handler');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 仅文档不存在时返回 null；权限、集合不存在、网络错误仍然抛出。
const db = cloud.database({ throwOnNotFound: false });
const handle = createHandler(db);

exports.main = async (event, context) => {
    // 身份来自本次调用的可信 context，不接受 event.openid，也不读取可能残留的进程环境身份。
    return handle(event, identityFromContext(context));
};
