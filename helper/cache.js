const NodeCache = require('node-cache');

const productCache = new NodeCache({ stdTTL: 600 }); // 10 minutes
const filterCache = new NodeCache({ stdTTL: 3600 }); // 1 hour

module.exports = { productCache, filterCache };