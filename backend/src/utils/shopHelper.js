/**
 * Resolves effective shopId for a request.
 * Priorities: req.query.shopId -> req.body.shopId -> req.headers['x-shop-id'] -> req.params.shopId -> default shopId ('shop_${shopkeeperId}')
 */
function getEffectiveShopId(req) {
  const authShopkeeperId = req.shopkeeper && req.shopkeeper.shopkeeperId;
  const rawShopId = (req.query && req.query.shopId) ||
    (req.body && req.body.shopId) ||
    (req.headers && req.headers['x-shop-id']) ||
    (req.params && req.params.shopId);

  if (rawShopId && typeof rawShopId === 'string' && rawShopId.trim()) {
    return rawShopId.trim();
  }

  return authShopkeeperId ? `shop_${authShopkeeperId}` : null;
}

/**
 * Checks if a document belongs to the effective shopId.
 * Handles legacy backward compatibility where documents may not have `shopId` stored yet.
 */
function isDocInShop(docData, effectiveShopId, shopkeeperId) {
  if (!docData) return false;
  const docShopId = docData.shopId;
  const defaultShopId = `shop_${shopkeeperId}`;

  if (docShopId) {
    return docShopId === effectiveShopId;
  }

  // Legacy fallback: if doc has no shopId, it belongs to the default shop
  return effectiveShopId === defaultShopId;
}

module.exports = {
  getEffectiveShopId,
  isDocInShop,
};
